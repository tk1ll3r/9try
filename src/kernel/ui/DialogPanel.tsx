import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

// Original styling over Radix's maintained focus/keyboard primitives.
export function DialogPanel({ open, onOpenChange, title, description, children, busy = false, alert = false, returnFocusId }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: ReactNode; busy?: boolean; alert?: boolean; returnFocusId?: string;
}) {
  return <Dialog.Root open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-sm" />
      <Dialog.Content role={alert ? "alertdialog" : "dialog"} aria-busy={busy} onOpenAutoFocus={event => {
        const field = (event.currentTarget as HTMLElement).querySelector<HTMLElement>("[data-dialog-initial-focus]");
        if (field) { event.preventDefault(); field.focus(); }
      }} onCloseAutoFocus={event => {
        const trigger = returnFocusId ? document.getElementById(returnFocusId) : null;
        if (trigger) { event.preventDefault(); trigger.focus(); }
      }} className="dialog-content fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 text-[var(--ink)] shadow-2xl sm:p-6">
        <div className="mb-2 flex items-start justify-between gap-4"><Dialog.Title className="text-2xl font-bold tracking-tight">{title}</Dialog.Title>
          <Dialog.Close disabled={busy} aria-label="Đóng hộp thoại" className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-[var(--soft)] disabled:opacity-50"><X size={20} /></Dialog.Close>
        </div>
        <Dialog.Description className="mb-5 text-sm leading-6 text-[var(--muted)]">{description}</Dialog.Description>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
