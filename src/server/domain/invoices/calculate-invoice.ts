/**
 * Pure invoice arithmetic. Money is integer cents; quantity is thousandths
 * of a unit. No floating point is used for monetary intermediate values.
 */
export type InvoiceCalculationInput = {
  lines: Array<{
    quantityMilli: number;
    unitPriceCents: number;
    lineDiscountCents?: number;
    taxRateBps?: number;
  }>;
  invoiceDiscountCents?: number;
};

/** Apply a shop's default percentage discount to the amount left after line discounts. */
export function calculateDefaultInvoiceDiscountCents(
  lines: InvoiceCalculationInput["lines"],
  discountBps: number,
): number {
  assertSafeInteger("Default discount rate", discountBps, 0);
  if (discountBps > 10_000) throw new RangeError("Default discount rate cannot exceed 10000 basis points.");

  const base = calculateInvoice({ lines });
  const eligibleCents = BigInt(base.subtotalCents - base.lineDiscountCents);
  return asSafeNumber((eligibleCents * BigInt(discountBps) + BigInt(5_000)) / BPS_SCALE, "Default invoice discount");
}

export type CalculatedInvoiceLine = {
  grossCents: number;
  lineDiscountCents: number;
  invoiceDiscountCents: number;
  taxableCents: number;
  taxRateBps: number;
  taxCents: number;
  totalCents: number;
};

export type CalculatedInvoice = {
  lines: CalculatedInvoiceLine[];
  subtotalCents: number;
  lineDiscountCents: number;
  invoiceDiscountCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
};

const QUANTITY_SCALE = BigInt(1_000);
const BPS_SCALE = BigInt(10_000);
const MAX_TAX_RATE_BPS = 100_000;
const MAX_PERSISTED_INT = 2_147_483_647;

function assertSafeInteger(name: string, value: number, minimum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be a safe integer of at least ${minimum}.`);
  }
}

function asSafeNumber(value: bigint, name: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > MAX_PERSISTED_INT) {
    throw new RangeError(`${name} exceeds the supported monetary range.`);
  }
  return number;
}

/** Round a non-negative ratio to the nearest integer, with exact halves up. */
function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * BigInt(2) + denominator) / (denominator * BigInt(2));
}

function allocateDiscount(discount: bigint, bases: bigint[]): bigint[] {
  const totalBase = bases.reduce((sum, base) => sum + base, BigInt(0));
  if (discount === BigInt(0) || totalBase === BigInt(0)) {
    return bases.map(() => BigInt(0));
  }

  const shares = bases.map((base) => (discount * base) / totalBase);
  const remainders = bases.map((base, index) => ({
    index,
    remainder: (discount * base) % totalBase,
  }));
  let centsLeft = discount - shares.reduce((sum, share) => sum + share, BigInt(0));

  remainders.sort((left, right) => {
    if (left.remainder === right.remainder) return left.index - right.index;
    return left.remainder > right.remainder ? -1 : 1;
  });

  for (let cursor = 0; centsLeft > BigInt(0); cursor += 1) {
    const target = remainders[cursor % remainders.length];
    shares[target.index] += BigInt(1);
    centsLeft -= BigInt(1);
  }

  return shares;
}

export function calculateInvoice(input: InvoiceCalculationInput): CalculatedInvoice {
  if (input.lines.length === 0) throw new RangeError("An invoice needs at least one line.");

  const invoiceDiscountCents = input.invoiceDiscountCents ?? 0;
  assertSafeInteger("Invoice discount", invoiceDiscountCents, 0);

  const grossLines = input.lines.map((line) => {
    const lineDiscountCents = line.lineDiscountCents ?? 0;
    const taxRateBps = line.taxRateBps ?? 0;
    assertSafeInteger("Quantity (thousandths)", line.quantityMilli, 1);
    assertSafeInteger("Unit price in cents", line.unitPriceCents, 0);
    assertSafeInteger("Line discount in cents", lineDiscountCents, 0);
    assertSafeInteger("Tax rate in basis points", taxRateBps, 0);
    if (taxRateBps > MAX_TAX_RATE_BPS) {
      throw new RangeError(`Tax rate cannot exceed ${MAX_TAX_RATE_BPS} basis points.`);
    }

    const grossCents = roundHalfUp(
      BigInt(line.quantityMilli) * BigInt(line.unitPriceCents),
      QUANTITY_SCALE,
    );
    const lineDiscount = BigInt(lineDiscountCents);
    if (lineDiscount > grossCents) {
      throw new RangeError("A line discount cannot exceed its line amount.");
    }
    return {
      grossCents,
      lineDiscountCents: lineDiscount,
      taxRateBps,
      netBeforeInvoiceDiscount: grossCents - lineDiscount,
    };
  });

  const subtotal = grossLines.reduce((sum, line) => sum + line.grossCents, BigInt(0));
  const lineDiscountTotal = grossLines.reduce((sum, line) => sum + line.lineDiscountCents, BigInt(0));
  const netBeforeInvoiceDiscount = grossLines.reduce(
    (sum, line) => sum + line.netBeforeInvoiceDiscount,
    BigInt(0),
  );
  const invoiceDiscount = BigInt(invoiceDiscountCents);
  if (invoiceDiscount > netBeforeInvoiceDiscount) {
    throw new RangeError("Invoice discount cannot exceed the amount remaining after line discounts.");
  }

  // Allocate the invoice discount proportionally by line net value. Any
  // leftover cents go to the largest fractional remainders (stable by line order).
  const allocatedDiscounts = allocateDiscount(
    invoiceDiscount,
    grossLines.map((line) => line.netBeforeInvoiceDiscount),
  );

  const calculatedLines = grossLines.map((line, index): CalculatedInvoiceLine => {
    const allocatedDiscount = allocatedDiscounts[index];
    const taxable = line.netBeforeInvoiceDiscount - allocatedDiscount;
    const tax = roundHalfUp(taxable * BigInt(line.taxRateBps), BPS_SCALE);
    return {
      grossCents: asSafeNumber(line.grossCents, "Line gross"),
      lineDiscountCents: asSafeNumber(line.lineDiscountCents, "Line discount"),
      invoiceDiscountCents: asSafeNumber(allocatedDiscount, "Allocated invoice discount"),
      taxableCents: asSafeNumber(taxable, "Taxable line amount"),
      taxRateBps: line.taxRateBps,
      taxCents: asSafeNumber(tax, "Line tax"),
      totalCents: asSafeNumber(taxable + tax, "Line total"),
    };
  });

  const taxTotal = calculatedLines.reduce((sum, line) => sum + BigInt(line.taxCents), BigInt(0));
  const total = netBeforeInvoiceDiscount - invoiceDiscount + taxTotal;

  return {
    lines: calculatedLines,
    subtotalCents: asSafeNumber(subtotal, "Subtotal"),
    lineDiscountCents: asSafeNumber(lineDiscountTotal, "Line discounts"),
    invoiceDiscountCents,
    discountCents: asSafeNumber(lineDiscountTotal + invoiceDiscount, "Total discounts"),
    taxCents: asSafeNumber(taxTotal, "Tax total"),
    totalCents: asSafeNumber(total, "Invoice total"),
  };
}
