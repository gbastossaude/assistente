"use client";
import { BellRing } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export interface UpcomingItem {
  id: string;
  title: string;
  startsAt: string; // ISO
  reminderMinutes: number;
  href: string;
  location: string | null;
}

const SEEN_KEY = "besmart:lembretes-vistos";

function seen(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function markSeen(id: string) {
  try {
    const s = seen();
    s.add(id);
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-200)));
  } catch {
    /* sem armazenamento: o aviso pode reaparecer, sem prejuízo */
  }
}

/**
 * Lembrete visual na tela: quando chega a hora do lembrete de um compromisso, mostra um aviso;
 * e mantém uma faixa com o próximo compromisso das próximas 2 horas. Complementa a notificação
 * gerada pela rotina (sino), que depende do agendamento do cron.
 */
export function UpcomingReminders({ items }: { items: UpcomingItem[] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const s = seen();
    for (const it of items) {
      const start = Date.parse(it.startsAt);
      const key = `${it.id}:${it.startsAt}`;
      if (it.reminderMinutes > 0 && now >= start - it.reminderMinutes * 60_000 && now < start && !s.has(key)) {
        markSeen(key);
        const mins = Math.max(1, Math.round((start - now) / 60_000));
        toast(`Em ${mins} min: ${it.title}`, { description: it.location ?? undefined, duration: 20_000, icon: <BellRing className="size-4" />, action: { label: "Abrir", onClick: () => (window.location.href = it.href) } });
      }
    }
  }, [items, now]);
  const next = items.map((i) => ({ ...i, start: Date.parse(i.startsAt) })).filter((i) => i.start > now && i.start - now <= 2 * 3_600_000).sort((a, b) => a.start - b.start)[0];
  if (!next) return null;
  const mins = Math.round((next.start - now) / 60_000);
  const hhmm = new Date(next.start).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="no-print border-b border-border bg-primary/5 px-4 py-1.5 text-xs lg:px-6">
      <Link href={next.href} className="inline-flex items-center gap-1.5 hover:underline">
        <BellRing className="size-3.5 text-primary" />
        Próximo compromisso às {hhmm} ({mins < 60 ? `em ${mins} min` : `em ${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}`}): <strong>{next.title}</strong>
        {next.location ? ` · ${next.location}` : ""}
      </Link>
    </div>
  );
}
