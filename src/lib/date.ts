import { format, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";

export const formatDateID = (input: string | Date) =>
  format(typeof input === "string" ? parseISO(input) : input, "EEEE, d MMMM yyyy", { locale: idLocale });

export const formatShortDateID = (input: string | Date) =>
  format(typeof input === "string" ? parseISO(input) : input, "d MMM yyyy", { locale: idLocale });

export const formatMonthYearID = (input: string | Date) =>
  format(typeof input === "string" ? parseISO(input) : input, "MMMM yyyy", { locale: idLocale });

export const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
] as const;

export const periodFromMonthYear = (month: number, year: number) =>
  `${year}-${String(month).padStart(2, "0")}`;

export const periodToLabel = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS_ID[m - 1]} ${y}`;
};

export const billNameFromPeriod = (period: string) => `IPL ${periodToLabel(period)}`;

export const periodFromDueDate = (dueDate: string) => {
  const [y, m] = dueDate.split("-");
  return `${y}-${m}`;
};

export const currentShiftType = (now = new Date()): "pagi" | "malam" => {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    hour12: false,
  });
  const hour = parseInt(fmt.format(now), 10);
  return hour >= 7 && hour < 19 ? "pagi" : "malam";
};

export const currentShiftDate = (now = new Date()): string => {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const hourFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false,
  });
  const hour = parseInt(hourFmt.format(now), 10);
  if (hour < 7) {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return fmt.format(yesterday);
  }
  return fmt.format(now);
};
