import { useEffect, useRef } from "react";

/**
 * Re-run `fn` every `intervalMs` while `active` is true.
 *
 * OCR takes seconds per page in the worker, so the upload screen has to keep
 * asking. The callback is held in a ref so a caller can pass an inline arrow
 * function without restarting the timer on every render.
 */
export function usePolling(fn: () => void, active: boolean, intervalMs = 2000) {
  const saved = useRef(fn);
  saved.current = fn;

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => saved.current(), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);
}
