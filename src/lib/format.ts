// Display helpers (docs/README.md "General rules"). Money is formatted from its decimal
// string so no value ever passes through a float.

type DecimalLike = { toString(): string } | string | number | null | undefined;

/** "1250000" | Decimal -> "1,250,000"; keeps decimals only when non-zero ("1,250.50"). */
export function formatAmount(value: DecimalLike): string {
  if (value === null || value === undefined || value === "") return "0";
  const str = typeof value === "number" ? value.toFixed(2) : value.toString();
  const negative = str.startsWith("-");
  const [intPart, fracPart = ""] = str.replace("-", "").split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = fracPart.padEnd(2, "0").slice(0, 2);
  return (negative ? "-" : "") + grouped + (frac !== "00" ? "." + frac : "");
}

/** -> "PKR 1,250,000" */
export function formatPKR(value: DecimalLike, currency = "PKR"): string {
  return `${currency} ${formatAmount(value)}`;
}

/** Date -> "DD-MM-YYYY". Dates are stored as UTC midnight, so read UTC parts. */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
}

/** Date-time -> "DD-MM-YYYY HH:mm" in Pakistan time. */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  const pk = new Date(d.getTime() + 5 * 60 * 60 * 1000); // PKT = UTC+5, no DST
  const hh = String(pk.getUTCHours()).padStart(2, "0");
  const mi = String(pk.getUTCMinutes()).padStart(2, "0");
  return `${formatDate(pk)} ${hh}:${mi}`;
}

/** Date -> "YYYY-MM-DD" for <input type="date"> values. */
export function toInputDate(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

/** "YYYY-MM-DD" -> Date at UTC midnight (how all date-only fields are stored). */
export function parseInputDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** 1 -> "1 expense", 3 -> "3 expenses" */
export function plural(n: number, word: string, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

/** Worker rate -> "PKR 1,500 / day" */
export function rateLabel(rate: DecimalLike, rateType: "DAILY" | "MONTHLY", currency = "PKR") {
  return `${formatPKR(rate, currency)} / ${rateType === "DAILY" ? "day" : "month"}`;
}

/** Today's date in Pakistan (UTC+5) as "YYYY-MM-DD". */
export function todayPK(): string {
  return new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
}
