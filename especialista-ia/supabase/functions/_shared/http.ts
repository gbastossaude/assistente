/** Utilidades HTTP das Edge Functions. */
export const corsHeaders = (origin: string | null, allowed: string[]): Record<string, string> => {
  const ok = origin && (allowed.includes("*") || allowed.includes(origin) || origin.startsWith("chrome-extension://"));
  return {
    "access-control-allow-origin": ok ? origin! : allowed[0] ?? "",
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "origin",
  };
};

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}
