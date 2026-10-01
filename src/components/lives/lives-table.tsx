import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatCnpj } from "@/lib/domain/cnpj";
import { formatDateBR } from "@/lib/domain/dates";
import type { listLives } from "@/server/services/lives";

type Data = Awaited<ReturnType<typeof listLives>>;

export function LivesTable({ data, baseHref, onlyIssues }: { data: Data; baseHref: string; onlyIssues: boolean }) {
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const link = (p: number, issues = onlyIssues) => `${baseHref}&lp=${p}${issues ? "&li=1" : ""}`;
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs">
        <span className="text-muted">{data.total} registro(s)</span>
        <div className="flex gap-2">
          <Link href={link(1, false)} className={!onlyIssues ? "font-semibold" : "text-muted hover:underline"}>
            Todos
          </Link>
          <Link href={link(1, true)} className={onlyIssues ? "font-semibold" : "text-muted hover:underline"}>
            Somente com problemas
          </Link>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface-2/60">
            <tr className="text-left text-muted">
              {["Linha", "Empresa", "CNPJ", "Nascimento", "Idade", "Sexo", "Faixa", "Titularidade", "Parentesco", "Situação", "CID", "Cidade/UF", "Operadora", "Plano", "Problemas"].map((h) => (
                <th key={h} className="whitespace-nowrap px-2 py-1.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((l) => {
              const errors = l.issues.filter((i) => i.level === "error");
              return (
                <tr key={l.id} className={`border-t border-border ${errors.length ? "bg-red-50/60 dark:bg-red-950/30" : ""}`}>
                  <td className="px-2 py-1 tabular-nums">{l.rowNumber}</td>
                  <td className="px-2 py-1">{l.companyName ?? "—"}</td>
                  <td className="whitespace-nowrap px-2 py-1 tabular-nums">{l.cnpj ? formatCnpj(l.cnpj) : "—"}</td>
                  <td className="px-2 py-1">{formatDateBR(l.birthDate)}</td>
                  <td className="px-2 py-1">{l.age ?? "—"}</td>
                  <td className="px-2 py-1">{l.sex ?? "—"}</td>
                  <td className="whitespace-nowrap px-2 py-1">{l.ageBand ?? "—"}</td>
                  <td className="px-2 py-1">{l.holderType ?? "—"}</td>
                  <td className="px-2 py-1">{l.kinship ?? "—"}</td>
                  <td className="px-2 py-1">{l.situation ?? "—"}</td>
                  <td className="px-2 py-1">{l.cid ?? "—"}</td>
                  <td className="px-2 py-1">{[l.city, l.uf].filter(Boolean).join("/") || "—"}</td>
                  <td className="px-2 py-1">{l.insurer ?? "—"}</td>
                  <td className="px-2 py-1">{l.plan ?? "—"}</td>
                  <td className="px-2 py-1">
                    {l.issues.map((i, k) => (
                      <Badge key={k} tone={i.level === "error" ? "red" : "amber"} className="mb-0.5 mr-0.5 whitespace-normal" title={i.message}>
                        {i.message}
                      </Badge>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-3 border-t border-border px-3 py-2 text-xs">
          {data.page > 1 && <Link href={link(data.page - 1)}>← Anterior</Link>}
          <span className="text-muted">
            Página {data.page} de {pages}
          </span>
          {data.page < pages && <Link href={link(data.page + 1)}>Próxima →</Link>}
        </div>
      )}
    </div>
  );
}
