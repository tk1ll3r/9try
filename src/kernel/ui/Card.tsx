import type { ReactNode } from "react";

/** A titled panel. Slightly see-through, so the lights behind the page tint it. */
export function Card({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`rounded-[28px] border border-black/8 bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] p-5 shadow-[0_12px_40px_rgba(28,30,22,.05)] backdrop-blur-md transition-shadow duration-300 hover:shadow-[0_18px_50px_rgba(28,30,22,.09)] dark:border-white/8 ${className}`}>
    {(title || action) && <div className="mb-4 flex items-center justify-between gap-3">{title && <h2 className="font-bold">{title}</h2>}{action}</div>}
    {children}
  </section>;
}
