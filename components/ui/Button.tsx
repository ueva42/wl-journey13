import React from "react";

function cn(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

type Variant = "ghost" | "solid" | "danger";

export function Button({
  className,
  variant = "ghost",
  disabled,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm transition " +
    "disabled:opacity-50 disabled:cursor-not-allowed select-none";

  const styles =
    variant === "solid"
      ? "border border-fuchsia-400/25 bg-fuchsia-500/12 text-white hover:bg-fuchsia-500/18 " +
        "shadow-[0_0_18px_rgba(236,72,153,0.16)]"
      : variant === "danger"
      ? "border border-red-400/25 bg-red-500/10 text-white hover:bg-red-500/16 " +
        "shadow-[0_0_18px_rgba(239,68,68,0.12)]"
      : "border border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10";

  return (
    <button className={cn(base, styles, className)} disabled={disabled} {...props}>
      {children}
    </button>
  );
}
