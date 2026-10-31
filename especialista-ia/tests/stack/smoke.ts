// Verificação rápida da pilha: node --import tsx tests/stack/smoke.ts
import { createClient } from "@supabase/supabase-js";
import { ANON_KEY, GATEWAY_URL, startStack } from "./stack.ts";

const stack = await startStack();
try {
  await stack.createUser("admin@stack.test", "Senha-Forte-123", "admin", "Admin Teste");
  const sb = createClient(GATEWAY_URL, ANON_KEY, { auth: { persistSession: false } });
  const login = await sb.auth.signInWithPassword({ email: "admin@stack.test", password: "Senha-Forte-123" });
  console.log("login:", login.error?.message ?? "ok");
  const prof = await sb.from("profiles").select("role, active").single();
  console.log("perfil:", JSON.stringify(prof.data), prof.error?.message ?? "");
  const dash = await sb.rpc("get_dashboard", { p_days: 30 });
  console.log("dashboard:", dash.error?.message ?? Object.keys(dash.data).length + " chaves");
  const up = await sb.storage.from("knowledge").upload("teste/a.txt", new Blob(["olá"], { type: "text/plain" }), { contentType: "text/plain" });
  console.log("upload:", up.error?.message ?? up.data?.path);
  const dl = await sb.storage.from("knowledge").download("teste/a.txt");
  console.log("download:", dl.error?.message ?? (await dl.data!.text()));
  const fn = await sb.functions.invoke("admin-users", { body: { action: "create", email: "c@stack.test", role: "colaborador", full_name: "C" } });
  console.log("admin-users:", fn.error?.message ?? JSON.stringify(fn.data).slice(0, 80));
  const anon = createClient(GATEWAY_URL, ANON_KEY, { auth: { persistSession: false } });
  const denied = await anon.from("profiles").select("*");
  console.log("anon profiles:", denied.error?.message ?? `${denied.data?.length} linhas`);
} finally {
  await stack.stop();
}
