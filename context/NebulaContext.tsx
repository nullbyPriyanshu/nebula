"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import * as store from "@/lib/nebula-store";

const IDLE_LIMIT = 5 * 60 * 1000;
// How often the index is pulled from the accounts while the tab is visible.
const SYNC_EVERY = 60 * 1000;
const ACTIVITY = ["mousemove", "keydown", "touchstart"] as const;

const NebulaContext = createContext<store.NebulaState>(store.getServerState());

export function NebulaProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getServerState,
  );

  useEffect(() => store.init(), []);

  // Pick up changes made in another tab or on another device.
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState === "visible") void store.syncNow();
    };
    const timer = window.setInterval(sync, SYNC_EVERY);

    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("online", sync);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("online", sync);
    };
  }, []);

  // The app shell works offline once installed; only in production builds.
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // "system" leaves both classes off and lets the media query decide.
  const theme = state.index.settings.theme;

  useEffect(() => {
    const root = document.documentElement.classList;

    root.toggle("dark", theme === "dark");
    root.toggle("light", theme === "light");
  }, [theme]);

  // Public-PC mode: log out after 5 idle minutes and when the page goes away.
  const isPublic = state.mode === "public";

  useEffect(() => {
    if (!isPublic) {
      return;
    }

    let timer = window.setTimeout(store.logoutAll, IDLE_LIMIT);

    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(store.logoutAll, IDLE_LIMIT);
    };

    ACTIVITY.forEach((event) =>
      window.addEventListener(event, reset, { passive: true }),
    );
    window.addEventListener("pagehide", store.logoutAll);

    return () => {
      window.clearTimeout(timer);
      ACTIVITY.forEach((event) => window.removeEventListener(event, reset));
      window.removeEventListener("pagehide", store.logoutAll);
    };
  }, [isPublic]);

  return <NebulaContext value={state}>{children}</NebulaContext>;
}

export const useNebula = () => useContext(NebulaContext);
