"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

function isEmailLike(v: string) {
  const s = v.trim();
  return s.includes("@") && s.includes(".");
}

export default function LoginPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");

  async function doLogin() {
    try {
      setStatus("");
      const e = email.trim().toLowerCase();
      if (!isEmailLike(e)) throw new Error("Bitte eine gültige E-Mail eingeben.");
      if (password.length < 6) throw new Error("Passwort zu kurz (min. 6 Zeichen).");

      setBusy(true);
      const { error } = await supabase.auth.signInWithPassword({
        email: e,
        password,
      });
      if (error) throw error;

      router.push("/dashboard");
      router.refresh();
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doSignup() {
    try {
      setStatus("");
      const e = email.trim().toLowerCase();
      if (!isEmailLike(e)) throw new Error("Bitte eine gültige E-Mail eingeben.");
      if (password.length < 6) throw new Error("Passwort zu kurz (min. 6 Zeichen).");
      if (password !== password2) throw new Error("Passwörter stimmen nicht überein.");

      setBusy(true);

      // Hinweis: Wenn bei dir "Email Confirmations" aktiv ist, muss der Nutzer erst bestätigen.
      const { error } = await supabase.auth.signUp({
        email: e,
        password,
        options: {
          // falls Email-Confirmation aktiv: Link führt nach dem Klick hierhin
          emailRedirectTo:
            typeof window !== "undefined" ? `${window.location.origin}/dashboard` : undefined,
        },
      });

      if (error) throw error;

      setStatus(
        "Account erstellt. Falls E-Mail-Bestätigung aktiv ist: Bitte bestätige die Mail. Danach kannst du dich einloggen."
      );
      setMode("login");
      setPassword("");
      setPassword2("");
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doReset() {
    try {
      setStatus("");
      const e = email.trim().toLowerCase();
      if (!isEmailLike(e)) throw new Error("Bitte eine gültige E-Mail eingeben.");

      setBusy(true);

      // Supabase schickt eine Reset-Mail. Der Link führt typischerweise auf /auth/callback
      // oder auf eine Seite, die du dafür baust (z.B. /reset). Für den Start reicht das so.
      const { error } = await supabase.auth.resetPasswordForEmail(e, {
        redirectTo: typeof window !== "undefined" ? `${window.location.origin}/reset` : undefined,
      });

      if (error) throw error;

      setStatus("Passwort-Reset Mail wurde gesendet (Spam prüfen).");
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs opacity-80">
            <span>🔒</span>
            <span>Login</span>
          </div>

          <h1 className="text-3xl font-semibold tracking-tight">WL-Journey</h1>
          <p className="text-sm opacity-70">
            {mode === "login"
              ? "Melde dich mit E-Mail + Passwort an."
              : mode === "signup"
              ? "Account erstellen."
              : "Passwort zurücksetzen."}
          </p>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/5 p-6 space-y-4">
          {/* Tabs */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setStatus("");
              }}
              className={`flex-1 rounded-xl border border-white/15 px-3 py-2 text-sm hover:bg-white/10 ${
                mode === "login" ? "bg-white/10" : ""
              }`}
              disabled={busy}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setStatus("");
              }}
              className={`flex-1 rounded-xl border border-white/15 px-3 py-2 text-sm hover:bg-white/10 ${
                mode === "signup" ? "bg-white/10" : ""
              }`}
              disabled={busy}
            >
              Sign up
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("reset");
                setStatus("");
              }}
              className={`flex-1 rounded-xl border border-white/15 px-3 py-2 text-sm hover:bg-white/10 ${
                mode === "reset" ? "bg-white/10" : ""
              }`}
              disabled={busy}
            >
              Reset
            </button>
          </div>

          {/* Inputs */}
          <div className="space-y-2">
            <div className="text-sm font-semibold">E-Mail</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@domain.de"
              inputMode="email"
              autoComplete="email"
              className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none"
            />
          </div>

          {mode !== "reset" && (
            <div className="space-y-2">
              <div className="text-sm font-semibold">Passwort</div>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="mind. 6 Zeichen"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none"
              />
            </div>
          )}

          {mode === "signup" && (
            <div className="space-y-2">
              <div className="text-sm font-semibold">Passwort wiederholen</div>
              <input
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                type="password"
                autoComplete="new-password"
                className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none"
              />
            </div>
          )}

          {/* Action button */}
          {mode === "login" && (
            <button
              onClick={doLogin}
              disabled={busy}
              className="w-full rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
            >
              {busy ? "…" : "Einloggen"}
            </button>
          )}

          {mode === "signup" && (
            <button
              onClick={doSignup}
              disabled={busy}
              className="w-full rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
            >
              {busy ? "…" : "Account erstellen"}
            </button>
          )}

          {mode === "reset" && (
            <button
              onClick={doReset}
              disabled={busy}
              className="w-full rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
            >
              {busy ? "…" : "Reset-Mail senden"}
            </button>
          )}

          <div className="text-xs opacity-60">
            Hinweis: Wenn Supabase „Email Confirmation“ aktiv hat, musst du nach Signup erst die Mail bestätigen.
          </div>
        </div>

        {status ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">{status}</div>
        ) : null}
      </div>
    </div>
  );
}
