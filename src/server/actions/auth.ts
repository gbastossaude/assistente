"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, sessionTtlSeconds, signSession } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validation/schemas";
import { authenticate, changeOwnPassword } from "../services/users";
import { runAction } from "../action-utils";
import { BusinessError } from "../errors";

// Limite simples de tentativas por e-mail (memória do processo) contra força bruta.
const attempts = new Map<string, { n: number; until: number }>();

export async function loginAction(_: unknown, formData: FormData): Promise<{ error?: string }> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const key = parsed.data.email;
  const a = attempts.get(key);
  if (a && a.n >= 5 && a.until > Date.now()) return { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." };
  const user = await authenticate(parsed.data.email, parsed.data.password);
  if (!user) {
    attempts.set(key, { n: (a && a.until > Date.now() ? a.n : 0) + 1, until: Date.now() + 15 * 60_000 });
    return { error: "E-mail ou senha inválidos." };
  }
  attempts.delete(key);
  const token = await signSession({ sub: user.id, name: user.name, email: user.email, role: user.role });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionTtlSeconds(),
  });
  const next = String(formData.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function changePasswordAction(input: { current: string; next: string; confirm: string }) {
  return runAction(
    "read",
    async (user) => {
      if (input.next !== input.confirm) throw new BusinessError("A confirmação não confere.", { confirm: ["Não confere"] });
      await changeOwnPassword(user.id, input.current, input.next);
      return null;
    },
    { message: "Senha alterada", revalidate: [] },
  );
}
