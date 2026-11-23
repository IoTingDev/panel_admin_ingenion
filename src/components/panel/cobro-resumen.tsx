import type { Cuota, ModalidadSuscripcion } from "@/lib/api/types";
import { desglose } from "@/lib/desglose";
import { ROTULO_MODALIDAD } from "@/lib/dominio";
import { fmtCop, fmtFecha } from "@/lib/format";
import { hoyBogota } from "@/lib/inventario";
import { resumenPagos } from "@/lib/pagos";
import { rotuloSuscripcion } from "@/lib/cobro";
import { Button } from "@/components/ui/button";

interface Cobro {
  valorPactado?: number | undefined;
  modalidad?: ModalidadSuscripcion | undefined;
  valorRecurrente?: number | undefined;
  inicioSuscripcion?: string | undefined;
  minutosTrabajo?: number | undefined;
  valorHora?: number | undefined;
  planPagos?: Cuota[] | undefined;
}

const dia = (f: string) => fmtFecha(`${f.slice(0, 10)}T12:00:00-05:00`);
const horasTxt = (min: number) => (min / 60).toLocaleString("es-CO", { maximumFractionDigits: 2 });

/**
 * Desglose, suscripción y plan de pagos de un proyecto o servicio (ADR-0047). Todo lo que muestra se deriva de
 * lo registrado: el desarrollo es horas × valor por hora, la diferencia es valor pactado − costo total, y lo
 * cobrado y por cobrar salen de las cuotas. Nada se digita dos veces.
 */
