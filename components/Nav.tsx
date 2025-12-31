"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useMemo, useState } from "react";

function NavLink({ href, label }: { href: string; label: string }) {
  const path = usePathname();
  const active = path === href;

  return (
    <Link
      href={href}
      className={[
        "relative rounded-xl px-3 py-2 text-sm transition",
        "border border-white/10 bg-white/5 hover:bg-white/10",
        "text-zinc-200 hover:text-white",
        active ? "border-fuchsia-400/30 bg-fuchsia-500/10 text-white" : "",
      ].join(" ")}
    >
      {/* Active neon underline */}
      {active ? (
        <span className="pointer-events-none absolute -bottom-[7px] left-2 right-2 h-[2px] rounded-full bg-fuchsia-400/70 blur-[0.3px]" />
      ) : null}
      {label}
    </Link>
  );
}

export default function Nav() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    try {
      setBusy(true);
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#05060a]/70 backdrop-blur">
      {/* Neon hairline */}
      <div className="h-[2px] w-full bg-gradient-to-r from-fuchsia-500/40 via-cyan-500/30 to-emerald-500/30" />

      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-2 hidden sm:block">
            <div className="text-sm font-semibold tracking-wide text-zinc-100">
              WL-Journey
            </div>
            <div className="text-[11px] text-zinc-400 -mt-0.5">
              neon crew mode
            </div>
          </div>

          <NavLink href="/dashboard" label="Dashboard" />
          <NavLink href="/group/dashboard" label="Gruppen-Dashboard" />
          {/* Training */}
          <NavLink href="/training" label="Training" />
          <NavLink href="/group" label="Meine Gruppe" />
          <NavLink href="/training/types" label="Sportarten" />
          <NavLink href="/potatoes" label="Der Plan 2.0" />

          
        </div>

        <button
          onClick={logout}
          disabled={busy}
          className={[
            "rounded-xl px-3 py-2 text-sm transition",
            "border border-white/10 bg-white/5 hover:bg-white/10",
            "text-zinc-100 disabled:opacity-50",
            "shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_0_18px_rgba(236,72,153,0.10)]",
          ].join(" ")}
        >
          {busy ? "…" : "Logout"}
        </button>
      </div>
    </header>
  );
}
