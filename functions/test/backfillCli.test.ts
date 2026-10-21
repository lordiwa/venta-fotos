// TASK-033: guardas del CLI de scripts/backfill-webp.mjs (salen antes de conectarse a nada).
import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const script = fileURLToPath(new URL("../../scripts/backfill-webp.mjs", import.meta.url));
const run = (...args: string[]) => {
  // Proyecto demo siempre: si una guarda se rompiera, nunca apunta a produccion.
  const env = { ...process.env, GCLOUD_PROJECT: "demo-venta-fotos" };
  delete env.VITE_FIREBASE_PROJECT_ID;
  delete env.FIRESTORE_EMULATOR_HOST;
  delete env.FIREBASE_STORAGE_EMULATOR_HOST;
  return spawnSync(process.execPath, [script, ...args], { env, encoding: "utf8", timeout: 20000 });
};

describe("backfill-webp CLI (TASK-033)", () => {
  // Previene (R-1/R-6): correr en produccion antes de desplegar las Functions nuevas (las viejas reescriben y borran
  // .jpg y deshacen la portada) o procesar TODOS los eventos por un --event sin valor.
  it("--prod sin --functions-deployed y --event sin id salen con error antes de tocar nada", () => {
    const noDeploy = run("--prod", "--dry-run");
    expect(noDeploy.status).toBe(1);
    expect(noDeploy.stderr).toMatch(/--functions-deployed/);
    for (const args of [["--event"], ["--event", "--dry-run"], ["--event="]]) {
      const r = run(...args, "--prod", "--functions-deployed");
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/--event necesita/);
    }
  });
});
