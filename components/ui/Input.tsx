import React from "react";

function cn(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm outline-none",
        "text-zinc-100 placeholder:text-zinc-500",
        "focus:border-fuchsia-400/30 focus:ring-2 focus:ring-fuchsia-400/15",
        className
      )}
      {...props}
    />
  );
}
