import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names, letting a later Tailwind class win over an
 *  earlier one that targets the same property. Without twMerge, a variant's
 *  `px-4` and an override's `px-2` both land and the cascade decides at random. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
