"use client";
import { flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useState } from "react";
import { Input } from "./inputs";

/** Tabela com ordenação por coluna e filtro rápido (TanStack Table). */
export function DataTable<T>({ data, columns, filterPlaceholder = "Filtrar…", initialSort, empty }: { data: T[]; columns: ColumnDef<T, unknown>[]; filterPlaceholder?: string; initialSort?: SortingState; empty?: React.ReactNode }) {
  const [sorting, setSorting] = useState<SortingState>(initialSort ?? []);
  const [globalFilter, setGlobalFilter] = useState("");
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Input value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} placeholder={filterPlaceholder} className="max-w-xs" aria-label="Filtro rápido" />
        <span className="text-xs text-muted">{table.getFilteredRowModel().rows.length} registro(s)</span>
      </div>
      <div className="w-full overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  return (
                    <th key={h.id} className="whitespace-nowrap border-b border-border bg-surface-2/60 px-3 py-2 text-left text-xs font-semibold text-muted">
                      {h.isPlaceholder ? null : h.column.getCanSort() ? (
                        <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={h.column.getToggleSortingHandler()}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === "asc" ? <ArrowUp className="size-3" /> : sorted === "desc" ? <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id} className="hover:bg-surface-2/50">
                {r.getVisibleCells().map((c) => (
                  <td key={c.id} className="border-b border-border px-3 py-2 align-top">
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-muted">
                  {empty ?? "Nenhum registro"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
