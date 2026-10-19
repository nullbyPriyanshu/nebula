"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useNebula } from "@/context/NebulaContext";
import { chooseMode, hasWorkInProgress } from "@/lib/nebula-store";
import { useReveal } from "./landing/motion";
import { Modes } from "./landing/sections";
import { CursorBubbles } from "./CursorBubbles";
import { DialogHost } from "./DialogHost";
import { SiteHeader } from "./site/SiteHeader";
import { SiteFooter } from "./site/SiteFooter";
import { Toasts } from "./Toasts";
import { UploadQueue } from "./UploadQueue";

// Public pages (the landing page and what it links to) are readable before a
// mode is chosen and always use the light palette they were designed in.
const PUBLIC = ["", "/security", "/faq", "/privacy"];

const isPublic = (pathname: string) => PUBLIC.includes(pathname.replace(/\/$/, ""));

const subscribeOnline = (update: () => void) => {
  window.addEventListener("online", update);
  window.addEventListener("offline", update);

  return () => {
    window.removeEventListener("online", update);
    window.removeEventListener("offline", update);
  };
};

function OfflineBanner() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

  if (online) return null;

  return (
    <div role="status" className="bg-ink px-4 py-2 text-center font-sans text-sm text-white">
      You are offline. The file list saved on this device is shown; uploads and
      downloads continue when the connection is back.
    </div>
  );
}

// While the saved file list is read (usually a few dozen milliseconds), the
// page area stays plain rather than flashing a skeleton.
function Loading() {
  return <div aria-busy="true" aria-label="Loading Nebula" className="flex-1" />;
}

export function Shell({ children }: { children: ReactNode }) {
  const state = useNebula();
  const { mode } = state;
  const pathname = usePathname();

  const started = mode === "private" || mode === "public";
  const publicPage = isPublic(pathname);
  const working = hasWorkInProgress(state);

  // Sections rise into view as they are scrolled to, on every page.
  useReveal(`${pathname}|${mode}`);

  // Each page starts at its top, unless the link points into it (/#modes).
  useEffect(() => {
    if (!window.location.hash) window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  // Closing the tab would stop uploads, downloads and bulk jobs halfway.
  useEffect(() => {
    if (!working) return;

    const warn = (event: BeforeUnloadEvent) => event.preventDefault();

    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [working]);

  let content: ReactNode = children;

  if (!publicPage && mode === "loading") {
    content = <Loading />;
  } else if (!publicPage && mode === "ask") {
    // An app page opened before choosing: choose here, then the page appears.
    content = <Modes onChoose={(next) => void chooseMode(next)} />;
  }

  return (
    // App pages fill exactly one screen on large displays; public pages scroll.
    <div className={`theme-light flex min-h-full flex-1 flex-col bg-background ${publicPage ? "" : "lg:h-dvh lg:min-h-0 lg:flex-none lg:overflow-hidden"}`}>
      <OfflineBanner />
      {mode === "public" && (
        <div className="bg-accent px-4 py-2 text-center font-sans text-sm text-accent-foreground">
          Public PC mode: nothing is saved on this computer. Signing in also
          signed you in to google.com here, so use an incognito window or sign
          out of Google when you leave.
        </div>
      )}

      <SiteHeader started={started} inApp={started && !publicPage} ready={mode !== "loading"} />

      <main className={publicPage ? "flex-1" : "flex flex-1 flex-col lg:min-h-0"}>
        {publicPage || mode === "loading" ? (
          content
        ) : (
          <div className="appear flex flex-1 flex-col lg:min-h-0">{content}</div>
        )}
      </main>

      {publicPage && <SiteFooter />}

      {started && !publicPage && <UploadQueue />}
      <Toasts />
      <DialogHost />
      <CursorBubbles />
    </div>
  );
}
