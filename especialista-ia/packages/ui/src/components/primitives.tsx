import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "../lib.ts";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        primary: "bg-brand-900 text-white hover:bg-brand-800 shadow-sm",
        accent: "bg-accent-600 text-white hover:bg-accent-500 shadow-sm",
        outline: "border border-ink-300 bg-white text-ink-900 hover:bg-ink-100",
        ghost: "text-ink-700 hover:bg-ink-100",
        danger: "bg-danger-600 text-white hover:bg-danger-600/90",
        link: "text-accent-600 underline-offset-4 hover:underline px-0",
      },
      size: { sm: "h-8 px-3 text-xs", md: "h-10 px-4", lg: "h-11 px-6 text-base", icon: "h-9 w-9" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </Comp>
  );
});
Button.displayName = "Button";

const fieldBase =
  "w-full rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-500 shadow-xs transition-colors focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 disabled:bg-ink-100 disabled:text-ink-500";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(fieldBase, "h-10", className)} {...p} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, "min-h-[88px] py-2 leading-relaxed", className)} {...p} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <select ref={ref} className={cn(fieldBase, "h-10 pr-8", className)} {...p}>
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-medium text-ink-700", className)} {...p} />;
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string | null; children: React.ReactNode; className?: string }) {
  const id = React.useId();
  const child = React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<{ id?: string; "aria-describedby"?: string }>, { id, "aria-describedby": hint || error ? `${id}-d` : undefined }) : children;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {child}
      {(error || hint) && (
        <p id={`${id}-d`} className={cn("text-xs", error ? "text-danger-600" : "text-ink-500")}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", {
  variants: {
    tone: {
      neutral: "bg-ink-100 text-ink-700 ring-ink-200",
      brand: "bg-brand-900 text-white ring-brand-900",
      info: "bg-accent-50 text-accent-600 ring-accent-500/20",
      success: "bg-success-50 text-success-600 ring-success-600/20",
      warning: "bg-warning-50 text-warning-600 ring-warning-600/20",
      danger: "bg-danger-50 text-danger-600 ring-danger-600/20",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...p} />;
}

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-card)] border border-ink-200 bg-white shadow-sm", className)} {...p} />;
}
export function CardHeader({ title, description, actions, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4", className)}>
      <div>
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
export function CardBody({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...p} />;
}

export function Spinner({ className, label = "Carregando" }: { className?: string; label?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-accent-600", className)} role="status" aria-label={label} />;
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="mb-1 rounded-full bg-ink-100 p-3 text-ink-500">{icon}</div>}
      <p className="text-sm font-medium text-ink-900">{title}</p>
      {description && <p className="max-w-sm text-xs text-ink-500">{description}</p>}
      {action}
    </div>
  );
}

export function Alert({ tone = "info", title, children, className }: { tone?: "info" | "warning" | "danger" | "success"; title?: string; children?: React.ReactNode; className?: string }) {
  const tones = {
    info: "border-accent-500/30 bg-accent-50 text-brand-900",
    warning: "border-warning-600/30 bg-warning-50 text-warning-600",
    danger: "border-danger-600/30 bg-danger-50 text-danger-600",
    success: "border-success-600/30 bg-success-50 text-success-600",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-lg border px-3 py-2.5 text-xs leading-relaxed", tones[tone], className)}>
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      {children}
    </div>
  );
}

export function StatusDot({ online, label }: { online: boolean | null; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-700" title={label}>
      <span className={cn("h-2 w-2 rounded-full", online === null ? "bg-ink-300" : online ? "bg-success-600" : "bg-danger-600")} aria-hidden />
      {label}
    </span>
  );
}
