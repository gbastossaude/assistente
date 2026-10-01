"use client";
import * as DM from "@radix-ui/react-dropdown-menu";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Dropdown = DM.Root;
export const DropdownTrigger = DM.Trigger;
export const DropdownLabel = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof DM.Label>) => (
  <DM.Label className={cn("px-2 py-1.5 text-xs font-semibold text-muted", className)} {...p} />
);
export const DropdownSeparator = () => <DM.Separator className="my-1 h-px bg-border" />;

export function DropdownContent({ className, align = "end", ...props }: React.ComponentPropsWithoutRef<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content align={align} sideOffset={6} className={cn("z-50 min-w-48 rounded-md border border-border bg-surface p-1 shadow-lg", className)} {...props} />
    </DM.Portal>
  );
}

export function DropdownItem({ className, ...props }: React.ComponentPropsWithoutRef<typeof DM.Item>) {
  return (
    <DM.Item
      className={cn("flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-2 data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted", className)}
      {...props}
    />
  );
}
