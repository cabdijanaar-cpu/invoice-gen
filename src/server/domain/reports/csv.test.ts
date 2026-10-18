import { describe, expect, it } from "vitest";
import { formatCsvCell } from "./csv";

describe("formatCsvCell", () => {
  it.each(["=1+1", "  =1+1", "\t=1+1", "\r=1+1", "+cmd", "-cmd", "@SUM(A1:A2)"])("neutralizes formula-like text %j", (value) => {
    expect(formatCsvCell(value)).toBe(`"'${value}"`);
  });

  it("quotes and escapes ordinary CSV text while preserving numeric values", () => {
    expect(formatCsvCell('Name, "quoted"')).toBe('"Name, ""quoted"""');
    expect(formatCsvCell(-125)).toBe("-125");
  });
});
