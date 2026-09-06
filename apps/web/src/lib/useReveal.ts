import { useEffect, useRef, useState } from "react";

/**
 * Reveal a block once it has scrolled into view.
 *
 * Returns the flag rather than touching the DOM, so a caller can stagger a whole
 * group off one observer — `data-shown={shown}` on each child with its own
 * `transitionDelay` costs one observer instead of a dozen.
 *
 * It starts in the *shown* state whenever IntersectionObserver is missing. That
 * looks like a defensive nicety and is not: `.reveal` hides its element in CSS, so
 * anything that stops this hook from ever firing would leave the page permanently
 * blank. Failing open is the only acceptable direction here.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(margin = "-12% 0px") {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(
    () => typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Reveal once and stop watching. A section that faded out again on the way
        // back up would make the page feel unstable while re-reading it.
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: margin, threshold: 0.05 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [margin]);

  return [ref, shown] as const;
}

/** True when the reader has asked their OS for less motion. Read once at mount —
 *  this is used to decide whether the walkthrough auto-advances at all, and a
 *  carousel that started or stopped itself mid-view would be its own distraction. */
export function usePrefersReducedMotion() {
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  return reduced;
}
