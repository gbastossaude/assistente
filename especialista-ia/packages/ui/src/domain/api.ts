/* eslint-disable @typescript-eslint/no-explicit-any -- cliente Supabase sem tipos gerados, schema "especialista" */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnswerRow, AnswerSourceRow, QuestionRow, ServiceStatus } from "@especialista/shared";

export interface QuestionWithAnswer extends QuestionRow {
  answers: Array<AnswerRow & { answer_sources: AnswerSourceRow[] }> | (AnswerRow & { answer_sources: AnswerSourceRow[] }) | null;
}

export function answerOf(q: QuestionWithAnswer): (AnswerRow & { answer_sources: AnswerSourceRow[] }) | null {
  const a = Array.isArray(q.answers) ? q.answers[0] : q.answers;
  if (!a) return null;
  return { ...a, answer_sources: [...(a.answer_sources ?? [])].sort((x, y) => x.rank - y.rank) };
}

const SELECT = "*, answers(*, answer_sources(*))";

export async function submitQuestion(sb: SupabaseClient<any, any, any>, text: string, context: Record<string, unknown>, channel: "extension" | "admin", parentId?: string | null) {
  const { data, error } = await sb.rpc("submit_question", { p_text: text, p_context: context, p_channel: channel, p_parent_question_id: parentId ?? null });
  if (error) throw error;
  return data as string;
}

export async function fetchQuestion(sb: SupabaseClient<any, any, any>, id: string) {
  const { data, error } = await sb.from("questions").select(SELECT).eq("id", id).single();
  if (error) throw error;
  return data as QuestionWithAnswer;
}

export async function fetchMyHistory(sb: SupabaseClient<any, any, any>, userId: string, opts: { favorites?: boolean; search?: string; limit?: number } = {}) {
  let q = sb.from("questions").select(SELECT).eq("profile_id", userId).order("created_at", { ascending: false }).limit(opts.limit ?? 50);
  if (opts.favorites) q = q.eq("is_favorite", true);
  if (opts.search?.trim()) q = q.ilike("text_redacted", `%${opts.search.trim().replace(/[%_]/g, "")}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as QuestionWithAnswer[];
}

export async function toggleFavorite(sb: SupabaseClient<any, any, any>, id: string, value: boolean) {
  const { error } = await sb.rpc("toggle_favorite", { p_question_id: id, p_value: value });
  if (error) throw error;
}

export async function sendFeedback(sb: SupabaseClient<any, any, any>, answerId: string, rating: "util" | "incorreta", comment?: string) {
  const { error } = await sb.rpc("submit_feedback", { p_answer_id: answerId, p_rating: rating, p_comment: comment ?? null });
  if (error) throw error;
}

export async function requestHandoff(sb: SupabaseClient<any, any, any>, questionId: string | null, note?: string) {
  const { data, error } = await sb.rpc("request_handoff", { p_question_id: questionId, p_note: note ?? null });
  if (error) throw error;
  return data as string;
}

export async function fetchServiceStatus(sb: SupabaseClient<any, any, any>): Promise<ServiceStatus> {
  const { data, error } = await sb.rpc("get_service_status");
  if (error) throw error;
  return data as ServiceStatus;
}

export async function fetchOperators(sb: SupabaseClient<any, any, any>) {
  const { data, error } = await sb.from("operators").select("id, name, kind").eq("active", true).order("name");
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; name: string; kind: string }>;
}
