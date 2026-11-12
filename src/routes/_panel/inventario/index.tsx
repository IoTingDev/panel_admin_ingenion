import { createFileRoute } from '@tanstack/react-router';
import { InventarioView } from '@/components/panel/inventario';
import { pageHead } from '@/lib/meta';
export const Route = createFileRoute('/_panel/inventario/')({
  head: () => pageHead('Inventario', 'Componentes, herramientas y equipos de IoTing Dev.'),
  component: InventarioView,
});