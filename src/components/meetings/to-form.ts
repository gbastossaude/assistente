import type { meetings } from "@/server/db/schema";
import type { MeetingFormValue } from "./meeting-form";

export function meetingToForm(m: typeof meetings.$inferSelect): MeetingFormValue {
  return {
    id: m.id,
    title: m.title,
    opportunityId: m.opportunityId ?? "",
    companyId: m.companyId ?? "",
    quotationId: m.quotationId ?? "",
    clientName: m.clientName ?? "",
    companyName: m.companyName ?? "",
    advisorName: m.advisorName ?? "",
    salesRepName: m.salesRepName ?? "",
    ownerId: m.ownerId ?? "",
    date: m.date,
    startTime: m.startTime?.slice(0, 5) ?? "",
    endTime: m.endTime?.slice(0, 5) ?? "",
    participants: m.participants ?? "",
    location: m.location ?? "",
    objective: m.objective ?? "",
    summary: m.summary ?? "",
    status: m.status,
    questions: m.questions,
    actions: m.actions,
    addToAgenda: !!m.calendarEventId,
  };
}
