import type { OperatorRow, ProductRow } from "@especialista/shared";
import { sb, unwrap } from "./supabase.ts";
import { useData } from "./use-data.ts";

export function useCatalog() {
  return useData(async () => {
    const [operators, products] = await Promise.all([
      sb.from("operators").select("*").order("name").then(unwrap<OperatorRow[]>),
      sb.from("products").select("*").order("name").then(unwrap<ProductRow[]>),
    ]);
    return { operators, products };
  }, []);
}
