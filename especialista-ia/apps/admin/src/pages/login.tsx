import { useState, type FormEvent } from "react";
import { Alert, Button, Card, Field, Input, errorMessage } from "@especialista/ui";
import { useAuth } from "../lib/auth.tsx";
import type { Branding } from "../lib/branding.ts";
import { configured, sb } from "../lib/supabase.ts";

export function LoginPage({ branding }: { branding: Branding }) {
  const { error: authError } = useAuth();
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
    if (!email.trim()) return setError("Informe o e-mail para receber o link de redefinição.");
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    if (error) setError(errorMessage(error));
    else setInfo("Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.");
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-brand-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <img src={branding.logo_url || "/logo.png"} alt="" className="h-10 w-10 rounded-lg" />
          <span className="text-lg font-semibold">{branding.product_name}</span>
        </div>
        <div>
          <h1 className="text-3xl font-semibold leading-tight">Regras de planos de saúde,<br />com fonte e vigência.</h1>
          <p className="mt-4 max-w-md text-sm text-white/70">
            Base de conhecimento da corretora com respostas baseadas exclusivamente em documentos cadastrados — sem inventar regras.
          </p>
        </div>
        <p className="text-xs text-white/50">Uso interno · dados protegidos conforme a LGPD</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <Card className="w-full max-w-sm p-6">
          <h2 className="text-lg font-semibold">Entrar no painel</h2>
          <p className="mt-1 text-sm text-ink-500">Acesso restrito à equipe da corretora.</p>
          {!configured && (
            <Alert tone="warning" className="mt-4" title="Painel não configurado">
              Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (veja .env.example) e gere o build novamente.
            </Alert>
          )}
          <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
            <Field label="E-mail"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label="Senha"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            {(error || authError) && <Alert tone="danger">{error || authError}</Alert>}
            {info && <Alert tone="success">{info}</Alert>}
            <Button type="submit" loading={busy}>Entrar</Button>
            <Button type="button" variant="link" size="sm" onClick={forgot}>Esqueci minha senha</Button>
          </form>
        </Card>
      </section>
    </div>
  );
}

export function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 10) return setError("Use pelo menos 10 caracteres.");
    if (password !== confirm) return setError("As senhas não conferem.");
    setBusy(true);
    const { error } = await sb.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(errorMessage(error));
  };
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold">Definir nova senha</h2>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          <Field label="Nova senha" hint="Mínimo de 10 caracteres"><Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Field label="Confirmar senha"><Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" loading={busy}>Salvar senha</Button>
        </form>
      </Card>
    </div>
  );
}
