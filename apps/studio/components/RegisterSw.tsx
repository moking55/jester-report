"use client";

import { useEffect } from "react";

/** Registers the service worker (public/sw.js) in production; its URL carries the version so a new build replaces the old cache. */
export function RegisterSw({ version }: { version: string }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(version)}`).catch(() => {
      // no service worker (http on a LAN address, a private window): Studio works the same, only not installable
    });
  }, [version]);
  return null;
}
