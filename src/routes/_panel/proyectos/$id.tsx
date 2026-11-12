import { createFileRoute } from '@tanstack/react-router';
import { ProyectoDetail } from '@/components/panel/proyectos';
import { pageHead } from '@/lib/meta';
export const Route = createFileRoute('/_panel/proyectos/$id')({
  head: () => pageHead('Detalle de proyecto', 'Estado, materiales y actividad del proyecto.'),
  component: function C() { return <ProyectoDetail id={Route.useParams().id}/>; },
});