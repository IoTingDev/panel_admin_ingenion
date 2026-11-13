// Contraprueba del INSTRUMENTO (CLAUDE.md §9): la compuerta debe fallar con cada defecto y pasar con
// texto legitimo. Los defectos se construyen con CODIGOS NUMERICOS (este archivo no contiene los
// caracteres corruptos) en un repositorio git temporal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const verificador = fileURLToPath(new URL("./verificar.mjs", import.meta.url));
function conRepo(archivos) {
  const d = mkdtempSync(join(tmpdir(), "cod-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: d });
    for (const [n, contenido] of Object.entries(archivos)) writeFileSync(join(d, n), contenido);
    execFileSync("git", ["add", "-A"], { cwd: d });
    const r = spawnSync("node", [verificador, d], { encoding: "utf8" });
    return { codigo: r.status, salida: r.stdout };
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}
const utf8 = (s) => Buffer.from(s, "utf8");
const c = (...n) => String.fromCharCode(...n);
// o con acento (0xF3) leido como ANSI y escrito de nuevo como UTF-8 -> 0xC3 0xB3
const MOJIBAKE_O = utf8("Despertando" + c(0xc3, 0xb3) + "n");
// puntos suspensivos (0x2026) leidos como ANSI y reescritos -> 0xE2 0x20AC 0xA6
const MOJIBAKE_PUNTOS = utf8("base de datos" + c(0xe2, 0x20ac, 0xa6));
const LEGITIMO =
  "Se" +
  c(0xf1) +
  "alizaci" +
  c(0xf3) +
  "n " +
  c(0xab) +
  "Despertando la base de datos" +
  c(0x2026) +
  c(0xbb) +
  " " +
  c(0xbf) +
  "qu" +
  c(0xe9) +
  "?\n";

test("control positivo: texto UTF-8 legitimo (acentos, enie, comillas angulares, puntos suspensivos) pasa", () => {
  const r = conRepo({ "a.md": utf8(LEGITIMO) });
  assert.equal(r.codigo, 0, r.salida);
  assert.match(r.salida, /1 archivos revisados, 0 con fallo/);
});
test("sabotaje: BOM al principio falla", () => {
  const r = conRepo({
    "a.ts": Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), utf8("const a = 1;\n")]),
  });
  assert.equal(r.codigo, 1);
  assert.match(r.salida, /tiene BOM/);
});
test("sabotaje: texto corrupto por doble codificacion falla (dos variantes)", () => {
  assert.match(conRepo({ "a.ts": MOJIBAKE_O }).salida, /doble codificacion/);
  assert.match(conRepo({ "b.ts": MOJIBAKE_PUNTOS }).salida, /doble codificacion/);
  assert.equal(conRepo({ "a.ts": MOJIBAKE_O }).codigo, 1);
});
test("sabotaje: bytes que no son UTF-8 y el caracter de reemplazo fallan", () => {
  assert.match(
    conRepo({ "a.ts": Buffer.from([0x63, 0xf3, 0x6d, 0x6f]) }).salida,
    /no es UTF-8 valido/,
  );
  assert.match(conRepo({ "b.ts": utf8("a" + c(0xfffd) + "b") }).salida, /0xFFFD/);
});
test("un repositorio sin archivos de texto NO confirma nada: falla (0 revisados)", () => {
  const r = conRepo({ "imagen.bin": Buffer.from([1, 2, 3]) });
  assert.equal(r.codigo, 1);
  assert.match(r.salida, /0 archivos revisados/);
});
