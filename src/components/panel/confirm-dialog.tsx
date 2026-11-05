import { useState, type ReactNode } from "react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface ConfirmState {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  requireReason?: boolean;
  onConfirm: (motivo: string) => void | Promise<unknown>;
}

export function ConfirmDialog({ state, onClose }: { state: ConfirmState | null; onClose: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const needs = state?.requireReason ?? true;
  const close = () => { setMotivo(""); onClose(); };
  return (
    <AlertDialog open={!!state} onOpenChange={(o) => !o && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state?.title}</AlertDialogTitle>
          <AlertDialogDescription asChild><div className="text-sm text-muted-foreground">{state?.description}</div></AlertDialogDescription>
        </AlertDialogHeader>
        {needs && (
          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo (obligatorio)</Label>
            <Textarea id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Explique por qué realiza esta acción" />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button
            variant={state?.destructive ? "destructive" : "default"}
            disabled={busy || (needs && motivo.trim().length < 3)}
            onClick={async () => {
              if (!state) return;
              setBusy(true);
              try { await state.onConfirm(motivo.trim()); close(); } finally { setBusy(false); }
            }}
          >
            {state?.confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
