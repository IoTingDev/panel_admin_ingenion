#!/usr/bin/env node
/**
 * COMPUERTA DE CODIFICACION. Rechaza los archivos de texto versionados que tengan:
 *   1. BOM al principio (EF BB BF);
 *   2. bytes que no son UTF-8 valido;
 *   3. el caracter de reemplazo (codigo 0xFFFD);
 *   4. TEXTO CORRUPTO por doble codificacion (mojibake): una vocal acentuada que aparece como dos
 *      caracteres raros, o los puntos suspensivos que aparecen como tres.
 *
 * Por que existe: el 2026-11-13 unos guiones de sabotaje escritos en PowerShell 5.1 leyeron archivos
 * UTF-8 como ANSI y los reescribieron con BOM y texto corrupto; llegaron a `main` (p. ej. el titulo
 * de la pagina de espera). Ninguna prueba lo vio: comparaban fragmentos sin acentos. Esta compuerta
 * lo busca a proposito.
 *
 * Los patrones se construyen con codigos numericos: ESTE archivo no contiene los caracteres que
 * busca (si los contuviera, la compuerta fallaria sobre si misma).
 * Excepciones legitimas: scripts/codificacion/excepciones.json (ruta -> motivo).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const raiz = process.argv[2] ?? ".";
const EXT = /\.(ts|tsx|js|mjs|cjs|json|md|tf|yml|yaml|sql|sh|html|css|py|txt|hcl|toml)$/i;
const c = (n) => String.fromCharCode(n);
const CORRUPTOS = [
  [
    "A-tilde seguida de un simbolo (vocal acentuada doble codificada)",
    new RegExp(c(0xc3) + "[" + c(0x80) + "-" + c(0xbf) + "]"),
  ],
  ["a-circunflejo y euro (puntos suspensivos doble codificados)", new RegExp(c(0xe2) + c(0x20ac))],
  [
    "A-circunflejo seguida de un simbolo (comillas o signos doble codificados)",
    new RegExp(c(0xc2) + "[" + c(0xa0) + "-" + c(0xbf) + "]"),
  ],
];
const REEMPLAZO = c(0xfffd);

const exFile = join(raiz, "scripts/codificacion/excepciones.json");
const excepciones = existsSync(exFile) ? JSON.parse(readFileSync(exFile, "utf8")) : {};

const archivos = execFileSync("git", ["ls-files", "-z"], {
  cwd: raiz,
  encoding: "utf8",
  maxBuffer: 1 << 28,
})
  .split("\0")
  .filter((f) => f && EXT.test(f) && !(f in excepciones));

let revisados = 0;
const fallos = [];
const decodificador = new TextDecoder("utf-8", { fatal: true });
for (const f of archivos) {
  let b;
  try {
    b = readFileSync(join(raiz, f));
  } catch {
    continue; // archivo borrado en el arbol de trabajo
  }
  revisados += 1;
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf)
    fallos.push(`${f}: tiene BOM`);
  let texto;
  try {
    texto = decodificador.decode(b);
  } catch {
    fallos.push(`${f}: no es UTF-8 valido`);
    continue;
  }
  if (texto.includes(REEMPLAZO)) fallos.push(`${f}: contiene el caracter de reemplazo (0xFFFD)`);
  for (const [nombre, re] of CORRUPTOS) {
    const m = re.exec(texto);
    if (m) {
      const linea = texto.slice(0, m.index).split("\n").length;
      fallos.push(`${f}:${linea}: texto corrupto por doble codificacion (${nombre})`);
    }
  }
}
for (const f of fallos) console.log(`FALLA  ${f}`);
console.log(`=== codificacion: ${revisados} archivos revisados, ${fallos.length} con fallo ===`);
// Un guion que no reviso nada no confirma nada (CLAUDE.md 2.7).
process.exit(revisados === 0 || fallos.length > 0 ? 1 : 0);
