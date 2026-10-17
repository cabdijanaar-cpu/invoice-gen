type PdfInvoice = {
  invoiceNumber: string;
  status: string;
  issuedAt: Date | null;
  dueAt: Date | null;
  currency: string;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  notes: string | null;
  customer: { name: string; email: string | null; phone: string | null; address: string | null } | null;
  shop: { name: string; settings: { legalName: string | null; address: string | null; phone: string | null; email: string | null; footer: string | null; primaryColor: string; template: string } | null };
  items: Array<{ description: string; skuSnapshot: string | null; quantityMilli: number; unitPriceCents: number; discountCents: number; lineTotalCents: number }>;
};

function safeText(value: string) {
  return value.replace(/[^\x20-\x7E]/g, "?").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function money(cents: number, currency: string) {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

function wrap(value: string, width = 86) {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && `${line} ${word}`.length > width) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export function renderInvoicePdf(invoice: PdfInvoice): Uint8Array {
  const lines: string[] = [
    invoice.shop.settings?.legalName || invoice.shop.name,
    ...(invoice.shop.settings?.address ? [invoice.shop.settings.address] : []),
    ...(invoice.shop.settings?.phone ? [`Phone: ${invoice.shop.settings.phone}`] : []),
    ...(invoice.shop.settings?.email ? [`Email: ${invoice.shop.settings.email}`] : []),
    "",
    `INVOICE ${invoice.invoiceNumber}    Status: ${invoice.status}`,
    `Issued: ${invoice.issuedAt?.toISOString().slice(0, 10) ?? "Not issued"}${invoice.dueAt ? `    Due: ${invoice.dueAt.toISOString().slice(0, 10)}` : ""}`,
    "",
    `Bill to: ${invoice.customer?.name ?? "Walk-in customer"}`,
    ...(invoice.customer?.address ? [invoice.customer.address] : []),
    ...(invoice.customer?.email ? [invoice.customer.email] : []),
    ...(invoice.customer?.phone ? [invoice.customer.phone] : []),
    "",
    "ITEMS",
    "Description | Qty | Unit price | Discount | Total",
    ...invoice.items.flatMap((item) => [
      ...wrap(`${item.description}${item.skuSnapshot ? ` (${item.skuSnapshot})` : ""}`),
      `  ${(item.quantityMilli / 1_000).toFixed(3)} | ${money(item.unitPriceCents, invoice.currency)} | ${money(item.discountCents, invoice.currency)} | ${money(item.lineTotalCents, invoice.currency)}`,
    ]),
    "",
    `Subtotal: ${money(invoice.subtotalCents, invoice.currency)}`,
    `Discount: ${money(invoice.discountCents, invoice.currency)}`,
    `Tax: ${money(invoice.taxCents, invoice.currency)}`,
    `TOTAL: ${money(invoice.totalCents, invoice.currency)}`,
    ...(invoice.notes ? ["", ...wrap(`Notes: ${invoice.notes}`)] : []),
    ...(invoice.shop.settings?.footer ? ["", ...wrap(invoice.shop.settings.footer)] : []),
  ].flatMap((line) => wrap(line));

  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += 44) pages.push(lines.slice(index, index + 44));
  if (!pages.length) pages.push([]);
  const objects: string[] = ["", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const kids: number[] = [];
  pages.forEach((pageLines, pageIndex) => {
    const pageObject = 4 + pageIndex * 2;
    const contentObject = pageObject + 1;
    kids.push(pageObject);
    const color = invoice.shop.settings?.primaryColor.match(/^#([0-9a-fA-F]{6})$/)?.[1] ?? "153d2c";
    const red = Number.parseInt(color.slice(0, 2), 16) / 255, green = Number.parseInt(color.slice(2, 4), 16) / 255, blue = Number.parseInt(color.slice(4, 6), 16) / 255;
    const accent = pageIndex === 0 ? `${red.toFixed(3)} ${green.toFixed(3)} ${blue.toFixed(3)} RG 3 w 50 780 m 562 780 l S\n` : "";
    const fontSize = invoice.shop.settings?.template === "MODERN" ? 11 : 10;
    const content = accent + pageLines.map((line, index) => `BT /F1 ${fontSize} Tf 50 ${760 - index * 16} Td (${safeText(line)}) Tj ET`).join("\n");
    objects[pageObject - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject - 1] = `<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}\nendstream`;
  });
  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${kids.map((id) => `${id} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf, "ascii")); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf, "ascii"));
}
