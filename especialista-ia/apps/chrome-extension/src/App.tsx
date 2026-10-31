import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { History, LogOut, MessageSquarePlus, RotateCcw, Search, Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { PRODUCT_NAME_DEFAULT } from "@especialista/shared";
import {
  Alert, AnswerCard, AskForm, Button, EmptyState, Field, HistoryList, Input, Spinner, StatusDot, WaitingIndicator,
  errorMessage, fetchMyHistory, fetchOperators, fetchServiceStatus, requestHandoff, sendFeedback, toggleFavorite, useAsk, useElapsed,
  type AskContext, type QuestionWithAnswer,
} from "@especialista/ui";
import { configIsBuiltIn, loadConfig, saveConfig, type ExtensionConfig } from "./config.ts";
import { createExtensionClient } from "./supabase.ts";

type Tab = "ask" | "history" | "favorites";

export function App() {
  const [cfg, setCfg] = useState<ExtensionConfig | null | undefined>(undefined);
  useEffect(() => void loadConfig().then(setCfg), []);
  const sb = useMemo(() => (cfg ? createExtensionClient(cfg) : null), [cfg]);
  if (cfg === undefined) return <Centered><Spinner /></Centered>;
  if (!cfg || !sb) return <SetupScreen onSaved={() => void loadConfig().then(setCfg)} />;
  return <Authenticated sb={sb} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center p-6">{children}</div>;
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <img src="icons/icon-32.png" alt="" className="h-7 w-7 rounded-md" />
      <div className="leading-tight">
        <p className="text-sm font-semibold text-white">Especialista IA</p>
        <p className="text-[10px] text-white/70">Planos de saúde · uso interno</p>
      </div>
    </div>
  );
}

function SetupScreen({ onSaved }: { onSaved: () => void }) {
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await saveConfig({ supabaseUrl: url, supabaseAnonKey: key });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <div className="flex h-full flex-col">
      <header className="bg-brand-900 px-4 py-3"><Brand /></header>
      <form onSubmit={submit} className="flex flex-col gap-3 p-4">
        <h1 className="text-base font-semibold">Configurar conexão</h1>
        <p className="text-xs text-ink-500">Informe o endereço do projeto e a chave <b>pública</b> fornecidos pelo administrador.</p>
        <Field label="Endereço do projeto (Supabase)"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" required /></Field>
        <Field label="Chave pública (anon)"><Input value={key} onChange={(e) => setKey(e.target.value)} required /></Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit">Salvar</Button>
      </form>
    </div>
  );
}

function LoginScreen({ sb }: { sb: SupabaseClient }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(errorMessage(error));
  };
  const forgot = async () => {
    if (!email.trim()) return setError("Informe seu e-mail para redefinir a senha.");
    const { error } = await sb.auth.resetPasswordForEmail(email.trim());
    if (error) setError(errorMessage(error));
    else setInfo("Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.");
  };
  return (
    <div className="flex h-full flex-col">
      <header className="bg-brand-900 px-4 py-3"><Brand /></header>
      <form onSubmit={submit} className="flex flex-col gap-3 p-4" aria-label="Entrar">
        <h1 className="text-base font-semibold">Entrar</h1>
        <p className="text-xs text-ink-500">Use o acesso fornecido pelo administrador da corretora.</p>
        <Field label="E-mail"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="Senha"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        {error && <Alert tone="danger">{error}</Alert>}
        {info && <Alert tone="success">{info}</Alert>}
        <Button type="submit" loading={busy}>Entrar</Button>
        <Button type="button" variant="link" size="sm" onClick={forgot}>Esqueci minha senha</Button>
        {!configIsBuiltIn && (
          <Button type="button" variant="ghost" size="sm" onClick={async () => { await chrome.storage.local.clear(); location.reload(); }}>Trocar servidor</Button>
        )}
      </form>
    </div>
  );
}

