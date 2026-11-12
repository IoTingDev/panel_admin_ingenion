import { createFileRoute } from '@tanstack/react-router';
import { ClienteDetail } from '@/components/panel/clientes';
import { pageHead } from '@/lib/meta';
export const Route = createFileRoute('/_panel/clientes/$id')({
  head: () => pageHead('Detalle de cliente', 'Información, usuarios, proyectos y actividad del cliente.'),
  component: function C() { return <ClienteDetail id={Route.useParams().id}/>; },
});