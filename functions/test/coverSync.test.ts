// Orquestacion de syncCover/syncCoverForPhoto con dobles en memoria de Firestore y Storage (sin emuladores):
// permiten intercalar una escritura concurrente en un punto exacto del flujo.
import { describe, it, expect, beforeAll } from "vitest";
import sharp from "sharp";
import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import type { Bucket } from "@google-cloud/storage";
import { syncCover, syncCoverForPhoto } from "../src/cover";

type Data = Record<string, unknown>;
type Hook = (name: string) => Promise<void> | void;

function fakes() {
  const docs = new Map<string, { data: Data; t: number }>();
  const files = new Map<string, { gen: number; buf: Buffer }>();
  let clock = 1;
  let gen = 1;
  const hooks: { beforeGet?: Hook; beforeSave?: Hook; beforeList?: Hook } = {};
  /** Fallos de un solo uso: commit ambiguo (aplica y lanza) y borrado transitorio de un archivo. */
  const faults: { ambiguousCommit?: boolean; failDelete?: string } = {};
  const calls = { getFiles: 0 };
  const once = async (k: keyof typeof hooks, name: string) => { const h = hooks[k]; if (h) await h(name); };

  const isDelete = (v: unknown) => v instanceof FieldValue && v.isEqual(FieldValue.delete());
  const write = (path: string, patch: Data) => {
    const d = docs.get(path);
    if (!d) throw new Error(`NOT_FOUND ${path}`);
    for (const [k, v] of Object.entries(patch)) if (isDelete(v)) delete d.data[k]; else d.data[k] = v;
    d.t = ++clock;
  };
  const snap = (path: string) => {
    const d = docs.get(path);
    const data = d ? { ...d.data } : undefined;
    return { exists: !!d, data: () => data, get: (k: string) => data?.[k], updateTime: d ? { t: d.t } : undefined };
  };
  const ref = (path: string) => ({
    path,
    get: async () => { await once("beforeGet", path); return snap(path); },
    update: async (patch: Data) => write(path, patch),
  });
  const db = {
    doc: ref,
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
      const pending: [string, Data][] = [];
      const r = await fn({
        get: async (rf: { path: string }) => snap(rf.path),
        update: (rf: { path: string }, patch: Data) => { pending.push([rf.path, patch]); },
      });
      for (const [p, patch] of pending) write(p, patch);
      if (faults.ambiguousCommit && pending.length) { faults.ambiguousCommit = false; throw new Error("DEADLINE_EXCEEDED tras el commit"); }
      return r;
    },
  };

  const apiErr = (code: number) => Object.assign(new Error(String(code)), { code });
  const file = (name: string) => {
    const f = {
      name,
      metadata: {} as Data,
      exists: async () => [files.has(name)],
      download: async () => [files.get(name)!.buf],
      save: async (buf: Buffer) => { await once("beforeSave", name); files.set(name, { gen: ++gen, buf }); f.metadata = { generation: String(gen) }; },
      delete: async (o: { ignoreNotFound?: boolean; ifGenerationMatch?: number | string } = {}) => {
        if (faults.failDelete === name) { faults.failDelete = undefined; throw apiErr(503); }
        const cur = files.get(name);
        if (!cur) { if (o.ignoreNotFound) return; throw apiErr(404); }
        if (o.ifGenerationMatch !== undefined && String(cur.gen) !== String(o.ifGenerationMatch)) throw apiErr(412);
        files.delete(name);
      },
    };
    return f;
  };
  const bucket = {
    file,
    getFiles: async ({ prefix }: { prefix: string }) => { calls.getFiles++; await once("beforeList", prefix); return [
      [...files.entries()].filter(([n]) => n.startsWith(prefix)).map(([n, v]) => ({ ...file(n), metadata: { generation: String(v.gen) } })),
    ]; },
  };
  const set = (path: string, data: Data) => docs.set(path, { data: { ...data }, t: ++clock });
  return { db: db as unknown as Firestore, bucket: bucket as unknown as Bucket, docs, files, hooks, faults, calls, set, write };
}

