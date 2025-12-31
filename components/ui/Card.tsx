import React from "react";

function cn(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/10 bg-white/5",
        "shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_10px_40px_rgba(0,0,0,0.45)]",
        "backdrop-blur-sm",
        "before:pointer-events-none before:absolute before:inset-0",
        "before:bg-[radial-gradient(1200px_circle_at_20%_-10%,rgba(236,72,153,0.14),transparent_40%),radial-gradient(900px_circle_at_110%_40%,rgba(34,211,238,0.10),transparent_42%),radial-gradient(900px_circle_at_30%_120%,rgba(16,185,129,0.08),transparent_45%)]",
        "before:opacity-100",
        className
      )}
    >
      {/* subtle scanline overlay */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_bottom,rgba(255,255,255,0.10)_1px,transparent_1px)] [background-size:100%_5px]" />
      <div className="relative">{children}</div>
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 p-5", className)}>
      <div className="min-w-0">
        <div className="text-sm font-semibold tracking-wide text-zinc-100">{title}</div>
        {subtitle ? <div className="mt-1 text-xs text-zinc-400">{subtitle}</div> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("px-5 pb-5", className)}>{children}</div>;
}

export function Divider({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent",
        className
      )}
    />
  );
}
