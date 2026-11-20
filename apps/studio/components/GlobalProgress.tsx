"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./GlobalProgress.module.css";

// The loading bar at the very top of every page: shown while a request of the page is in flight (a fetch, a server
// action, the next page of the router). It counts fetches by wrapping window.fetch, so nothing has to opt in.
// It waits 150 ms before it shows (a quick answer never flickers it) and stays 400 ms once shown.

const SHOW_AFTER_MS = 150;
const SHOW_AT_LEAST_MS = 400;

/** The router prefetches links in view without the person asking: those are not "loading". */
function isPrefetch(init: RequestInit | undefined, input: RequestInfo | URL): boolean {
  const headers = init?.headers ?? (typeof input === "object" && "headers" in input ? input.headers : undefined);
  if (!headers) return false;
  if (headers instanceof Headers) return headers.has("next-router-prefetch");
  if (Array.isArray(headers)) return headers.some(([k]) => k.toLowerCase() === "next-router-prefetch");
  return Object.keys(headers).some((k) => k.toLowerCase() === "next-router-prefetch");
}

export function GlobalProgress() {
  const [busy, setBusy] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  // a manual popover lives in the top layer: the bar stays above a modal dialog and its backdrop too
  useEffect(() => {
    const el = bar.current;
    try {
      if (el && !el.matches(":popover-open")) el.showPopover();
    } catch {
      // no popover support: the fixed bar still shows, only under a dialog
    }
  }, []);

  useEffect(() => {
    const original = window.fetch;
    let inflight = 0;
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let shownAt = 0;

    const start = () => {
      inflight += 1;
      if (inflight > 1) return;
      clearTimeout(hideTimer);
      if (shownAt) return setBusy(true); // still showing from a moment ago
      showTimer = setTimeout(() => {
        shownAt = Date.now();
        setBusy(true);
      }, SHOW_AFTER_MS);
    };
    const end = () => {
      inflight = Math.max(0, inflight - 1);
      if (inflight > 0) return;
      clearTimeout(showTimer);
      if (!shownAt) return;
      hideTimer = setTimeout(() => {
        shownAt = 0;
        setBusy(false);
      }, Math.max(0, SHOW_AT_LEAST_MS - (Date.now() - shownAt)));
    };

    window.fetch = (input, init) => {
      if (isPrefetch(init, input)) return original(input, init);
      start();
      return original(input, init).finally(end);
    };
    return () => {
      window.fetch = original;
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  return <div ref={bar} popover="manual" className={styles.bar} data-busy={busy} role="progressbar" aria-label="กำลังทำงาน" aria-hidden={!busy} aria-busy={busy} />;
}
