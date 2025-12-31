import "./globals.css";
import Nav from "@/components/Nav";

export const metadata = {
  title: "WL-Journey",
  description: "Gewicht & Gruppe",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className="dark">
      <body className="min-h-screen bg-[#05060a] text-zinc-100">
        {/* GTA-Style Background Layer */}
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          {/* Subtle city glow blobs */}
          <div className="absolute -top-40 left-1/2 h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-fuchsia-500/12 blur-3xl" />
          <div className="absolute top-44 left-8 h-[420px] w-[420px] rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="absolute bottom-10 right-10 h-[520px] w-[520px] rounded-full bg-emerald-500/10 blur-3xl" />

          {/* Dark vignette */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.06),transparent_55%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,0,0,0.0),rgba(0,0,0,0.75))]" />

          {/* Scanlines */}
          <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_bottom,rgba(255,255,255,0.10)_1px,transparent_1px)] [background-size:100%_4px]" />

          {/* Grain (cheap, works everywhere) */}
          <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle,rgba(255,255,255,0.9)_1px,transparent_1px)] [background-size:3px_3px]" />
        </div>

        <Nav />

        <main className="mx-auto w-full max-w-6xl px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
