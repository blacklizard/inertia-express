import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class names, resolving conflicting Tailwind utilities.
 * @param inputs Class values (strings, arrays, conditional objects).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
