"use client";

import { useState, useEffect } from "react";

/**
 * Returns true if the current viewport matches the given CSS media query.
 * SSR-safe: initialised to false on the server; on the client the lazy
 * initializer reads the current match result, and the effect subscribes to
 * future changes via a callback (no synchronous setState in effect body).
 */
export function useMediaQuery(query: string): boolean {
  // Lazy initializer runs only on the client (window is available) so we get
  // the correct value without a setState call inside useEffect.
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const media = window.matchMedia(query);

    function handleChange(e: MediaQueryListEvent) {
      setMatches(e.matches);
    }

    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
}