function Authenticated({ sb }: { sb: SupabaseClient }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ full_name: string; role: string } | null>(null);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [sb]);

  useEffect(() => {
    if (!session) return setProfile(null);
    sb.from("profiles").select("full_name, role, active").eq("id", session.user.id).single().then(({ data, error }) => {
      if (error || !data) return setProfileError(errorMessage(error));
      if (!data.active || data.role === "worker") {
        setProfileError("Sua conta não está ativa para consultas. Procure o administrador.");
        void sb.auth.signOut();
        return;
      }
      setProfileError(null);
      setProfile(data);
    });
  }, [sb, session]);

  if (session === undefined) return <Centered><Spinner /></Centered>;
  if (!session) return <><LoginScreen sb={sb} />{profileError && <div className="px-4"><Alert tone="danger">{profileError}</Alert></div>}</>;
  if (!profile) return <Centered>{profileError ? <Alert tone="danger">{profileError}</Alert> : <Spinner />}</Centered>;
  return <MainScreen sb={sb} userId={session.user.id} name={profile.full_name} />;
}

function useServiceStatus(sb: SupabaseClient) {
  const [state, setState] = useState<{ connected: boolean | null; worker: boolean | null; ai: boolean | null }>({ connected: null, worker: null, ai: null });
  const check = useCallback(async () => {
    try {
      const s = await fetchServiceStatus(sb);
      setState({ connected: true, worker: s.worker_online, ai: s.worker_online && s.ai_ok });
    } catch {
      setState({ connected: false, worker: null, ai: null });
    }
  }, [sb]);
  useEffect(() => {
    void check();
    const t = setInterval(check, 30_000);
    const onOnline = () => void check();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOnline);
    return () => { clearInterval(t); window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOnline); };
  }, [check]);
  return state;
}

