import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MODALIDADES, ROTULO_MODALIDAD } from "@/lib/dominio";
import { desglose, minutosDeHoras } from "@/lib/desglose";
import type { CobroForm } from "@/lib/cobro";
import { fmtCop } from "@/lib/format";

export function CobroCampos({
  v,
  set,
  valorPactado,
  prefijo,
}: {
  v: CobroForm;
  set: (k: keyof CobroForm, valor: string) => void;
  /** Valor pactado digitado (texto), para el cálculo en vivo. */
  valorPactado: string;
  prefijo: string;
}) {
  const horas = Number(v.horas.replace(",", "."));
  const vh = Number(v.valorHora);
  const minutos =
    v.horas.trim() !== "" && Number.isFinite(horas) ? minutosDeHoras(horas) : undefined;
  const d = desglose({
    materiales: 0,
    minutosTrabajo: minutos,
    valorHora: v.valorHora.trim() !== "" && Number.isFinite(vh) ? vh : undefined,
  });
  const total = valorPactado.trim() !== "" ? Number(valorPactado) : undefined;
  const n = Number(v.nCuotas);
  const hayPlan = Number.isInteger(n) && n >= 2 && total !== undefined && total > 0;
  return (
    <fieldset className="space-y-3 rounded-lg border p-3" data-testid="cobro-campos">
      <legend className="px-1 text-sm font-semibold">Cobro</legend>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor={`${prefijo}-horas`}>Horas de trabajo</Label>
          <Input
            id={`${prefijo}-horas`}
            inputMode="decimal"
            placeholder="Ej. 2,5"
            value={v.horas}
            onChange={(e) => set("horas", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefijo}-valorhora`}>Valor por hora (COP)</Label>
          <Input
            id={`${prefijo}-valorhora`}
            type="number"
            min="0"
            step="1"
            value={v.valorHora}
            onChange={(e) => set("valorHora", e.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground" data-testid={`${prefijo}-calculo-desarrollo`}>
        {d.desarrollo === null
          ? "Desarrollo: indique horas y valor por hora para calcularlo."
          : `Desarrollo = ${horas.toLocaleString("es-CO")} h × ${fmtCop(vh)} = ${fmtCop(d.desarrollo)}`}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor={`${prefijo}-modalidad`}>Modalidad de pago</Label>
          <select
            id={`${prefijo}-modalidad`}
            className="app-select w-full"
            value={v.modalidad}
            onChange={(e) => set("modalidad", e.target.value)}
          >
            <option value="">Pago único</option>
            {MODALIDADES.map((m) => (
              <option key={m} value={m}>
                {ROTULO_MODALIDAD[m]}
              </option>
            ))}
          </select>
        </div>
        {v.modalidad && (
          <div className="space-y-2">
            <Label htmlFor={`${prefijo}-recurrente`}>
              Valor {v.modalidad === "mensual" ? "mensual" : "anual"} (COP)
            </Label>
            <Input
              id={`${prefijo}-recurrente`}
              type="number"
              min="0"
              step="1"
              value={v.valorRecurrente}
              onChange={(e) => set("valorRecurrente", e.target.value)}
            />
          </div>
        )}
      </div>
      {v.modalidad && (
        <div className="space-y-2">
          <Label htmlFor={`${prefijo}-iniciosus`}>Inicio de la suscripción</Label>
          <Input
            id={`${prefijo}-iniciosus`}
            type="date"
            value={v.inicioSuscripcion}
            onChange={(e) => set("inicioSuscripcion", e.target.value)}
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor={`${prefijo}-ncuotas`}>Pagar en cuotas (mensuales)</Label>
          <Input
            id={`${prefijo}-ncuotas`}
            type="number"
            min="1"
            max="120"
            step="1"
            placeholder="Un solo pago"
            value={v.nCuotas}
            onChange={(e) => set("nCuotas", e.target.value)}
          />
        </div>
        {hayPlan && (
          <div className="space-y-2">
            <Label htmlFor={`${prefijo}-primera`}>Primera cuota vence</Label>
            <Input
              id={`${prefijo}-primera`}
              type="date"
              value={v.primeraCuota}
              onChange={(e) => set("primeraCuota", e.target.value)}
            />
          </div>
        )}
      </div>
      {hayPlan && (
        <p className="text-xs text-muted-foreground" data-testid={`${prefijo}-calculo-cuotas`}>
          {n} cuotas: {fmtCop(Math.floor(total / n))} cada una; la última{" "}
          {fmtCop(total - Math.floor(total / n) * (n - 1))}. Suman exactamente {fmtCop(total)}.
        </p>
      )}
    </fieldset>
  );
}
