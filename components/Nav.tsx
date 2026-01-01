"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useEffect, useMemo, useState } from "react";

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

function MobileNavItem({
  href,
  label,
  onGo,
}: {
  href: string;
  label: string;
  onGo: (href: string) => void;
}) {
  const path = usePathname();
  const active = path === href;

  return (
    <button
      onClick={() => onGo(href)}
      className={[
        "w-full rounded-2xl border px-4 py-3 text-left text-sm transition",
        active
          ? "border-fuchsia-400/30 bg-fuchsia-500/10 text-white"
          : "border-white/12 bg-white/10 text-zinc-100 hover:bg-white/12",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <span>{label}</span>
        {active ? (
          <span className="text-xs text-fuchsia-200">aktiv</span>
        ) : (
          <span className="text-xs opacity-50">›</span>
        )}
      </div>
    </button>
  );
}

export default function Nav() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const [open, setOpen] = useState(false);

  // ESC schließt Menü
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Scroll lock bei geöffnetem Drawer
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  async function logout() {
    try {
      setBusy(true);
      await supabase.auth.signOut();
      setOpen(false);
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#05060a]/70 backdrop-blur">
      {/* Neon hairline */}
      <div className="h-[2px] w-full bg-gradient-to-r from-fuchsia-500/40 via-cyan-500/30 to-emerald-500/30" />

      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        {/* LEFT: Brand + (Desktop links) */}
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="mr-2">
            <div className="hidden sm:block">
              <div className="text-sm font-semibold tracking-wide text-zinc-100">
                WL-Journey
              </div>
              <div className="text-[11px] text-zinc-400 -mt-0.5">
                neon crew mode
              </div>
            </div>

            {/* Mobile: kompakter Brand */}
            <div className="sm:hidden text-sm font-semibold tracking-wide text-zinc-100">
              WL-Journey
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden flex-wrap items-center gap-2 sm:flex">
            <NavLink href="/dashboard" label="Dashboard" />
            <NavLink href="/group/dashboard" label="Gruppen-Dashboard" />
            <NavLink href="/training" label="Training" />
            <NavLink href="/group" label="Meine Gruppe" />
            <NavLink href="/training/types" label="Sportarten" />
            <NavLink href="/potatoes" label="Der Plan 2.0" />
          </nav>
        </div>

        {/* RIGHT: Desktop Logout + Mobile Hamburger */}
        <div className="flex items-center gap-2">
          {/* Desktop Logout */}
          <button
            onClick={logout}
            disabled={busy}
            className={[
              "hidden sm:inline-flex rounded-xl px-3 py-2 text-sm transition",
              "border border-white/10 bg-white/5 hover:bg-white/10",
              "text-zinc-100 disabled:opacity-50",
              "shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_0_18px_rgba(236,72,153,0.10)]",
            ].join(" ")}
          >
            {busy ? "…" : "Logout"}
          </button>

          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={[
              "sm:hidden inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition",
              "border border-white/10 bg-white/5 hover:bg-white/10",
              "text-zinc-100",
              "shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_0_18px_rgba(34,211,238,0.10)]",
            ].join(" ")}
            aria-label="Menü öffnen"
          >
            <span className="text-lg leading-none">☰</span>
            Menü
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {open && (
        <div className="sm:hidden">
          {/* Backdrop (dunkler für bessere Lesbarkeit) */}
          <button
            className="fixed inset-0 z-40 bg-black/80"
            onClick={() => setOpen(false)}
            aria-label="Menü schließen"
          />

          {/* Drawer Panel (opak + hoher Kontrast) */}
          <div className="fixed right-0 top-0 z-50 h-full w-[86%] max-w-sm border-l border-white/15 bg-[#070812] p-4 shadow-[0_30px_80px_rgba(0,0,0,0.85)]">
            {/* Top */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-100">
                  Navigation
                </div>
                <div className="text-[11px] text-zinc-400 -mt-0.5">
                  WL-Journey • neon crew mode
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-xl border border-white/12 bg-white/10 px-3 py-2 text-sm hover:bg-white/12 text-zinc-100"
              >
                ✕
              </button>
            </div>

            {/* Links */}
            <div className="mt-4 space-y-2">
              <MobileNavItem href="/dashboard" label="Dashboard" onGo={go} />
              <MobileNavItem
                href="/group/dashboard"
                label="Gruppen-Dashboard"
                onGo={go}
              />
              <MobileNavItem href="/training" label="Training" onGo={go} />
              <MobileNavItem href="/group" label="Meine Gruppe" onGo={go} />
              <MobileNavItem
                href="/training/types"
                label="Sportarten"
                onGo={go}
              />
              <MobileNavItem
                href="/potatoes"
                label="Der Plan 2.0"
                onGo={go}
              />
            </div>

            {/* Logout */}
            <div className="mt-6 border-t border-white/15 pt-4">
              <button
                onClick={logout}
                disabled={busy}
                className={[
                  "w-full rounded-2xl px-4 py-3 text-left text-sm transition",
                  "border border-white/12 bg-white/10 hover:bg-white/12",
                  "text-zinc-100 disabled:opacity-50",
                  "shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_0_18px_rgba(236,72,153,0.10)]",
                ].join(" ")}
              >
                {busy ? "…" : "Logout"}
              </button>

              <div className="mt-3 text-xs opacity-60">
                Tipp: Tippe außerhalb zum Schließen. ESC geht auch.
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
