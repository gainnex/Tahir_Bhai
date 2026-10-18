// Exact money arithmetic on decimal strings using integer paisa (BigInt).
// Safe on client and server; never goes through floating point (business rule 9).

/** "1250.5" | "1,250.50" -> 125050n. Throws on invalid input. */
export function toPaisa(value: string): bigint {
  const v = value.replace(/,/g, "").trim();
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(v);
  if (!m) throw new Error(`Invalid amount: ${value}`);
  const paisa = BigInt(m[2]) * 100n + BigInt((m[3] ?? "").padEnd(2, "0") || "0");
  return m[1] ? -paisa : paisa;
}

/** 125050n -> "1250.50" */
export function fromPaisa(p: bigint): string {
  const neg = p < 0n;
  const abs = neg ? -p : p;
  const s = `${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
  return neg ? `-${s}` : s;
}

/** True if the string is a valid amount (≤ 2 decimals). */
export function isMoney(value: string) {
  return /^-?\d+(\.\d{1,2})?$/.test(value.replace(/,/g, "").trim());
}

export function sumMoney(values: string[]): string {
  return fromPaisa(values.reduce((acc, v) => acc + toPaisa(v), 0n));
}

/**
 * rate × quantity, quantity with up to 2 decimals (e.g. 5.5 days), rounded half-up to
 * the paisa. "1500" × "6" -> "9000.00".
 */
export function multiplyMoney(rate: string, quantity: string): string {
  const q = quantity.trim();
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(q);
  if (!m) throw new Error(`Invalid quantity: ${quantity}`);
  const qHundredths = BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0") || "0");
  const product = toPaisa(rate) * qHundredths; // paisa × hundredths
  return fromPaisa((product + 50n) / 100n);
}

/**
 * Share `total` across lines in proportion to `weights` (e.g. a split bill's GST across its
 * lines). Each share is rounded down to the paisa and the leftover paisa go to the last line,
 * so the shares always add up exactly to `total`. "100" over ["1", "2"] -> ["33.33", "66.67"].
 */
export function apportionMoney(total: string, weights: string[]): string[] {
  const t = toPaisa(total);
  const w = weights.map(toPaisa);
  const sum = w.reduce((a, b) => a + b, 0n);
  if (sum === 0n) throw new Error("Cannot apportion over zero weights");
  const shares = w.map((x) => (t * x) / sum);
  shares[shares.length - 1] += t - shares.reduce((a, b) => a + b, 0n);
  return shares.map(fromPaisa);
}
