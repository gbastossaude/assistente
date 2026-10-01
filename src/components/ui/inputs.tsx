import * as React from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground shadow-xs placeholder:text-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-red-500";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(base, "h-9", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, rows = 3, ...props }, ref) => (
  <textarea ref={ref} rows={rows} className={cn(base, "py-2", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(base, "h-9 pr-8", className)} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-medium text-muted", className)} {...props} />;
}

export function Field({
  label,
  error,
  hint,
  required,
  className,
  children,
  htmlFor,
}: {
  label: React.ReactNode;
  error?: string | string[] | null;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  const msg = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </Label>
      {children}
      {msg ? <p className="text-xs text-red-600">{msg}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** Seletor Sim/Não/Não informado — distingue "não declarado" (null) de "Não". */
export function YesNo({ value, onChange, name, disabled }: { value: boolean | null | undefined; onChange: (v: boolean | null) => void; name: string; disabled?: boolean }) {
  const opts: { v: boolean | null; l: string }[] = [
    { v: true, l: "Sim" },
    { v: false, l: "Não" },
    { v: null, l: "—" },
  ];
  return (
    <div role="radiogroup" aria-label={name} className="inline-flex rounded-md border border-border bg-surface p-0.5">
      {opts.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          role="radio"
          aria-checked={value === o.v || (o.v === null && value === undefined)}
          disabled={disabled}
          onClick={() => onChange(o.v)}
          className={cn(
            "rounded px-3 py-1 text-xs font-medium",
            value === o.v || (o.v === null && value === undefined) ? (o.v === true ? "bg-primary text-primary-foreground" : o.v === false ? "bg-slate-600 text-white" : "bg-surface-2") : "text-muted hover:bg-surface-2",
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}
