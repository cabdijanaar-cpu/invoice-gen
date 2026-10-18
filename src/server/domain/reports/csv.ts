export function formatCsvCell(value: string | number | Date | null): string {
  if (typeof value === "number") return String(value);

  let text = value instanceof Date ? value.toISOString() : String(value ?? "");
  if (/^[\t\r]/.test(text) || /^[\s\u0000-\u001f]*[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
