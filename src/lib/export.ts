import type { ItemInventario } from "@/lib/api";
export function download(content: string, filename: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
export function csv(rows: Record<string, unknown>[]) {
  const keys = Object.keys(rows[0] ?? {});
  const cell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  return (
    "\ufeff" +
    [keys.map(cell).join(","), ...rows.map((r) => keys.map((k) => cell(r[k])).join(","))].join(
      "\r\n",
    )
  );
}
export async function exportInventory(
  items: ItemInventario[],
  stocks: Map<string, number>,
  type: "excel" | "pdf",
) {
  const rows = items.map((i) => ({
    SKU: i.sku,
    Descripción: i.descripcion,
    Categoría: i.categoria,
    Marca: i.marca_referencia,
    Stock: stocks.get(i.sku) ?? 0,
    Unidad: i.unidad,
    Estado: i.estado,
    Ubicación: i.ubicacion,
    Mínimo: i.stock_minimo,
  }));
  if (type === "excel") {
    const XLSX = await import("xlsx");
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), "Inventario");
    XLSX.writeFile(book, "inventario-ioting.xlsx");
  } else {
    const { jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF({ orientation: "landscape" });
    doc.text("IoTing Dev — Inventario", 14, 15);
    autoTable(doc, {
      startY: 23,
      head: [["SKU", "Descripción", "Categoría", "Stock", "Estado", "Ubicación"]],
      body: rows.map((r) => [r.SKU, r.Descripción, r.Categoría, r.Stock, r.Estado, r.Ubicación]),
      styles: { fontSize: 8 },
    });
    doc.save("inventario-ioting.pdf");
  }
}

export const NOTA_VALOR = "Estimación interna de gestión; no reemplaza la contabilidad (Alegra).";

export interface ExportValorArgs {
  resumen: import("./valoracion").ResumenValor;
  detalle: import("./valoracion").DetalleValor[];
  filtros: string;
  type: "excel" | "pdf";
}

/** Exporta las tres cifras y el detalle por ítem. Los números ya vienen calculados. */
export async function exportValor({ resumen, detalle, filtros, type }: ExportValorArgs) {
  const cifras = [
    { Cifra: "Invertido", COP: resumen.invertido },
    { Cifra: "Existencia a costo", COP: resumen.existencia },
    { Cifra: "Valor estimado actual", COP: resumen.estimado },
    { Cifra: "Ítems con valor", COP: resumen.conValor },
    { Cifra: "Ítems sin valor (excluidos)", COP: resumen.sinValor },
  ];
  const filas = detalle.map((d) => ({
    SKU: d.sku,
    Descripción: d.descripcion,
    Grupo: d.grupo,
    Categoría: d.categoria,
    "Año de compra": d.anioCompra ?? "",
    Stock: d.stock,
    "Valor unitario": d.valorUnitario ?? "Sin valor",
    "Existencia a costo": d.existencia ?? "",
    "Valor estimado": d.estimado ?? "",
    Invertido: d.invertido ?? "",
  }));
  if (type === "excel") {
    const XLSX = await import("xlsx");
    const book = XLSX.utils.book_new();
    const resumenHoja = XLSX.utils.json_to_sheet([
      ...cifras,
      {},
      { Cifra: NOTA_VALOR },
      { Cifra: `Filtros: ${filtros}` },
    ]);
    XLSX.utils.book_append_sheet(book, resumenHoja, "Resumen");
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(filas), "Detalle");
    XLSX.writeFile(book, "valor-inventario-ioting.xlsx");
  } else {
    const { jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF({ orientation: "landscape" });
    doc.text("IoTing Dev — Valor del inventario", 14, 15);
    doc.setFontSize(8);
    doc.text(NOTA_VALOR, 14, 21);
    doc.text(`Filtros: ${filtros}`, 14, 25);
    autoTable(doc, {
      startY: 29,
      head: [["Cifra", "Valor"]],
      body: cifras.map((c) => [c.Cifra, String(c.COP)]),
      styles: { fontSize: 8 },
    });
    autoTable(doc, {
      head: [["SKU", "Descripción", "Grupo", "Stock", "Valor unit.", "Existencia", "Estimado"]],
      body: filas.map((r) => [
        r.SKU,
        r.Descripción,
        r.Grupo,
        r.Stock,
        r["Valor unitario"],
        r["Existencia a costo"],
        r["Valor estimado"],
      ]),
      styles: { fontSize: 7 },
    });
    doc.save("valor-inventario-ioting.pdf");
  }
}
