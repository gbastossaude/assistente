"use client";
import * as React from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogFooter } from "./dialog";

/** Confirmação obrigatória para ações destrutivas (seção 32). */
export function ConfirmButton({
  children,
  title,
  description,
  confirmLabel = "Confirmar",
  onConfirm,
  variant = "destructive",
  triggerVariant = "ghost",
  size = "sm",
  disabled,
  className,
}: {
  children: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => Promise<unknown> | void;
  variant?: "destructive" | "default";
  triggerVariant?: "ghost" | "outline" | "destructive" | "default" | "secondary";
  size?: "sm" | "default" | "icon-sm" | "icon";
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant={triggerVariant} size={size} onClick={() => setOpen(true)} disabled={disabled} className={className}>
        {children}
      </Button>
      <DialogContent title={title} size="sm">
        {description && <div className="text-sm text-muted">{description}</div>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant={variant}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                setOpen(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
