"use client";
import { Download, Search, ShieldOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm";
import { Input } from "@/components/ui/inputs";
import { useAction } from "@/components/ui/use-action";
import { anonymizeSubjectAction, findDataSubjectAction } from "@/server/actions/lgpd";

type Found = {
  contacts: { id: string; name: string; email: string | null; phone: string | null; company: string }[];
  opportunities: { id: string; name: string; contact: string | null; email: string | null; phone: string | null; document: string | null; anonymizedAt: Date | null }[];
  meetings: { id: string; title: string; client: string | null; date: string }[];
};

export function LgpdPanel() {
  const { run, pending } = useAction();
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [sel, setSel] = useState<{ contactIds: string[]; opportunityIds: string[]; meetingIds: string[] }>({ contactIds: [], opportunityIds: [], meetingIds: [] });
  const toggle = (k: keyof typeof sel, id: string) => setSel((s) => ({ ...s, [k]: s[k].includes(id) ? s[k].filter((x) => x !== id) : [...s[k], id] }));
  const search = async () => {
    const r = await run(() => findDataSubjectAction(term), { success: false, refresh: false });
    if (r.ok) {
      setFound(r.data as Found);
      setSel({ contactIds: [], opportunityIds: [], meetingIds: [] });
    }
  };
  const total = sel.contactIds.length + sel.opportunityIds.length + sel.meetingIds.length;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Direitos do titular (LGPD)</CardTitle>
            <CardDescription>Localize os registros de uma pessoa (nome, e-mail, telefone ou CPF/CNPJ) e anonimize quando houver pedido de eliminação. A ação é irreversível e fica registrada na auditoria.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Nome, e-mail, telefone ou documento" onKeyDown={(e) => e.key === "Enter" && search()} aria-label="Titular" />
            <Button variant="secondary" loading={pending} onClick={search}>
              <Search /> Localizar
            </Button>
          </div>
          {found && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <Group title={`Contatos de empresas (${found.contacts.length})`}>
                {found.contacts.map((c) => (
                  <Item key={c.id} checked={sel.contactIds.includes(c.id)} onChange={() => toggle("contactIds", c.id)} title={c.name} sub={[c.company, c.email, c.phone].filter(Boolean).join(" · ")} />
                ))}
              </Group>
              <Group title={`Oportunidades (${found.opportunities.length})`}>
                {found.opportunities.map((o) => (
                  <Item key={o.id} checked={sel.opportunityIds.includes(o.id)} disabled={!!o.anonymizedAt} onChange={() => toggle("opportunityIds", o.id)} title={o.name} sub={o.anonymizedAt ? "já anonimizada" : [o.contact, o.email, o.phone, o.document].filter(Boolean).join(" · ")} />
                ))}
              </Group>
              <Group title={`Reuniões (${found.meetings.length})`}>
                {found.meetings.map((m) => (
                  <Item key={m.id} checked={sel.meetingIds.includes(m.id)} onChange={() => toggle("meetingIds", m.id)} title={m.title} sub={[m.client, m.date.split("-").reverse().join("/")].filter(Boolean).join(" · ")} />
                ))}
              </Group>
            </div>
          )}
          {found && (
            <div className="flex justify-end">
              <ConfirmButton
                title={`Anonimizar ${total} registro(s)?`}
                description="Nomes, contatos, documentos, observações e textos livres serão removidos. Etapas, produtos e valores permanecem para os relatórios. Não pode ser desfeito."
                confirmLabel="Anonimizar"
                triggerVariant="destructive"
                size="default"
                disabled={!total}
                onConfirm={async () => {
                  const r = await run(() => anonymizeSubjectAction(sel));
                  if (r.ok) await search();
                }}
              >
                <ShieldOff /> Anonimizar selecionados ({total})
              </ConfirmButton>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Backup dos dados</CardTitle>
            <CardDescription>
              Exporta um JSON com empresas, contatos, contratos, cotações (cabeçalho), CRM, reuniões, campanhas, biblioteca, tarefas, agenda e renovações. Por minimização, não inclui base de vidas, CID/relatórios médicos, arquivos nem senhas. O backup completo do banco é feito no PostgreSQL/Supabase (ver documentação de deploy).
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <a href="/api/backup">
              <Download /> Baixar backup (JSON)
            </a>
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Boas práticas aplicadas</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-4 text-sm">
            <li>Controle de acesso por papel e por carteira (Corretor vê só a própria; Supervisor, a equipe).</li>
            <li>Dados de saúde (CID, relatórios médicos, base de vidas) restritos a Administrador, Head e Analista, com log de acesso.</li>
            <li>Auditoria de criação, edição, exclusão, mudança de status, downloads, exportações e anonimizações.</li>
            <li>Avisos nos campos de texto livre para não registrar informação médica sem base legal e consentimento.</li>
            <li>Retenção configurável (notificações, histórico do assistente e arquivos excluídos) em Parâmetros.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode[] }) {
  return (
    <div className="rounded-md border border-border">
      <p className="border-b border-border bg-surface-2/60 px-3 py-1.5 text-xs font-semibold">{title}</p>
      <ul className="max-h-72 divide-y divide-border overflow-y-auto">{children.length ? children : <li className="px-3 py-3 text-xs text-muted">Nada encontrado.</li>}</ul>
    </div>
  );
}

function Item({ title, sub, checked, onChange, disabled }: { title: string; sub: string; checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <li>
      <label className={`flex cursor-pointer items-start gap-2 px-3 py-2 ${disabled ? "opacity-50" : ""}`}>
        <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} className="mt-1" />
        <span className="min-w-0">
          <span className="block truncate text-sm">{title}</span>
          <span className="block truncate text-xs text-muted">{sub}</span>
        </span>
      </label>
    </li>
  );
}
