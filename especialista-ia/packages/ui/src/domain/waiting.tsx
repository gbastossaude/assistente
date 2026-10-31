import { Clock, Loader2, WifiOff } from "lucide-react";
import { Alert } from "../components/primitives.tsx";

export function WaitingIndicator({ seconds, workerOnline }: { seconds: number; workerOnline: boolean | null }) {
  if (workerOnline === false) {
    return (
      <Alert tone="warning" title="Assistente offline no momento">
        <span className="inline-flex items-center gap-1"><WifiOff className="h-3.5 w-3.5" /> Sua pergunta foi registrada e será respondida assim que o computador do assistente voltar a funcionar. Você pode fechar o painel; a resposta ficará no histórico.</span>
      </Alert>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-lg border border-ink-200 bg-white px-3 py-3" role="status" aria-live="polite">
      <Loader2 className="h-5 w-5 animate-spin text-accent-600" aria-hidden />
      <div className="flex-1">
        <p className="text-sm font-medium text-ink-900">Consultando a base de conhecimento…</p>
        <p className="text-xs text-ink-500">
          {seconds < 8 ? "Buscando documentos vigentes" : seconds < 25 ? "Analisando as regras encontradas" : "Gerando a resposta com o modelo local — pode levar até 1 minuto"}
        </p>
      </div>
      <span className="inline-flex items-center gap-1 text-xs tabular-nums text-ink-500"><Clock className="h-3.5 w-3.5" />{seconds}s</span>
    </div>
  );
}
