import { describe, it, expect } from "vitest";
import {
  addFailure, clientIp, contentDisposition, digitalPhotos, emailsMatch, expiresAtMs, isBlocked, isPaidStatus, MAX_FAILURES, ttlDays, WINDOW_MS,
} from "../src/downloadsLogic";

const line = (productId: string, photoId = "p1", eventId = "e1") => ({ eventId, photoId, productId });

describe("downloadsLogic", () => {
  // Previene: rechazar al comprador legitimo por mayusculas/espacios del correo, o aceptar un correo vacio como coincidencia.
  it("CU4/CU5 el correo coincide sin distinguir mayusculas ni espacios; vacio o distinto nunca", () => {
    expect(emailsMatch(" Ana@Mail.COM ", "ana@mail.com")).toBe(true);
    expect(emailsMatch("otra@mail.com", "ana@mail.com")).toBe(false);
    expect(emailsMatch("", "")).toBe(false);
    expect(emailsMatch(undefined, undefined)).toBe(false);
  });

  // Previene: regalar el original de una foto que el comprador solo pidio impresa, o de un pedido en un estado no pagado.
  it("CU6 solo las lineas digitales (sin repetir) dan acceso; solo estados posteriores al pago", () => {
    expect(digitalPhotos([line("a4"), line("digital", "p2"), line("digital", "p2"), line("a5", "p3")])).toEqual([{ eventId: "e1", photoId: "p2" }]);
    expect(digitalPhotos([line("a4")])).toEqual([]);
    for (const s of ["pagado", "impreso", "listo_retiro", "enviado", "entregado"]) expect(isPaidStatus(s)).toBe(true);
    for (const s of ["creado", "captura_pendiente", "", undefined]) expect(isPaidStatus(s)).toBe(false);
  });

  // Previene: enlaces eternos (o mas largos que el maximo de las URLs firmadas v4, que Storage rechaza).
  it("CU3 vencimiento = ahora + dias; los dias fuera de 1..7 usan 7", () => {
    expect(expiresAtMs(1000, 7)).toBe(1000 + 7 * 86400000);
    expect(expiresAtMs(0, 1)).toBe(86400000);
    for (const v of [0, 8, 30, 1.5, "7", undefined, -1]) expect(ttlDays(v)).toBe(7);
    expect(ttlDays(3)).toBe(3);
  });

  // Previene: adivinar numero+correo por fuerza bruta (CU7) o bloquear para siempre a un comprador legitimo.
  it("CU7 bloquea al llegar al maximo de fallos dentro de la ventana y se libera al vencer", () => {
    let s = undefined as ReturnType<typeof addFailure> | undefined;
    for (let i = 0; i < MAX_FAILURES - 1; i++) s = addFailure(s, 1000);
    expect(isBlocked(s, 1000)).toBe(false);
    s = addFailure(s, 1000);
    expect(isBlocked(s, 1000 + WINDOW_MS - 1)).toBe(true);
    expect(isBlocked(s, 1000 + WINDOW_MS)).toBe(false);
    expect(addFailure(s, 1000 + WINDOW_MS)).toEqual({ count: 1, windowStart: 1000 + WINDOW_MS });
    expect(isBlocked(undefined, 5)).toBe(false);
  });

  // Previene: saltarse el limite por IP escribiendo un X-Forwarded-For falso (la clave de conteo no debe cambiar).
  it("W-1 un X-Forwarded-For falso al inicio no cambia la IP usada para limitar", () => {
    expect(clientIp("9.9.9.9, 203.0.113.7")).toBe("203.0.113.7");
    expect(clientIp("1.1.1.1, 2.2.2.2, 203.0.113.7")).toBe(clientIp("203.0.113.7"));
    expect(clientIp(undefined, "10.0.0.1")).toBe("10.0.0.1");
  });

  // Previene: descargar sin extension o con nombre roto (RFC 6266: filename* UTF-8 + respaldo ASCII).
  it("el nombre de descarga lleva extension, filename* UTF-8 y respaldo ASCII", () => {
    expect(contentDisposition("Niño \"A\"", "originals/e1/p1.jpg")).toBe(
      "attachment; filename=\"Ni_o _A_.jpg\"; filename*=UTF-8''Ni%C3%B1o%20%22A%22.jpg",
    );
    expect(contentDisposition("a\\b", "originals/e1/p1.jpg")).toContain("filename=\"a_b.jpg\"");
    expect(contentDisposition("foto.png", "originals/e1/p1.png")).toContain("filename=\"foto.png\"");
  });
});
