"use client";
import { Bell, Building2, CalendarPlus, CheckSquare, FileSpreadsheet, LogOut, Plus, Search, KeyRound, FilePlus2, Target, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Field, Input, Select } from "@/components/ui/inputs";
import { useAction } from "@/components/ui/use-action";
import { ROLE_LABELS, type Role } from "@/lib/domain/constants";
import { formatDateTimeBR } from "@/lib/domain/dates";
import { changePasswordAction, logoutAction } from "@/server/actions/auth";
import { dismissNotificationAction, markNotificationReadAction } from "@/server/actions/notifications";

interface Notif {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export function Header({
  user,
  notifications,
  unread,
  quotations,
  canWrite,
  perms,
}: {
  user: { name: string; role: Role };
  notifications: Notif[];
  unread: number;
  quotations: { id: string; label: string }[];
  canWrite: boolean;
  perms: { crm: boolean; meeting: boolean; task: boolean; company: boolean; lives: boolean };
}) {
  const router = useRouter();
  const { run } = useAction();
  const [importOpen, setImportOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [quotationId, setQuotationId] = useState("");
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });

  return (
    <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur lg:px-6">
      <form action="/busca" className="relative ml-10 flex-1 lg:ml-0 lg:max-w-xl" role="search">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input name="q" placeholder="Buscar cliente, oportunidade, CNPJ, cotação, reunião, mensagem…" className="pl-8" aria-label="Busca global" minLength={2} />
      </form>
      <div className="ml-auto flex items-center gap-1.5">
        {(canWrite || perms.crm || perms.meeting || perms.task) && (
          <Dropdown>
            <DropdownTrigger asChild>
              <Button size="sm">
                <Plus /> <span className="hidden sm:inline">Novo</span>
              </Button>
            </DropdownTrigger>
            <DropdownContent>
              {perms.crm && (
                <DropdownItem onSelect={() => router.push("/crm?nova=1")}>
                  <Target /> Nova Oportunidade
                </DropdownItem>
              )}
              {perms.meeting && (
                <DropdownItem onSelect={() => router.push("/reunioes/nova")}>
                  <CalendarPlus /> Nova Reunião
                </DropdownItem>
              )}
              {perms.task && (
                <DropdownItem onSelect={() => router.push("/tarefas?nova=1")}>
                  <CheckSquare /> Nova Tarefa
                </DropdownItem>
              )}
              {canWrite && (
                <DropdownItem onSelect={() => router.push("/cotacoes/nova")}>
                  <FilePlus2 /> Nova Cotação
                </DropdownItem>
              )}
              {perms.company && (
                <DropdownItem onSelect={() => router.push("/empresas/nova")}>
                  <Building2 /> Nova Empresa
                </DropdownItem>
              )}
              {perms.lives && (
                <DropdownItem onSelect={() => setImportOpen(true)}>
                  <FileSpreadsheet /> Importar Base de Vidas
                </DropdownItem>
              )}
            </DropdownContent>
          </Dropdown>
        )}
        <Dropdown>
          <DropdownTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Notificações (${unread} não lidas)`} className="relative">
              <Bell />
              {unread > 0 && <span className="absolute right-1 top-1 rounded-full bg-red-500 px-1 text-[9px] font-bold leading-4 text-white">{unread > 9 ? "9+" : unread}</span>}
            </Button>
          </DropdownTrigger>
          <DropdownContent className="w-80">
            <div className="flex items-center justify-between px-2 py-1">
              <DropdownLabel className="px-0">Notificações</DropdownLabel>
              <div className="flex items-center gap-3">
                {unread > 0 && (
                  <button className="text-xs text-primary hover:underline" onClick={() => run(() => markNotificationReadAction(), { success: false })}>
                    Marcar todas como lidas
                  </button>
                )}
                {notifications.length > 0 && (
                  <button className="text-xs text-muted hover:text-red-600 hover:underline" onClick={() => run(() => dismissNotificationAction(), { success: "Notificações excluídas" })}>
                    Limpar todas
                  </button>
                )}
              </div>
            </div>
            <DropdownSeparator />
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 && <p className="px-2 py-4 text-center text-xs text-muted">Nenhuma notificação</p>}
              {notifications.map((n) => (
                <div key={n.id} className="flex items-start gap-1">
                  <DropdownItem
                    className="min-w-0 flex-1 flex-col items-start gap-0.5"
                    onSelect={() => {
                      if (!n.readAt) void run(() => markNotificationReadAction(n.id), { success: false });
                      if (n.link) router.push(n.link);
                    }}
                  >
                    <span className={n.readAt ? "text-muted" : "font-medium"}>{n.title}</span>
                    {n.body && <span className="text-xs text-muted">{n.body}</span>}
                    <span className="text-[10px] text-muted">{formatDateTimeBR(n.createdAt)}</span>
                  </DropdownItem>
                  <button
                    type="button"
                    aria-label={`Excluir notificação: ${n.title}`}
                    title="Excluir"
                    className="mt-1.5 shrink-0 rounded p-1 text-muted hover:bg-surface-2 hover:text-red-600"
                    onClick={() => run(() => dismissNotificationAction(n.id), { success: false })}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </DropdownContent>
        </Dropdown>
        <Dropdown>
          <DropdownTrigger asChild>
            <button className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-surface-2" aria-label="Menu do usuário">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                {user.name
                  .split(" ")
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
              <span className="hidden text-left leading-tight md:block">
                <span className="block text-xs font-medium">{user.name}</span>
                <span className="block text-[10px] text-muted">{ROLE_LABELS[user.role]}</span>
              </span>
            </button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem onSelect={() => setPwOpen(true)}>
              <KeyRound /> Alterar senha
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem onSelect={() => void logoutAction()}>
              <LogOut /> Sair
            </DropdownItem>
          </DropdownContent>
        </Dropdown>
      </div>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent title="Importar base de vidas" description="A base é vinculada a uma cotação. Selecione a cotação de destino." size="sm">
          {quotations.length === 0 ? (
            <p className="text-sm text-muted">
              Nenhuma cotação aberta.{" "}
              <Link className="text-primary underline" href="/cotacoes/nova" onClick={() => setImportOpen(false)}>
                Criar cotação
              </Link>
            </p>
          ) : (
            <Field label="Cotação">
              <Select value={quotationId} onChange={(e) => setQuotationId(e.target.value)}>
                <option value="">Selecione…</option>
                {quotations.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <DialogFooter>
            <Button
              disabled={!quotationId}
              onClick={() => {
                setImportOpen(false);
                router.push(`/cotacoes/${quotationId}?tab=base`);
              }}
            >
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent title="Alterar senha" size="sm">
          <div className="flex flex-col gap-3">
            <Field label="Senha atual">
              <Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            </Field>
            <Field label="Nova senha" hint="Mínimo de 10 caracteres">
              <Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </Field>
            <Field label="Confirmar nova senha">
              <Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            </Field>
          </div>
          <DialogFooter>
            <Button
              onClick={async () => {
                const r = await run(() => changePasswordAction(pw), { refresh: false });
                if (r.ok) {
                  setPwOpen(false);
                  setPw({ current: "", next: "", confirm: "" });
                }
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
