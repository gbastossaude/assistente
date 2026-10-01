import type { TaskRow } from "@/server/services/tasks";
import type { TaskView } from "./task-list";

export function toTaskViews(rows: TaskRow[]): TaskView[] {
  return rows.map((r) => ({ ...r.t, companyName: r.companyName, quotationCode: r.quotationCode, insurerName: r.insurerName, ownerName: r.ownerName }));
}