export function CobroResumen({
  cobro,
  materiales,
  suscripcionActiva,
  onGuardarPlan,
  guardando,
}: {
  cobro: Cobro;
  materiales: number;
  /** Cierto si el proyecto está en operación (o el servicio en curso): la suscripción corre. */
  suscripcionActiva: boolean;
  onGuardarPlan: (plan: Cuota[]) => void;
  guardando?: boolean;
}) {
  const d = desglose({
    valorPactado: cobro.valorPactado,
    materiales,
    minutosTrabajo: cobro.minutosTrabajo,
    valorHora: cobro.valorHora,
  });
  const plan = cobro.planPagos ?? [];
  const hoy = hoyBogota();
  const r = resumenPagos(plan, hoy);
  const cambiar = (numero: number, pagadaEn: string | undefined) =>
    onGuardarPlan(
      plan.map((c) => {
        if (c.numero !== numero) return c;
        const { pagadaEn: _quitada, ...resto } = c;
        return pagadaEn ? { ...resto, pagadaEn } : resto;
      }),
    );
  const mensual =
    cobro.modalidad === "mensual"
      ? cobro.valorRecurrente
      : cobro.modalidad === "anual" && cobro.valorRecurrente !== undefined
        ? Math.round(cobro.valorRecurrente / 12)
        : undefined;
  return (
    <div className="space-y-6 pb-6" data-testid="cobro-resumen">
      <section className="rounded-lg border p-4" data-testid="desglose">
        <h3 className="mb-3 font-semibold">Desglose del valor</h3>
        <dl className="space-y-2 text-sm">
          <Fila
            rotulo="Valor pactado"
            valor={d.valorPactado === undefined ? "—" : fmtCop(d.valorPactado)}
            id="desglose-pactado"
          />
          <Fila
            rotulo="Materiales (costo del inventario)"
            valor={fmtCop(d.materiales)}
            id="desglose-materiales"
          />
          <Fila
            rotulo={
              cobro.minutosTrabajo !== undefined && cobro.valorHora !== undefined
                ? `Desarrollo (${horasTxt(cobro.minutosTrabajo)} h × ${fmtCop(cobro.valorHora)})`
                : "Desarrollo"
            }
            valor={
              d.desarrollo === null
                ? "Sin calcular: indique horas y valor por hora"
                : fmtCop(d.desarrollo)
            }
            id="desglose-desarrollo"
          />
          <Fila
            rotulo="Costo total (materiales + desarrollo)"
            valor={d.costoTotal === null ? "—" : fmtCop(d.costoTotal)}
            id="desglose-costo"
            fuerte
          />
          <Fila
            rotulo={
              d.diferencia !== null && d.diferencia < 0
                ? "Diferencia (bajo el costo)"
                : "Diferencia (utilidad sobre tu tiempo)"
            }
            valor={d.diferencia === null ? "—" : fmtCop(d.diferencia)}
            id="desglose-diferencia"
            fuerte
            alerta={d.diferencia !== null && d.diferencia < 0}
          />
        </dl>
        {d.diferencia === null && d.sobreMateriales !== null && (
          <p className="mt-3 text-xs text-muted-foreground" data-testid="desglose-sobre-materiales">
            Antes de contar tu tiempo, el valor pactado menos los materiales deja{" "}
            {fmtCop(d.sobreMateriales)}.
          </p>
        )}
      </section>

      {cobro.modalidad && (
        <section className="rounded-lg border p-4" data-testid="suscripcion">
          <h3 className="mb-2 font-semibold">
            Suscripción {ROTULO_MODALIDAD[cobro.modalidad].toLowerCase()}
          </h3>
          <p className="text-sm">
            <strong data-testid="suscripcion-estado">
              {rotuloSuscripcion(cobro.modalidad, suscripcionActiva) ?? "Suscripción sin operar"}
            </strong>
            {cobro.valorRecurrente !== undefined && (
              <>
                {" · "}
                {fmtCop(cobro.valorRecurrente)}{" "}
                {cobro.modalidad === "mensual" ? "al mes" : "al año"}
                {mensual !== undefined &&
                  cobro.modalidad === "anual" &&
                  ` (${fmtCop(mensual)} al mes)`}
              </>
            )}
            {cobro.inicioSuscripcion && <> · desde {dia(cobro.inicioSuscripcion)}</>}
          </p>
        </section>
      )}

      {plan.length > 0 && (
        <section className="rounded-lg border p-4" data-testid="plan-pagos">
          <h3 className="mb-3 font-semibold">Plan de pagos</h3>
          <p className="mb-3 text-sm" data-testid="plan-resumen">
            Cobrado <strong data-testid="plan-cobrado">{fmtCop(r.cobrado)}</strong> · Por cobrar{" "}
            <strong data-testid="plan-por-cobrar">{fmtCop(r.porCobrar)}</strong> · de{" "}
            {fmtCop(r.total)} ({r.pagadas} de {r.cuotas} cuotas pagadas)
            {r.vencido > 0 && (
              <span className="ml-2 text-destructive" data-testid="plan-vencido">
                Vencido: {fmtCop(r.vencido)}
              </span>
            )}
          </p>
          <div className="overflow-x-auto">
            <table className="data-table" data-testid="plan-tabla">
              <thead>
                <tr>
                  <th>Cuota</th>
                  <th>Vence</th>
                  <th>Valor</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {plan.map((c) => (
                  <tr key={c.numero} data-testid={`cuota-${c.numero}`}>
                    <td>{c.numero}</td>
                    <td>{dia(c.vence)}</td>
                    <td>{fmtCop(c.valor)}</td>
                    <td>
                      {c.pagadaEn ? (
                        <span data-testid={`cuota-${c.numero}-estado`}>
                          Pagada el {dia(c.pagadaEn)}
                        </span>
                      ) : c.vence < hoy ? (
                        <span className="text-destructive" data-testid={`cuota-${c.numero}-estado`}>
                          Vencida
                        </span>
                      ) : (
                        <span
                          className="text-muted-foreground"
                          data-testid={`cuota-${c.numero}-estado`}
                        >
                          Pendiente
                        </span>
                      )}
                    </td>
                    <td className="text-right">
                      {c.pagadaEn ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={guardando}
                          onClick={() => cambiar(c.numero, undefined)}
                        >
                          Quitar pago
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={guardando}
                          onClick={() => cambiar(c.numero, hoy)}
                        >
                          Marcar pagada
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Informativo: la factura y el pago reales viven en Alegra. Para cambiar el número de
            cuotas o las fechas, edite el registro.
          </p>
        </section>
      )}
    </div>
  );
}

function Fila({
  rotulo,
  valor,
  id,
  fuerte,
  alerta,
}: {
  rotulo: string;
  valor: string;
  id: string;
  fuerte?: boolean;
  alerta?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-4 ${fuerte ? "border-t pt-2 font-semibold" : ""}`}>
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd data-testid={id} className={alerta ? "text-destructive" : ""}>
        {valor}
      </dd>
    </div>
  );
}
