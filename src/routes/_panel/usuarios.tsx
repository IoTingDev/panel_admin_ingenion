import { createFileRoute } from '@tanstack/react-router';
import { UsuariosView } from '@/components/panel/usuarios';
import { pageHead } from '@/lib/meta';
export const Route = createFileRoute('/_panel/usuarios')({
  head: () => pageHead('Usuarios', 'Usuarios de los clientes de IoTing Dev.'),
  component: UsuariosView,
});