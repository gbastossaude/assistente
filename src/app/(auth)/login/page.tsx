import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0d2340] via-[#12355b] to-[#0f766e] p-4">
      <div className="w-full max-w-sm rounded-xl bg-surface p-7 shadow-2xl">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">BS</span>
            <div>
              <p className="text-sm font-semibold leading-tight">BeSmart</p>
              <p className="text-xs text-muted">Health Cockpit</p>
            </div>
          </div>
          <h1 className="mt-5 text-lg font-semibold">Entrar</h1>
          <p className="text-sm text-muted">Central de comando de Saúde Corporativa</p>
        </div>
        <LoginForm next={next ?? "/"} />
      </div>
    </main>
  );
}
