import { AssistantChat } from "@/components/assistant/chat";
import { PageHeader } from "@/components/ui/misc";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/server/auth";
import { listConversation } from "@/server/assistant";

export const metadata = { title: "Assistente IA" };

export default async function AssistantPage() {
  const user = await requirePermission("assistant:use");
  const { messages, actions } = await listConversation(user.id);
  return (
    <>
      <PageHeader title="Assistente IA" description="Consultas, resumos e mensagens com base nos dados reais do sistema — ações só com sua confirmação" />
      <AssistantChat
        mode={process.env.ANTHROPIC_API_KEY ? "claude" : "local"}
        canAct={can(user.role, "assistant:act")}
        initial={messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt, actionIds: (m.payload?.actionIds as string[]) ?? [], mode: m.payload?.mode as string | undefined }))}
        actions={actions.map((a) => ({ id: a.id, description: a.description, status: a.status, items: ((a.payload.items as { title: string; dueDate: string }[]) ?? []).map((i) => ({ title: i.title, dueDate: i.dueDate })) }))}
      />
    </>
  );
}
