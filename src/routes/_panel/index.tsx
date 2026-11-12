import { createFileRoute } from '@tanstack/react-router';
import { InicioView } from '@/components/panel/inicio';
import { pageHead } from '@/lib/meta';
export const Route = createFileRoute('/_panel/')({
  head: () => pageHead('Panel de control', 'Vista general de la operación IoTing Dev: clientes, usuarios, proyectos e inventario.'),
  component: InicioView,
});