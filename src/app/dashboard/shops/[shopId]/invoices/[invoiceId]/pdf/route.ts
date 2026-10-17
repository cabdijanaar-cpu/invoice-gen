import { getShopInvoice } from "@/server/shops/invoices";
import { renderInvoicePdf } from "@/server/domain/invoices/render-invoice-pdf";

export async function GET(_request: Request, { params }: { params: Promise<{ shopId: string; invoiceId: string }> }) {
  const { shopId, invoiceId } = await params;
  const invoice = await getShopInvoice(shopId, invoiceId);
  if (!invoice) return new Response("Not found", { status: 404 });
  const filename = invoice.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
  const rendered = renderInvoicePdf(invoice);
  const body = new Uint8Array(new ArrayBuffer(rendered.byteLength));
  body.set(rendered);
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
