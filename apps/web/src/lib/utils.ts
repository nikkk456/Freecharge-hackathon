import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names, letting a later Tailwind class win over an
 *  earlier one that targets the same property. Without twMerge, a variant's
 *  `px-4` and an override's `px-2` both land and the cascade decides at random. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * An ISO timestamp as a plain `YYYY-MM-DD` day.
 *
 * The API sends dates two ways: `issued_date` is already a bare day, while
 * `created_at` and friends are full timestamps. Rendering the second with
 * `toLocaleDateString()` put `9/7/2026` next to `2021-08-25` in the same strip,
 * which is two date formats side by side and a reader having to work out that both
 * are dates. One shape everywhere.
 *
 * Built from the local parts on purpose: `toISOString()` converts to UTC first, so
 * an upload logged at 00:16 IST would report the previous day.
 */
export function isoDay(timestamp: string): string {
  const at = new Date(timestamp);
  if (Number.isNaN(at.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}
