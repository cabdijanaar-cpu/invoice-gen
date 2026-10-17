/** Parse a quantity with up to three decimal places into thousandths. */
export function parseQuantityToMilli(value: string, allowNegative = false): number | null {
  const normalized = value.trim();
  const match = (allowNegative ? /^(-?)(0|[1-9]\d{0,6})(?:\.(\d{1,3}))?$/ : /^(0|[1-9]\d{0,6})(?:\.(\d{1,3}))?$/).exec(normalized);
  if (!match) return null;
  const negative = allowNegative && match[1] === "-";
  const whole = Number(allowNegative ? match[2] : match[1]);
  const fraction = (allowNegative ? match[3] : match[2]) ?? "";
  const milli = whole * 1_000 + Number(fraction.padEnd(3, "0") || "0");
  return Number.isSafeInteger(milli) && milli <= 1_000_000_000 ? (negative ? -milli : milli) : null;
}