function MainScreen({ sb, userId, name }: { sb: SupabaseClient; userId: string; name: string }) {
  const [tab, setTab] = useState<Tab>("ask");
  const [operators, setOperators] = useState<Array<{ id: string; name: string }>>([]);
  const status = useServiceStatus(sb);
  const ask = useAsk(sb, "extension");
  const elapsed = useElapsed(ask.startedAt, ask.phase === "waiting" || ask.phase === "sending");
  const [followUp, setFollowUp] = useState("");

  useEffect(() => void fetchOperators(sb).then(setOperators).catch(() => {}), [sb]);

  const submit = (text: string, context: AskContext) => void ask.ask(text, context as Record<string, unknown>);
  const openFromList = (q: QuestionWithAnswer) => {
    setTab("ask");
    void ask.open(q.id);
  };
  const q = ask.question;
  const a = ask.answer;

  return (
    <div className="flex h-full flex-col bg-ink-50">
      <header className="flex items-center justify-between bg-brand-900 px-4 py-3">
        <Brand />
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => void sb.auth.signOut()} aria-label="Sair">
          <LogOut className="h-4 w-4" />
        </Button>
      </header>
      <div className="flex items-center justify-between border-b border-ink-200 bg-white px-4 py-1.5">
        <span className="truncate text-xs text-ink-500">Olá, {name.split(" ")[0] || "colaborador"}</span>
        <div className="flex gap-3">
          <StatusDot online={status.connected} label={status.connected === false ? "Sem conexão" : "Conectado"} />
          <StatusDot online={status.connected ? status.ai : null} label={status.ai ? "IA online" : "IA offline"} />
        </div>
      </div>
      <nav className="grid grid-cols-3 border-b border-ink-200 bg-white text-xs" role="tablist" aria-label="Seções">
        {([["ask", "Perguntar", MessageSquarePlus], ["history", "Histórico", History], ["favorites", "Favoritos", Star]] as const).map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`flex items-center justify-center gap-1.5 py-2.5 font-medium cursor-pointer ${tab === id ? "border-b-2 border-accent-600 text-accent-600" : "text-ink-500 hover:text-ink-900"}`}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </nav>

      <main className="flex-1 overflow-y-auto p-4">
        {tab === "ask" && (
          <div className="flex flex-col gap-4">
            {status.connected === false && <Alert tone="danger" title="Sem conexão com o servidor">Verifique sua internet. Suas perguntas não podem ser enviadas agora.</Alert>}
            {(ask.phase === "idle" || ask.phase === "error") && <AskForm operators={operators} onSubmit={submit} busy={false} compact />}
            {ask.phase === "error" && <Alert tone="danger">{errorMessage(ask.error)}</Alert>}
            {q && (
              <div className="rounded-lg bg-brand-900/5 px-3 py-2 text-sm text-ink-900">
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Sua pergunta</p>
                <p className="mt-0.5">{q.text_redacted}</p>
              </div>
            )}
            {ask.redactedNotice && <Alert tone="info">Removemos dados pessoais (CPF, telefone, e-mail…) da pergunta antes do envio.</Alert>}
            {(ask.phase === "sending" || ask.phase === "waiting") && <WaitingIndicator seconds={elapsed} workerOnline={status.worker} />}
            {q?.status === "expirada" && <Alert tone="warning">Esta pergunta expirou sem resposta. Envie novamente.</Alert>}
            {a && q && (
              <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
                <AnswerCard
                  answer={a}
                  compact
                  isFavorite={q.is_favorite}
                  onToggleFavorite={async () => {
                    await toggleFavorite(sb, q.id, !q.is_favorite);
                    ask.setQuestion({ ...q, is_favorite: !q.is_favorite });
                  }}
                  onFeedback={(rating, comment) => sendFeedback(sb, a.id, rating, comment)}
                  onHandoff={async () => void (await requestHandoff(sb, q.id))}
                />
              </div>
            )}
            {a?.outcome === "precisa_info" && q && (
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (followUp.trim()) { void ask.ask(followUp.trim(), {}, q.id); setFollowUp(""); } }}>
                <Input value={followUp} onChange={(e) => setFollowUp(e.target.value)} placeholder="Responda aqui (ex.: Bradesco, SP, 5 vidas)" aria-label="Complemento" />
                <Button type="submit">Enviar</Button>
              </form>
            )}
            {(ask.phase === "done" || ask.phase === "waiting") && (
              <Button variant="outline" onClick={ask.reset}><RotateCcw className="h-4 w-4" /> Nova pergunta</Button>
            )}
          </div>
        )}
        {tab !== "ask" && <HistoryTab sb={sb} userId={userId} favorites={tab === "favorites"} onOpen={openFromList} />}
      </main>
      <footer className="border-t border-ink-200 bg-white px-4 py-2 text-center text-[10px] text-ink-500">
        {PRODUCT_NAME_DEFAULT} · respostas baseadas nos documentos cadastrados
      </footer>
    </div>
  );
}

function HistoryTab({ sb, userId, favorites, onOpen }: { sb: SupabaseClient; userId: string; favorites: boolean; onOpen: (q: QuestionWithAnswer) => void }) {
  const [items, setItems] = useState<QuestionWithAnswer[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      fetchMyHistory(sb, userId, { favorites, search })
        .then((d) => alive && setItems(d))
        .catch((e) => alive && setError(errorMessage(e)));
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [sb, userId, favorites, search]);
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-500" />
        <Input className="pl-9" placeholder="Buscar no histórico" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar no histórico" />
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {items === null ? <Spinner /> : items.length === 0 ? (
        <EmptyState icon={favorites ? <Star className="h-5 w-5" /> : <History className="h-5 w-5" />} title={favorites ? "Nenhum favorito ainda" : "Nenhuma pergunta ainda"}
          description={favorites ? "Marque respostas com a estrela para encontrá-las aqui." : "Suas perguntas e respostas aparecerão aqui."} />
      ) : (
        <div className="rounded-lg border border-ink-200 bg-white px-3"><HistoryList items={items} onOpen={onOpen} /></div>
      )}
    </div>
  );
}
