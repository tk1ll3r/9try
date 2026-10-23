import type { ButtonHTMLAttributes } from "react";

const looks = {
  primary: "bg-[var(--ink)] text-[var(--paper)]",
  secondary: "bg-[var(--lime)] text-[#160f14]",
  ghost: "bg-transparent",
  danger: "bg-red-600 text-white",
  // White in both themes: the look Google asks for on its sign-in button.
  white: "border border-[#747775] bg-white text-[#1f1f1f]",
};

/** Shared button sizing, focus, and press behavior; pointer hover is handled only on hover-capable devices. */
export function Button({ className = "", variant = "primary", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof looks }) {
  return <button type={type} data-variant={variant} className={`app-button inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-[transform,box-shadow,background-color,opacity] duration-200 ease-[var(--ease-out)] active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:pointer-events-none disabled:opacity-50 ${looks[variant]} ${className}`} {...props} />;
}
