import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ProfileRow, Role } from "@especialista/shared";
import { sb } from "./supabase.ts";

interface AuthState {
  session: Session | null | undefined;
  profile: ProfileRow | null;
  error: string | null;
  recovery: boolean;
  signOut: () => Promise<void>;
  can: (...roles: Role[]) => boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "USER_UPDATED") setRecovery(false);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return void setProfile(null);
    sb.from("profiles").select("*").eq("id", session.user.id).single().then(({ data, error: e }) => {
      if (e || !data) return setError("Perfil não encontrado.");
      if (!data.active) {
        setError("Sua conta está inativa. Procure o administrador.");
        void sb.auth.signOut();
        return;
      }
      if (data.role === "worker") {
        setError("Contas de máquina (worker) não acessam o painel.");
        void sb.auth.signOut();
        return;
      }
      setError(null);
      setProfile(data as ProfileRow);
    });
  }, [session]);

  const value: AuthState = {
    session,
    profile,
    error,
    recovery,
    signOut: async () => void (await sb.auth.signOut()),
    can: (...roles) => !!profile && roles.includes(profile.role),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth fora do AuthProvider");
  return v;
}
