import type { ItemInventario, MovimientoInventario, NuevoMovimiento } from '@/lib/api';
import { stockMap } from './inventario';
export interface ImportRow { line: number; data: NuevoMovimiento; error: string }
function split(line: string) { return (line.match(/("(?:[^"]|"")*"|[^,]*)(,|$)/g) ?? []).map(s => s.replace(/,$/, '').replace(/^"|"$/g, '').replaceAll('""', '"')).filter((_,i,a) => i < a.length - 1); }
export function validateCsv(text: string, items: ItemInventario[], movements: MovimientoInventario[]): ImportRow[] {
  const lines = text.replace(/^\ufeff/, '').trim().split(/\r?\n/); const headers = split(lines.shift() ?? '').map(s => s.trim().toLowerCase());
  if (['fecha','sku','tipo','cantidad','proyecto','nota'].some(h => !headers.includes(h))) throw new Error('Encabezado requerido: fecha,sku,tipo,cantidad,proyecto,nota');
  const stocks = stockMap(items, movements);
  return lines.map((line, index) => { const cols = split(line); const get = (k: string) => cols[headers.indexOf(k)]?.trim() ?? ''; const sku = get('sku'); const rawType = get('tipo'); const quantity = Number(get('cantidad')); const date = get('fecha');
    let error = !stocks.has(sku) ? 'SKU inexistente' : !['Entrada','Salida'].includes(rawType) ? 'Tipo inválido' : !Number.isInteger(quantity) || quantity <= 0 ? 'Cantidad inválida' : Number.isNaN(Date.parse(date)) ? 'Fecha inválida' : '';
    const stock = stocks.get(sku) ?? 0;
    if (!error && rawType === 'Salida' && quantity > stock) error = `Stock insuficiente (${stock})`;
    if (!error) stocks.set(sku, stock + (rawType === 'Entrada' ? quantity : -quantity));
    return { line: index + 2, error, data: { sku, tipo: rawType === 'Entrada' ? 'Entrada' : 'Salida', cantidad: quantity, fecha: Number.isNaN(Date.parse(date)) ? date : new Date(date).toISOString(), proyecto: get('proyecto'), nota: get('nota') } };
  });
}