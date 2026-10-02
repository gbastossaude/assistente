import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { activityLogs, interactions, pendencies } from "@/server/db/schema";
import { companySchema, interactionSchema, pendencySchema } from "@/lib/validation/schemas";
import { createCompany } from "@/server/services/companies";
import { deleteInteraction, registerInteraction } from "@/server/services/interactions";
import { createPendency, deletePendency } from "@/server/services/pendencies";
import { dismissNotifications, listNotifications, notify, unreadCount } from "@/server/services/notifications";
import { hasTestDb, makeUser, resetTestDb } from "../helpers/db";
import type { CurrentUser } from "@/server/auth";

describe.skipIf(!hasTestDb)("exclusão de atividades, pendências e notificações (integração)", () => {
  let head: CurrentUser;
  let comercial: CurrentUser;
  let companyId: string;

  beforeAll(async () => {
    await resetTestDb();
    head = await makeUser("head");
    comercial = await makeUser("comercial");
    companyId = (await createCompany(companySchema.parse({ legalName: "Empresa Exclusões Ltda", mainCnpj: "11222333000181" }), head)).id;
  });

  const lastActivity = async (userId: string) => {
    const [i] = await db.select().from(interactions).where(and(eq(interactions.companyId, companyId), eq(interactions.userId, userId)));
    return i;
  };

  it("cada usuário exclui só as próprias atividades manuais; head exclui qualquer uma; tudo vai para a auditoria", async () => {
    await registerInteraction(interactionSchema.parse({ companyId, type: "ligacao", description: "Ligação de alinhamento" }), comercial);
    await registerInteraction(interactionSchema.parse({ companyId, type: "nota", description: "Nota do head" }), head);
    const own = await lastActivity(comercial.id);
    const others = await lastActivity(head.id);

    await expect(deleteInteraction(others.id, comercial)).rejects.toThrow(/você mesmo registrou/);
    await deleteInteraction(own.id, comercial);
    expect(await lastActivity(comercial.id)).toBeUndefined();

    await deleteInteraction(others.id, head);
    const logs = await db.select().from(activityLogs).where(and(eq(activityLogs.entityType, "interaction"), eq(activityLogs.action, "delete")));
    expect(logs.map((l) => l.entityId).sort()).toEqual([own.id, others.id].sort());
    expect(logs.every((l) => !l.summary.includes("alinhamento"))).toBe(true); // texto livre não vai para a auditoria
  });

  it("atividade automática do sistema só é excluída por quem tem permissão de exclusão", async () => {
    const [auto] = await db.insert(interactions).values({ companyId, type: "status", userId: comercial.id, description: "Status alterado" }).returning();
    await expect(deleteInteraction(auto.id, comercial)).rejects.toThrow(/você mesmo registrou/);
    await deleteInteraction(auto.id, head);
    await expect(deleteInteraction(auto.id, head)).rejects.toThrow(/não encontrad/);
  });

  it("pendência manual pode ser excluída; automática não (deve ser cancelada)", async () => {
    await createPendency(pendencySchema.parse({ category: "interna", title: "Conferir proposta", priority: "media" }), head.id);
    const [manual] = await db.select().from(pendencies).where(eq(pendencies.title, "Conferir proposta"));
    await deletePendency(manual.id, head.id);
    expect(await db.select().from(pendencies).where(eq(pendencies.id, manual.id))).toHaveLength(0);

    const [auto] = await db.insert(pendencies).values({ category: "documento", title: "Documento automático", origin: "checklist", priority: "media" }).returning();
    await expect(deletePendency(auto.id, head.id)).rejects.toThrow(/Cancelada/);
  });

  it("notificação excluída some da lista e não é recriada pela rotina (mesmo dedupeKey)", async () => {
    const alert = { userId: comercial.id, kind: "atraso", title: "Tarefa atrasada: X", dedupeKey: "overdue:teste:2026-01-01" };
    await notify(alert);
    await notify({ userId: comercial.id, kind: "lembrete", title: "Outro aviso" });
    expect(await unreadCount(comercial.id)).toBe(2);

    const [first] = (await listNotifications(comercial.id)).filter((n) => n.dedupeKey === alert.dedupeKey);
    await dismissNotifications(comercial.id, first.id);
    await notify(alert); // rotina horária tenta de novo
    expect((await listNotifications(comercial.id)).map((n) => n.title)).toEqual(["Outro aviso"]);
    expect(await unreadCount(comercial.id)).toBe(1);

    await dismissNotifications(head.id); // "limpar todas" de outro usuário não afeta este
    expect(await listNotifications(comercial.id)).toHaveLength(1);
    await dismissNotifications(comercial.id);
    expect(await listNotifications(comercial.id)).toHaveLength(0);
    expect(await unreadCount(comercial.id)).toBe(0);
  });
});