let jpeg: Buffer;
beforeAll(async () => {
  jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#4080c0" } }).jpeg().toBuffer();
});

const visible = { status: "ready", visible: true, originalPath: "originals/e/p.jpg", thumbPath: "thumbs/e/p.jpg" };
const hidden = { ...visible, visible: false };

function seed(event: Data) {
  const f = fakes();
  f.set("events/e", { name: "E", ...event });
  f.set("events/e/photos/p", visible);
  f.files.set("originals/e/p.jpg", { gen: 1, buf: jpeg });
  return f;
}

describe("syncCover orquestacion (TASK-028)", () => {
  // Previene (R-2): que ocultar la foto MIENTRAS se genera su portada deje publicada una portada de 1920px sin marca
  // de una foto oculta (la generacion terminaba y escribia coverPath sin volver a mirar la foto).
  it("ocultar la foto durante la generacion: no queda coverPath ni archivo", async () => {
    const f = seed({ coverPhotoId: "p" });
    f.hooks.beforeSave = async (name) => {
      if (name !== "covers/e/p.jpg") return;
      f.hooks.beforeSave = undefined;
      f.write("events/e/photos/p", { visible: false }); // el admin oculta la foto...
      await syncCoverForPhoto(f.db, f.bucket, "e", "p", visible, hidden); // ...y su disparo corre entero aqui
    };
    await syncCover(f.db, f.bucket, "e", { coverPhotoId: "p" });
    expect(f.docs.get("events/e")!.data.coverPath).toBeUndefined();
    expect(f.files.has("covers/e/p.jpg")).toBe(false);
  });

  // Previene (M-3): que al retirar la portada de una foto oculta se borre el archivo pero coverPath siga apuntando a
  // el (la quita condicionada a lastUpdateTime fallaba si el evento se editaba entretanto, y el archivo se borraba igual).
  it("retirar la portada con el evento editado en paralelo: coverPath se quita y luego el archivo", async () => {
    const f = seed({ coverPhotoId: "p", coverPath: "covers/e/p.jpg" });
    f.files.set("covers/e/p.jpg", { gen: 50, buf: jpeg });
    f.write("events/e/photos/p", { visible: false });
    f.hooks.beforeGet = (path) => {
      if (path !== "events/e/photos/p") return;
      f.hooks.beforeGet = undefined;
      f.write("events/e", { name: "E editado" }); // el admin guarda el evento justo despues de leerlo la Function
    };
    await syncCoverForPhoto(f.db, f.bucket, "e", "p", visible, hidden);
    expect(f.docs.get("events/e")!.data.coverPath).toBeUndefined();
    expect(f.files.has("covers/e/p.jpg")).toBe(false);
  });

  // Previene (M-5): que ocultar y volver a mostrar la portada deje coverPath apuntando a un archivo borrado para
  // siempre (la limpieza del retiro listaba y borraba la portada que el disparo de "mostrar" acababa de publicar).
  it("ocultar y mostrar en seguida: la portada regenerada sobrevive a la limpieza del retiro", async () => {
    const f = seed({ coverPhotoId: "p", coverPath: "covers/e/p.jpg" });
    f.files.set("covers/e/p.jpg", { gen: 50, buf: jpeg });
    f.write("events/e/photos/p", { visible: false });
    f.hooks.beforeList = async () => {
      f.hooks.beforeList = undefined; // el retiro (B) ya quito coverPath; antes de listar, el admin la muestra (C)
      f.write("events/e/photos/p", { visible: true });
      await syncCoverForPhoto(f.db, f.bucket, "e", "p", hidden, visible);
    };
    await syncCoverForPhoto(f.db, f.bucket, "e", "p", visible, hidden);
    expect(f.docs.get("events/e")!.data.coverPath).toBe("covers/e/p.jpg");
    expect(f.files.has("covers/e/p.jpg")).toBe(true);
  });

  // Previene (M-6): que un commit ambiguo (aplicado, pero el cliente recibe error) deje coverPath apuntando a un
  // archivo que el manejo del error acaba de borrar; ni el trigger ni el backfill lo reparaban despues.
  it("commit ambiguo al publicar: el archivo publicado no se borra", async () => {
    const f = seed({ coverPhotoId: "p" });
    f.faults.ambiguousCommit = true;
    await syncCover(f.db, f.bucket, "e", { coverPhotoId: "p" }).catch(() => undefined);
    expect(f.docs.get("events/e")!.data.coverPath).toBe("covers/e/p.jpg");
    expect(f.files.has("covers/e/p.jpg")).toBe(true);
  });

  // Previene (M-7): que un fallo transitorio al borrar deje legible la portada de una foto oculta (o de una portada
  // quitada): el error se relanza para que el trigger reintente, y el reintento converge.
  it("borrado que falla una vez: se relanza y el reintento converge (retiro y clear)", async () => {
    const f = seed({ coverPhotoId: "p", coverPath: "covers/e/p.jpg" });
    f.files.set("covers/e/p.jpg", { gen: 50, buf: jpeg });
    f.write("events/e/photos/p", { visible: false });
    f.faults.failDelete = "covers/e/p.jpg";
    await expect(syncCoverForPhoto(f.db, f.bucket, "e", "p", visible, hidden)).rejects.toThrow();
    expect(f.files.has("covers/e/p.jpg")).toBe(true);
    await syncCoverForPhoto(f.db, f.bucket, "e", "p", visible, hidden); // retry: mismo evento
    expect(f.docs.get("events/e")!.data.coverPath).toBeUndefined();
    expect(f.files.has("covers/e/p.jpg")).toBe(false);

    const g = seed({ coverPath: "covers/e/p.jpg" }); // portada quitada (coverPhotoId borrado)
    g.files.set("covers/e/p.jpg", { gen: 50, buf: jpeg });
    g.faults.failDelete = "covers/e/p.jpg";
    const after = { coverPath: "covers/e/p.jpg" };
    await expect(syncCover(g.db, g.bucket, "e", after)).rejects.toThrow();
    await syncCover(g.db, g.bucket, "e", after); // retry con el mismo snapshot del disparo
    expect(g.docs.get("events/e")!.data.coverPath).toBeUndefined();
    expect(g.files.has("covers/e/p.jpg")).toBe(false);
  });

  // Previene (M-8): que tras publicar la nueva portada falle el borrado de la anterior y el reintento (plan "none")
  // nunca la limpie: covers/e/a.jpg seguiria legible aunque despues se oculte esa foto.
  it("publicada la nueva y fallido el borrado de la anterior: el reintento la borra", async () => {
    const f = seed({ coverPhotoId: "p", coverPath: "covers/e/a.jpg" });
    f.files.set("covers/e/a.jpg", { gen: 40, buf: jpeg });
    f.faults.failDelete = "covers/e/a.jpg";
    const after = { coverPhotoId: "p", coverPath: "covers/e/a.jpg" };
    await expect(syncCover(f.db, f.bucket, "e", after)).rejects.toThrow();
    expect(f.docs.get("events/e")!.data.coverPath).toBe("covers/e/p.jpg");
    await syncCover(f.db, f.bucket, "e", after); // retry de syncEventCover con el mismo disparo
    expect(f.files.has("covers/e/a.jpg")).toBe(false);
    expect(f.files.has("covers/e/p.jpg")).toBe(true);
  });

  // Previene: que cada escritura normal de un evento (editar, publicar) liste Storage: coste y latencia en cada guardado.
  it("una escritura normal de un evento sin portada (o con la portada al dia) no lista Storage", async () => {
    const f = seed({});
    expect(await syncCover(f.db, f.bucket, "e", { name: "E2" })).toBe("none");
    expect(await syncCover(f.db, f.bucket, "e", { coverPhotoId: "p", coverPath: "covers/e/p.jpg" })).toBe("none");
    expect(f.calls.getFiles).toBe(0);
  });
});
