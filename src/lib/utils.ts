import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format as fnsFormat } from "date-fns";
import { es } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format currency: comma as thousands separator, dot as decimal.
 * e.g. $1,234.56
 */
export const $$ = (n: number | null | undefined): string =>
  `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Format a date as dd/MM/yyyy (or custom pattern) using es locale.
 */
export function fmtDate(
  date: string | Date | null | undefined,
  pattern: string = "dd/MM/yyyy"
): string {
  if (!date) return "—";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    return fnsFormat(d, pattern, { locale: es });
  } catch {
    return "—";
  }
}

/**
 * Format a date with time: dd/MM/yyyy HH:mm
 */
export function fmtDateTime(date: string | Date | null | undefined): string {
  return fmtDate(date, "dd/MM/yyyy HH:mm");
}

/**
 * Format a number with comma thousands separator.
 */
export function fmtNumber(n: number | null | undefined): string {
  return (n || 0).toLocaleString("en-US");
}
