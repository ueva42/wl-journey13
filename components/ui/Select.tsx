import React from "react";

function cn(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select
      className={cn(
        "w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm outline-none",
        "text-zinc-100",
        "focus:border-cyan-400/30 focus:ring-2 focus:ring-cyan-400/15",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
