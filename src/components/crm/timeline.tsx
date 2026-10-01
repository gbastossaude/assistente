import { ArrowRightCircle, Bot, CalendarCheck, CheckCircle2, FileUp, Mail, MessageCircle, Phone, RefreshCw, StickyNote, UserCog, Users, FileText, BadgeDollarSign, BellRing } from "lucide-react";
import { INTERACTION_TYPE_LABELS, type InteractionType } from "@/lib/domain/constants";
import { formatDateBR, formatDateTimeBR } from "@/lib/domain/dates";
import type { TimelineRow } from "@/server/services/interactions";
import Link from "next/link";

const ICON: Record<InteractionType, React.ComponentType<{ className?: string }>> = {
  ligacao: Phone,
  email: Mail,
  whatsapp: MessageCircle,
  reuniao: Users,
  nota: StickyNote,
  upload: FileUp,
  status: RefreshCw,
  tarefa: CheckCircle2,
  documento: FileText,
  proposta: BadgeDollarSign,
  cobranca: BellRing,
  responsavel: UserCog,
  sistema: Bot,
};

export function Timeline({ rows, showContext }: { rows: TimelineRow[]; showContext?: boolean }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">Nenhuma movimentação registrada.</p>;
  return (
    <ol className="relative ml-3 border-l border-border">
      {rows.map(({ i, userName, quotationCode, companyName }) => {
        const Icon = ICON[i.type] ?? Bot;
        return (
          <li key={i.id} className="mb-4 ml-5">
            <span className="absolute -left-3 flex size-6 items-center justify-center rounded-full border border-border bg-surface">
              <Icon className="size-3.5 text-muted" />
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
              <span className="font-medium text-foreground">{INTERACTION_TYPE_LABELS[i.type]}</span>
              <span>{formatDateTimeBR(i.occurredAt)}</span>
              {userName && <span>· {userName}</span>}
              {showContext && (companyName || quotationCode) && (
                <span>
                  ·{" "}
                  {i.quotationId ? (
                    <Link className="hover:underline" href={`/cotacoes/${i.quotationId}`}>
                      {[companyName, quotationCode].filter(Boolean).join(" · ")}
                    </Link>
                  ) : i.companyId ? (
                    <Link className="hover:underline" href={`/empresas/${i.companyId}`}>
                      {companyName}
                    </Link>
                  ) : null}
                </span>
              )}
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-sm">{i.description}</p>
            {i.nextAction && (
              <p className="mt-1 flex items-center gap-1 text-xs text-primary">
                <ArrowRightCircle className="size-3.5" /> Próxima ação: {i.nextAction}
                {i.nextActionAt && (
                  <span className="flex items-center gap-1 text-muted">
                    <CalendarCheck className="size-3" /> {formatDateBR(i.nextActionAt)}
                  </span>
                )}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
