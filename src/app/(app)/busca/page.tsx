import { Search } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/inputs";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/server/auth";
import { getScope } from "@/server/scope";
import { globalSearch } from "@/server/services/search";

export const metadata = { title: "Busca" };

const KIND: Record<string, string> = { oportunidade: "Oportunidade", reuniao: "Reunião", mensagem: "Mensagem", resposta: "Resposta", empresa: "Empresa", cnpj: "CNPJ", contato: "Contato", cotacao: "Cotação", operadora: "Operadora", protocolo: "Protocolo", plano: "Plano", documento: "Documento", tarefa: "Tarefa" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const q = ((await searchParams).q ?? "").trim();
  const hits = await globalSearch(q, 8, await getScope(user));
  return (
    <>
      <PageHeader title="Busca" description={q ? `Resultados para “${q}”` : "Oportunidade, reunião, empresa, CNPJ, contato, cotação, operadora, protocolo, plano, documento, tarefa, mensagem ou resposta rápida"} />
      <form className="mb-4 max-w-xl" role="search">
        <Input name="q" defaultValue={q} placeholder="Digite ao menos 2 caracteres" autoFocus />
      </form>
      {q.length >= 2 && hits.length === 0 && <EmptyState icon={<Search />} title="Nada encontrado" description="Tente parte do nome, o CNPJ (com ou sem máscara) ou o código da cotação." />}
      {hits.length > 0 && (
        <Card>
          <ul className="divide-y divide-border">
            {hits.map((h, i) => (
              <li key={i}>
                <Link href={h.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60">
                  <Badge tone="slate" className="w-24 justify-center">
                    {KIND[h.kind]}
                  </Badge>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{h.title}</span>
                    {h.subtitle && <span className="block truncate text-xs text-muted">{h.subtitle}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
