"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Arrow, Container, Logo } from "@/components/landing/parts";
import { useNebula } from "@/context/NebulaContext";
import { formatBytes } from "@/lib/format";

// One menu for everyone. Before a mode is chosen, the app pages ask for one first.
const NAV = [
  { href: "/", label: "Home" },
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
      className="flex h-11 items-center gap-2 rounded-full border border-ink bg-vanilla px-4 font-mono text-sm font-semibold uppercase text-ink transition-colors hover:bg-[#e5ded5]"
    >
      <span className={`h-2.5 w-2.5 rounded-full border border-ink ${connected.length ? "bg-[#28c840]" : "bg-melon"}`} />
      {connected.length ? `${formatBytes(free)} free` : "Connect"}
    </Link>
  );
}

// True while the landing page's own call to action is on screen. Then the
// header leaves its button out, so there is only ever one to click.
function useHeroButtonVisible(pathname: string) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (pathname !== "/") return;

    let observer: IntersectionObserver | undefined;

    // The page content can mount after the header, so wait for the button.
    const attach = () => {
      const button = document.getElementById("hero-start");

      if (!button || observer) return Boolean(button);

      observer = new IntersectionObserver(
        ([entry]) => setVisible(entry.isIntersecting),
        // The sticky header covers the top 76px.
        { rootMargin: "-76px 0px 0px 0px" },
      );
      observer.observe(button);

      return true;
    };

    const mutations = new MutationObserver(() => {
      if (attach()) mutations.disconnect();
    });

    if (!attach()) mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer?.disconnect();
    };
  }, [pathname]);

  // Only the landing page has a hero button.
  return pathname === "/" && visible;
}

// `ready` is false until the saved mode is read: the button on the right keeps
// its space but stays invisible, so it never flashes one label then another.
export function SiteHeader({ started, inApp, ready }: { started: boolean; inApp: boolean; ready: boolean }) {
  const pathname = usePathname();
  const heroButton = useHeroButtonVisible(pathname);
  // The phone menu belongs to the page it was opened on, so going to another
  // page closes it without an effect.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menuOpen = menuFor === pathname;

  useEffect(() => {
    if (!menuOpen) return;

    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuFor(null);
    };

    window.addEventListener("keydown", close);

    return () => window.removeEventListener("keydown", close);
  }, [menuOpen]);

  const action = inApp ? (
    <SpacePill />
  ) : (
    // Kept in the layout but faded out while the hero's button shows,
    // so the header does not jump when it comes back.
    <div
      inert={heroButton}
      aria-hidden={heroButton}
      className={`transition-[opacity,transform] duration-300 ${
        heroButton ? "pointer-events-none translate-y-1 opacity-0" : "opacity-100"
      }`}
    >
      {started ? (
        <Link href="/files/" className="l-btn l-btn-lime h-11 max-sm:px-3 max-sm:text-sm">Open my files <Arrow /></Link>
      ) : (
        <Link href="/#modes" className="l-btn l-btn-lime h-11 max-sm:px-3 max-sm:text-sm">Start free <Arrow /></Link>
      )}
    </div>
  );

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-ink/10 bg-vanilla/90 backdrop-blur-md">
      {/* Logo | menu, always centred | action. The menu stays put whatever the
          action button says. */}
      <Container className="grid h-[76px] grid-cols-[1fr_auto] items-center gap-4 max-md:h-16 lg:grid-cols-[1fr_auto_1fr] lg:[@media(max-height:820px)]:h-16">
        {/* The wordmark uses the headline face, so the logo matches the site's type. */}
        <Link href="/" aria-label="Nebula home" className="flex items-center gap-2.5 justify-self-start font-mono text-[24px] font-bold tracking-tight text-ink max-md:text-[21px]">
          <Logo className="h-8 w-8" />
          Nebula
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-x-1 font-sans text-[17px] text-ink lg:flex xl:gap-x-2 xl:text-lg">
          {NAV.map((item) => {
            const active = same(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative rounded-full px-3 py-1.5 transition-colors ${
                  active ? "font-semibold text-ink" : "text-ink/70 hover:bg-ink/5 hover:text-ink"
                }`}
              >
                {item.label}
                {active && <span className="absolute inset-x-3 -bottom-1 h-[3px] rounded-full bg-lime-strong ring-1 ring-ink" />}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 justify-self-end">
          <div
            aria-hidden={!ready}
            className={`transition-opacity duration-200 ${ready ? "opacity-100" : "invisible opacity-0"}`}
          >
            {action}
          </div>
          <button
            className="btn btn-icon h-11 w-11 lg:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            onClick={() => setMenuFor(menuOpen ? null : pathname)}
          >
            <Icon name={menuOpen ? "close" : "menu"} />
          </button>
        </div>
      </Container>

      {/* Below 1024px: the same links, as a panel under the bar. */}
      {menuOpen && (
        <nav id="site-menu" aria-label="Menu" className="border-t border-ink/10 bg-vanilla lg:hidden">
          <Container className="grid gap-1 py-3 sm:grid-cols-2">
            {NAV.map((item) => {
              const active = same(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center justify-between rounded-[12px] border px-4 py-3 font-sans text-lg ${
                    active ? "border-ink bg-lime font-semibold" : "border-transparent text-ink/80 hover:border-ink/20"
                  }`}
                >
                  {item.label}
                  <Arrow className="h-4 w-4 opacity-50" />
                </Link>
              );
            })}
          </Container>
        </nav>
      )}
    </header>
  );
}
