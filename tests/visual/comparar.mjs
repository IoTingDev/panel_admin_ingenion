// Compara tests/visual/actual contra tests/visual/baseline y resume las diferencias por captura.
// Uso: node tests/visual/comparar.mjs   (tras MODO=actual playwright test tests/visual)
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const dir = "tests/visual";
const BASE = process.argv[2] ?? "baseline";
const ACTUAL = process.argv[3] ?? "actual";
const base = fs
  .readdirSync(path.join(dir, BASE))
  .filter((f) => f.endsWith(".png"))
  .sort();
const filas = [];
let comparadas = 0;
for (const f of base) {
  const pa = path.join(dir, ACTUAL, f);
  if (!fs.existsSync(pa)) {
    filas.push({ f, estado: "FALTA captura actual" });
    continue;
  }
  const a = PNG.sync.read(fs.readFileSync(path.join(dir, BASE, f)));
  const b = PNG.sync.read(fs.readFileSync(pa));
  comparadas++;
  if (a.width !== b.width || a.height !== b.height) {
    filas.push({ f, estado: `TAMAÑO ${a.width}x${a.height} -> ${b.width}x${b.height}` });
    continue;
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
  // Caja envolvente de los píxeles distintos.
  let x0 = a.width,
    y0 = a.height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < a.height; y++)
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4;
      if (diff.data[i] === 255 && diff.data[i + 1] === 0 && diff.data[i + 2] === 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  fs.mkdirSync(path.join(dir, "diff"), { recursive: true });
  if (n > 0) fs.writeFileSync(path.join(dir, "diff", f), PNG.sync.write(diff));
  filas.push({ f, estado: n === 0 ? "idéntica" : `${n} px · caja x${x0}-${x1} y${y0}-${y1}` });
}
for (const r of filas)
  console.log(`${r.estado === "idéntica" ? "=" : "≠"} ${r.f.padEnd(44)} ${r.estado}`);
const distintas = filas.filter((r) => r.estado !== "idéntica").length;
console.log(`\n=== ${comparadas} comparadas de ${base.length}, ${distintas} con diferencias ===`);

// Capturas nuevas (rutas añadidas por la fase) que aún no tienen línea base.
const nuevas = fs
  .readdirSync(path.join(dir, ACTUAL))
  .filter((f) => f.endsWith(".png") && !base.includes(f));
for (const f of nuevas) console.log(`+ ${f.padEnd(44)} NUEVA (sin línea base)`);
if (nuevas.length) console.log(`=== ${nuevas.length} capturas nuevas ===`);
