"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Arrow, Container, Logo } from "@/components/landing/parts";
import { useNebula } from "@/context/NebulaContext";
import { formatBytes } from "@/lib/format";

// Before a mode is chosen the header tours the public pages; after, it is the app's.
const PUBLIC_NAV = [
  { href: "/", label: "Home" },
  { href: "/#features", label: "Features" },
  { href: "/security/", label: "Security" },
  { href: "/faq/", label: "FAQ" },
];

const APP_NAV = [
  { href: "/files/", label: "My files" },
  { href: "/accounts/", label: "Accounts" },
  { href: "/analytics/", label: "Analytics" },
  { href: "/trash/", label: "Trash" },
  { href: "/settings/", label: "Settings" },
  { href: "/faq/", label: "Help" },
];

const same = (a: string, b: string) => a.replace(/\/$/, "") === b.replace(/\/$/, "");

// Pooled free space, or a nudge to connect, linking to Accounts.
function SpacePill() {
  const { index, runtime } = useNebula();
  const connected = index.accounts.filter((a) => runtime[a.email]?.connected);
  const free = connected.reduce((sum, a) => sum + Math.max(0, runtime[a.email].total - runtime[a.email].used), 0);

  return (
    <Link
      href="/accounts/"
      className="flex h-12 items-center gap-2 rounded-full border border-ink bg-vanilla px-4 font-mono text-sm font-semibold uppercase text-ink transition-colors hover:bg-[#e5ded5] max-lg:h-10"
    >
      <span className={`h-2.5 w-2.5 rounded-full border border-ink ${connected.length ? "bg-[#28c840]" : "bg-melon"}`} />
      {connected.length ? `${formatBytes(free)} free` : "Connect"}
    </Link>
  );
}

export function SiteHeader({ started, inApp }: { started: boolean; inApp: boolean }) {
  const pathname = usePathname();
  const nav = started ? APP_NAV : PUBLIC_NAV;

  return (
    <header className="sticky top-0 z-30 border-b border-ink/10 bg-vanilla/90 backdrop-blur-md">
      <Container className="flex h-[88px] items-center justify-between gap-4 max-lg:h-auto max-lg:flex-wrap max-lg:py-3">
        <Link href="/" aria-label="Nebula home" className="flex items-center gap-2 font-sans text-[28px] text-ink max-md:text-2xl">
          <Logo className="h-8 w-8" />
          Nebula
        </Link>
        <nav
          aria-label="Main"
          className="flex items-center gap-x-6 font-sans text-xl text-ink max-lg:order-3 max-lg:-mx-1 max-lg:w-full max-lg:gap-x-5 max-lg:overflow-x-auto max-lg:px-1 max-lg:pb-1 max-lg:text-base"
        >
          {nav.map((item) => {
            const active = same(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative shrink-0 py-1 transition-colors ${active ? "font-semibold" : "text-ink/75 hover:text-ink"}`}
              >
                {item.label}
                {active && <span className="absolute inset-x-0 -bottom-0.5 h-[3px] rounded-full bg-lime-strong ring-1 ring-ink" />}
              </Link>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-3">
          {inApp ? (
            <SpacePill />
          ) : started ? (
            <Link href="/files/" className="l-btn l-btn-lime">Open my files <Arrow /></Link>
          ) : (
            <Link href="/#modes" className="l-btn l-btn-lime">Start free <Arrow /></Link>
          )}
        </div>
      </Container>
    </header>
  );
}
