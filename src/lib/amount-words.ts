// Amount in words for receipts and bills, in the Pakistani numbering system (lakh, crore):
// "125000.50" -> "Rupees One Lakh Twenty-Five Thousand and Fifty Paisa Only".

import { toPaisa } from "@/lib/money";

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** 0–99 */
function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
}

/** 0–999 */
function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? twoDigits(rest) : ""].filter(Boolean).join(" ");
}

/** Whole number in words with crore / lakh / thousand; crores above 99 are spelt recursively. */
export function numberToWords(n: bigint): string {
  if (n === 0n) return "Zero";
  const parts: string[] = [];
  const crore = n / 10_000_000n;
  let rest = n % 10_000_000n;
  if (crore) parts.push(`${numberToWords(crore)} Crore`);
  const lakh = rest / 100_000n;
  rest %= 100_000n;
  if (lakh) parts.push(`${twoDigits(Number(lakh))} Lakh`);
  const thousand = rest / 1000n;
  rest %= 1000n;
  if (thousand) parts.push(`${twoDigits(Number(thousand))} Thousand`);
  if (rest) parts.push(threeDigits(Number(rest)));
  return parts.join(" ");
}

/** "Rupees … Only" for a decimal money string. */
export function amountInWords(amount: string, currencyWord = "Rupees"): string {
  const p = toPaisa(amount);
  const rupees = p / 100n;
  const paisa = Number(p % 100n);
  const main = `${currencyWord} ${numberToWords(rupees)}`;
  return `${paisa ? `${main} and ${twoDigits(paisa)} Paisa` : main} Only`;
}
