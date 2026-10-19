import { differenceInCalendarDays, format, parseISO } from "date-fns";

export function money(n: number | string | null | undefined, currency = "INR") {
  const v = Number(n ?? 0);
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return format(parseISO(d), "dd MMM yyyy");
}

export function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  return format(parseISO(d), "dd MMM yyyy, h:mm a");
}

export function nights(a: string, b: string) {
  return Math.max(0, differenceInCalendarDays(parseISO(b), parseISO(a)));
}

export function todayISO() {
  return format(new Date(), "yyyy-MM-dd");
}

export function addDaysISO(iso: string, days: number) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return format(d, "yyyy-MM-dd");
}

export const STATUS_LABEL: Record<string, string> = {
  reserved: "Reserved",
  checked_in: "Checked in",
  checked_out: "Checked out",
  cancelled: "Cancelled",
};

export function errMsg(e: unknown) {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: string }).message);
  return "Something went wrong";
}

/** Indian mobile normalisation for WhatsApp links: keeps digits, adds 91 for 10-digit numbers. */
export function waNumber(mobile: string) {
  const d = mobile.replace(/\D/g, "");
  if (d.length === 10) return "91" + d;
  if (d.length === 11 && d.startsWith("0")) return "91" + d.slice(1);
  return d;
}
