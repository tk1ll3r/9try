import type { ReactNode } from "react";

/** A titled panel that uses the same surface and border tokens across light and dark themes. */
export function Card({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_12px_40px_rgba(49,23,38,.045)] ${className}`}>
    {(title || action) && <div className="mb-4 flex items-center justify-between gap-3">{title && <h2 className="font-bold">{title}</h2>}{action}</div>}
    {children}
  </section>;
}
