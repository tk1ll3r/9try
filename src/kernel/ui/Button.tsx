import type { ButtonHTMLAttributes } from "react";

const looks = {
  primary: "bg-[var(--ink)] text-[var(--paper)] hover:shadow-lg",
  secondary: "bg-[var(--lime)] text-[var(--ink)] hover:shadow-[0_10px_30px_-12px_var(--lime-strong)]",
  ghost: "bg-transparent hover:bg-[color-mix(in_srgb,var(--ink)_7%,transparent)]",
  danger: "bg-red-600 text-white hover:shadow-lg",
  // White in both themes: the look Google asks for on its sign-in button.
  white: "border border-[#747775] bg-white text-[#1f1f1f] hover:shadow-lg",
};

/** The app's button. It lifts a little under the pointer and gives way under a press. */
export function Button({ className = "", variant = "primary", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof looks }) {
  return <button type={type} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-[transform,box-shadow,background-color,opacity] duration-200 ease-[var(--ease-out)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:pointer-events-none disabled:opacity-50 ${looks[variant]} ${className}`} {...props} />;
}
