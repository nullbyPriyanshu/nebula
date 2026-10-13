"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useNebula } from "@/context/NebulaContext";
import { chooseMode, dismissNotice } from "@/lib/nebula-store";

const NAV = [
  { href: "/", label: "My files" },
  { href: "/accounts/", label: "Accounts" },
  { href: "/analytics/", label: "Analytics" },
  { href: "/trash/", label: "Trash" },
  { href: "/settings/", label: "Settings" },
];

const same = (a: string, b: string) =>
  a.replace(/\/$/, "") === b.replace(/\/$/, "");

function ModeGate() {
  return (
    <div className="card mx-auto mt-10 max-w-md space-y-4">
      <h1 className="text-lg font-semibold">Whose computer is this?</h1>
      <p className="text-sm text-muted">
        On your own device Nebula remembers your file list between visits. On a
        shared or lab computer it saves nothing and logs you out after 5 idle
        minutes.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={() => chooseMode("private")}>
          My own device
        </button>
        <button className="btn" onClick={() => chooseMode("public")}>
          Public or shared PC
        </button>
      </div>
      <p className="text-xs text-muted">
        Only Google&apos;s own popup ever asks for your password. Check the
        address bar shows this site before you sign in.
      </p>
    </div>
  );
}

function Notices() {
  const { notices } = useNebula();

  return (
    <div className="space-y-2" aria-live="polite">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={`card flex items-start justify-between gap-3 py-2 text-sm ${
            notice.kind === "error" ? "border-danger text-danger" : ""
          }`}
        >
          <span className="break-words">{notice.text}</span>
          <button
            className="shrink-0 text-muted"
            aria-label="Dismiss"
            onClick={() => dismissNotice(notice.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { mode } = useNebula();
  const pathname = usePathname();

  // The privacy policy must be readable before any choice is made.
  const open = same(pathname, "/privacy");

  return (
    <>
      {mode === "public" && (
        <div className="bg-accent px-4 py-1.5 text-center text-sm text-accent-foreground">
          Public PC mode: nothing is saved on this computer. Signing in also
          signed you in to google.com here, so use an incognito window or sign
          out of Google when you leave.
        </div>
      )}

      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
          <Link href="/" className="text-lg font-semibold">
            Nebula
          </Link>
          <nav className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  same(pathname, item.href)
                    ? "font-semibold text-accent"
                    : "text-muted hover:text-foreground"
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 px-4 py-6">
        <Notices />
        {open || mode === "private" || mode === "public" ? (
          children
        ) : mode === "ask" ? (
          <ModeGate />
        ) : null}
      </main>

      <footer className="border-t border-border px-4 py-4 text-center text-xs text-muted">
        Files go straight from this browser to your own Google accounts.{" "}
        <Link href="/privacy/" className="underline">
          Privacy policy
        </Link>
      </footer>
    </>
  );
}
