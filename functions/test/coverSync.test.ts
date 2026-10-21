// Orquestacion de syncCover/syncCoverForPhoto con dobles en memoria de Firestore y Storage (test/fakes.ts).
import { describe, it, expect, beforeAll } from "vitest";
import sharp from "sharp";
import { syncCover, syncCoverForPhoto } from "../src/cover";
import { coverFilePath } from "../src/coverLogic";
import { makeCover } from "../src/image";
import { CACHE_CONTROL } from "../src/derived";
import { fakes } from "./fakes";

type Data = Record<string, unknown>;

let jpeg: Buffer;
let COVER: string; // TASK-033: covers/e/p.{hash}.webp de la portada que sale de `jpeg`
beforeAll(async () => {
  jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#4080c0" } }).jpeg().toBuffer();
  COVER = coverFilePath("e", "p", await makeCover(jpeg));
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
      if (name !== COVER) return;
      f.hooks.beforeSave = undefined;
      f.write("events/e/photos/p", { visible: false }); // el admin oculta la foto...
      await syncCoverForPhoto(f.db, f.bucket, "e", "p", visible, hidden); // ...y su disparo corre entero aqui
    };
    await syncCover(f.db, f.bucket, "e", { coverPhotoId: "p" });
    expect(f.docs.get("events/e")!.data.coverPath).toBeUndefined();
    expect(f.files.has(COVER)).toBe(false);
  });

  // Previene (M-3): que al retirar la portada de una foto oculta se borre el archivo pero coverPath siga apuntando a
  // el (la quita condicionada a lastUpdateTime fallaba si el evento se editaba entretanto, y el archivo se borraba igual).
  it("retirar la portada con el evento editado en paralelo: coverPath se quita y luego el archivo", async () => {
    const f = seed({ coverPhotoId: "p", coverPath: COVER });
    f.files.set(COVER, { gen: 50, buf: jpeg });
    f.write("events/e/photos/p", { visible: false });
    f.hooks.beforeGet = (path) => {
      if (path !== "events/e/photos/p") return;
      f.hooks.beforeGet = undefined;
      f.write("events/e", { name: "E editado" }); // el admin guarda el evento justo despues de leerlo la Function
    };
    await syncCoverForPhoto(f.db, f.bucket, "e", "p", visible, hidden);
    expect(f.docs.get("events/e")!.data.coverPath).toBeUndefined();
    expect(f.files.has(COVER)).toBe(false);
  });

  // Previene (M-5): que ocultar y volver a mostrar la portada deje coverPath apuntando a un archivo borrado para
  // siempre (la limpieza del retiro listaba y borraba la portada que el disparo de "mostrar" acababa de publicar).
  it("ocultar y mostrar en seguida: la portada regenerada sobrevive a la limpieza del retiro", async () => {
    const f = seed({ coverPhotoId: "p", coverPath: COVER });
    f.files.set(COVER, { gen: 50, buf: jpeg });
    f.write("events/e/photos/p", { visible: false });
    f.hooks.beforeList = async () => {
      f.hooks.beforeList = undefined; // el retiro (B) ya quito coverPath; antes de listar, el admin la muestra (C)
      f.write("events/e/photos/p", { visible: true });
      await syncCoverForPhoto(f.db, f.bucket, "e", "p", hidden, visible);
    };
    await syncCoverForPhoto(f.db, f.bucket, "e", "p", visible, hidden);
    expect(f.docs.get("events/e")!.data.coverPath).toBe(COVER);
    expect(f.files.has(COVER)).toBe(true);
  });

  // Previene (M-6): que un commit ambiguo (aplicado, pero el cliente recibe error) deje coverPath apuntando a un
  // archivo que el manejo del error acaba de borrar; ni el trigger ni el backfill lo reparaban despues.
  it("commit ambiguo al publicar: el archivo publicado no se borra", async () => {
    const f = seed({ coverPhotoId: "p" });
    f.faults.ambiguousCommit = true;
    await syncCover(f.db, f.bucket, "e", { coverPhotoId: "p" }).catch(() => undefined);
    expect(f.docs.get("events/e")!.data.coverPath).toBe(COVER);
    expect(f.files.has(COVER)).toBe(true);
  });

  // Previene (M-7): que un fallo transitorio al borrar deje legible la portada de una foto oculta (o de una portada
  // quitada): el error se relanza para que el trigger reintente, y el reintento converge.
  it("borrado que falla una vez: se relanza y el reintento converge (retiro y clear)", async () => {
    const f = seed({ coverPhotoId: "p", coverPath: COVER });
    f.files.set(COVER, { gen: 50, buf: jpeg });
    f.write("events/e/photos/p", { visible: false });
    f.faults.failDelete = COVER;
    await expect(syncCoverForPhoto(f.db, f.bucket, "e", "p", visible, hidden)).rejects.toThrow();
    expect(f.files.has(COVER)).toBe(true);
    await syncCoverForPhoto(f.db, f.bucket, "e", "p", visible, hidden); // retry: mismo evento
    expect(f.docs.get("events/e")!.data.coverPath).toBeUndefined();
    expect(f.files.has(COVER)).toBe(false);

    const g = seed({ coverPath: COVER }); // portada quitada (coverPhotoId borrado)
    g.files.set(COVER, { gen: 50, buf: jpeg });
    g.faults.failDelete = COVER;
    const after = { coverPath: COVER };
    await expect(syncCover(g.db, g.bucket, "e", after)).rejects.toThrow();
    await syncCover(g.db, g.bucket, "e", after); // retry con el mismo snapshot del disparo
    expect(g.docs.get("events/e")!.data.coverPath).toBeUndefined();
    expect(g.files.has(COVER)).toBe(false);
  });

  // Previene (M-8): que tras publicar la nueva portada falle el borrado de la anterior y el reintento (plan "none")
  // nunca la limpie: covers/e/a.jpg seguiria legible aunque despues se oculte esa foto.
  it("publicada la nueva y fallido el borrado de la anterior: el reintento la borra", async () => {
    const f = seed({ coverPhotoId: "p", coverPath: "covers/e/a.jpg" });
    f.files.set("covers/e/a.jpg", { gen: 40, buf: jpeg });
    f.faults.failDelete = "covers/e/a.jpg";
    const after = { coverPhotoId: "p", coverPath: "covers/e/a.jpg" };
    await expect(syncCover(f.db, f.bucket, "e", after)).rejects.toThrow();
    expect(f.docs.get("events/e")!.data.coverPath).toBe(COVER);
    await syncCover(f.db, f.bucket, "e", after); // retry de syncEventCover con el mismo disparo
    expect(f.files.has("covers/e/a.jpg")).toBe(false);
    expect(f.files.has(COVER)).toBe(true);
  });

  // Previene (TASK-033): servir para siempre la portada VIEJA tras reemplazar el original (cache immutable de un ano en
  // la misma ruta) o dejar publicas la version anterior y el .jpg viejo de la misma foto.
  it("reemplazar el original: portada webp con nombre nuevo y cache largo; la anterior y el .jpg viejo se borran", async () => {
    const f = seed({ coverPhotoId: "p", coverPath: COVER });
    f.files.set(COVER, { gen: 50, buf: jpeg });
    f.files.set("covers/e/p.jpg", { gen: 45, buf: jpeg });
    const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#c04080" } }).png().toBuffer();
    f.files.set("originals/e/p.png", { gen: 60, buf: png });
    const after = { ...visible, originalPath: "originals/e/p.png" };
    f.write("events/e/photos/p", after);
    expect(await syncCoverForPhoto(f.db, f.bucket, "e", "p", visible, after)).toBe("generated");
    const next = coverFilePath("e", "p", await makeCover(png));
    expect(next).not.toBe(COVER);
    expect(f.docs.get("events/e")!.data.coverPath).toBe(next);
    expect(f.files.get(next)!.opts).toMatchObject({ contentType: "image/webp", metadata: { cacheControl: CACHE_CONTROL } });
    expect([...f.files.keys()].filter((n) => n.startsWith("covers/"))).toEqual([next]);
  });

  // Previene: que cada escritura normal de un evento (editar, publicar) liste Storage: coste y latencia en cada guardado.
  it("una escritura normal de un evento sin portada (o con la portada al dia) no lista Storage", async () => {
    const f = seed({});
    expect(await syncCover(f.db, f.bucket, "e", { name: "E2" })).toBe("none");
    expect(await syncCover(f.db, f.bucket, "e", { coverPhotoId: "p", coverPath: COVER })).toBe("none");
    expect(f.calls.getFiles).toBe(0);
  });
});
