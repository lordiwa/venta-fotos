// Dobles en memoria de Firestore y Storage (sin emuladores): permiten intercalar una escritura concurrente en un
// punto exacto del flujo. Compartidos por coverSync.test.ts y process.test.ts.
import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import type { Bucket } from "@google-cloud/storage";

type Data = Record<string, unknown>;
type Hook = (name: string) => Promise<void> | void;

export function fakes() {
  const docs = new Map<string, { data: Data; t: number }>();
  const files = new Map<string, { gen: number; buf: Buffer; opts?: Data }>();
  let clock = 1;
  let gen = 1;
  const hooks: { beforeGet?: Hook; beforeSave?: Hook; beforeList?: Hook; beforeDelete?: Hook } = {};
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
      save: async (buf: Buffer, opts?: Data) => { await once("beforeSave", name); files.set(name, { gen: ++gen, buf, opts }); f.metadata = { generation: String(gen) }; },
      delete: async (o: { ignoreNotFound?: boolean; ifGenerationMatch?: number | string } = {}) => {
        await once("beforeDelete", name);
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
