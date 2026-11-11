import { useState, Fragment } from 'react';
import { useTheme } from 'next-themes';
import { History, ChevronDown, Download, Sun, Moon, Monitor } from 'lucide-react';
import { useAuditoria, useMe } from '@/hooks/use-api';
import { API_MODE, API_BASE_URL } from '@/lib/api';
import { fmtFechaHora, isoDia } from '@/lib/format';
import { csv, download } from '@/lib/export';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader, EmptyState, Panel } from './common';
import { DataFrame, SearchInput, FilterSelect, usePagination, Loading } from './data-tools';
import { useUi } from './ui-context';

export function AuditoriaView() {
  const { data = [], isLoading } = useAuditoria(); const [q,setQ]=useState(''); const [actor,setActor]=useState(''); const [accion,setAccion]=useState(''); const [entidad,setEntidad]=useState(''); const [desde,setDesde]=useState(''); const [hasta,setHasta]=useState(''); const [open,setOpen]=useState('');
  const rows = data.filter(a => (!actor||a.actor===actor)&&(!accion||a.accion===accion)&&(!entidad||a.entidad===entidad)&&(!desde||isoDia(a.fecha)>=desde)&&(!hasta||isoDia(a.fecha)<=hasta)&&`${a.accion} ${a.detalle} ${a.entidadId}`.toLowerCase().includes(q.toLowerCase()));
  const pg = usePagination(rows,15);
  if (isLoading) return <Loading/>;
  return <><PageHeader eyebrow="Sistema" title="Auditoría" subtitle="Registro inmutable de toda acción que cambia datos." actions={<Button variant="outline" disabled={!rows.length} onClick={() => download(csv(rows.map(a => ({ fecha:a.fecha, actor:a.actor, accion:a.accion, entidad:a.entidad, entidadId:a.entidadId, detalle:a.detalle ?? '' }))),'auditoria-ioting.csv','text/csv')}><Download/>Exportar CSV</Button>}/>
  <div className="mb-5 flex flex-wrap items-end gap-3"><SearchInput value={q} onChange={setQ} placeholder="Buscar en detalle o ID…"/><FilterSelect label="Actor" value={actor} onChange={setActor} options={[...new Set(data.map(a => a.actor))]}/><FilterSelect label="Acción" value={accion} onChange={setAccion} options={[...new Set(data.map(a => a.accion))].sort()}/><FilterSelect label="Entidad" value={entidad} onChange={setEntidad} options={[...new Set(data.map(a => a.entidad))]}/><Input aria-label="Desde" type="date" className="w-40" value={desde} onChange={e => setDesde(e.target.value)}/><Input aria-label="Hasta" type="date" className="w-40" value={hasta} onChange={e => setHasta(e.target.value)}/></div>
  <DataFrame footer={pg.footer}><table className="data-table"><thead><tr><th/><th>Fecha</th><th>Actor</th><th>Acción</th><th>Entidad</th><th>ID</th></tr></thead><tbody>{pg.rows.map(a => <Fragment key={a.id}><tr className="cursor-pointer" onClick={() => setOpen(open===a.id?'':a.id)}><td><ChevronDown className={`size-4 transition-transform ${open===a.id?'rotate-180':''}`}/></td><td className="whitespace-nowrap">{fmtFechaHora(a.fecha)}</td><td>{a.actor}</td><td><span className="code-id">{a.accion}</span></td><td className="capitalize">{a.entidad}</td><td className="code-id max-w-40 truncate">{a.entidadId}</td></tr>{open===a.id && <tr><td/><td colSpan={5} className="bg-muted/50 text-sm">{a.detalle || 'Sin detalle.'}</td></tr>}</Fragment>)}</tbody></table>{!rows.length && <EmptyState icon={History} title="Sin eventos para estos filtros"/>}</DataFrame></>;
}

export function ConfiguracionView() {
  const { data: me } = useMe(); const { theme, setTheme } = useTheme(); const { density, setDensity } = useUi();
  const opt = (v:string, label:string, Icon: typeof Sun) => <Button key={v} variant={theme===v?'default':'outline'} onClick={() => setTheme(v)}><Icon/>{label}</Button>;
  return <><PageHeader eyebrow="Sistema" title="Configuración" subtitle="Preferencias del operador y conexión de datos."/><div className="grid max-w-4xl gap-6"><Panel title="Perfil del operador" className="rounded-xl border p-5"><div className="grid gap-4 sm:grid-cols-3"><div><Label>Nombre</Label><p className="mt-1 font-medium">{me?.nombre}</p></div><div><Label>Correo</Label><p className="mt-1 break-all">{me?.email}</p></div><div><Label>Rol</Label><p className="mt-1">{me?.rol}</p></div></div></Panel><Panel title="Tema" className="rounded-xl border p-5"><div className="flex flex-wrap gap-2">{opt('light','Claro',Sun)}{opt('dark','Oscuro',Moon)}{opt('system','Sistema',Monitor)}</div></Panel><Panel title="Densidad de tablas" className="rounded-xl border p-5"><div className="flex gap-2"><Button variant={density==='comoda'?'default':'outline'} onClick={() => setDensity('comoda')}>Cómoda</Button><Button variant={density==='compacta'?'default':'outline'} onClick={() => setDensity('compacta')}>Compacta</Button></div></Panel><Panel title="Conexión" className="rounded-xl border p-5"><p className="mb-4 text-sm text-muted-foreground">Solo informativo. El modo se cambia con la variable VITE_API_MODE.</p><dl className="grid gap-4 sm:grid-cols-2 text-sm"><div><dt className="text-xs text-muted-foreground">Modo de datos</dt><dd className="code-id mt-1">{API_MODE}</dd></div><div><dt className="text-xs text-muted-foreground">URL base</dt><dd className="code-id mt-1">{API_BASE_URL || '(no configurada)'}</dd></div></dl></Panel></div></>;
}