/** Parse a plain decimal amount into cents without floating point arithmetic. */
export function parseMoneyToCents(value: string): number | null {
  const normalized = value.trim();
  const match = /^(0|[1-9]\d{0,6})(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const cents = whole * 100 + Number(fraction || "0");
  return Number.isSafeInteger(cents) && cents <= 2_147_483_647 ? cents : null;
}
