import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format as fnsFormat, parseISO } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Parse a date string without timezone shift.
 * "2026-05-16" → local May 16, not UTC which could shift to May 15.
 */
export function parseLocalDate(dateStr: string): Date {
  // If it's a date-only string (yyyy-MM-dd), parse manually to avoid UTC interpretation
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return parseISO(dateStr);
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Global currency symbol — set once when empresa loads.
 */
let _currencySymbol = "$";

export function setCurrencySymbol(symbol: string) {
  _currencySymbol = symbol || "$";
}

export function getCurrencySymbol(): string {
  return _currencySymbol;
}

/**
 * Format currency: comma as thousands separator, dot as decimal.
 * Uses the globally configured currency symbol.
 * e.g. $1,234.56  or  Q1,234.56
 */
export const $$ = (n: number | null | undefined): string =>
  `${_currencySymbol}${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Format a date as dd/MM/yyyy (or custom pattern) using es locale.
 */
export function fmtDate(
  date: string | Date | null | undefined,
  pattern: string = "dd/MM/yyyy"
): string {
  if (!date) return "—";
  try {
    const d = typeof date === "string" ? parseLocalDate(date) : date;
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
