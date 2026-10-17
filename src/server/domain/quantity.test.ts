import { describe, expect, it } from "vitest";
import { parseQuantityToMilli } from "./quantity";

describe("parseQuantityToMilli", () => {
  it("converts up to three decimal places without float arithmetic", () => {
    expect(parseQuantityToMilli("12.345")).toBe(12_345);
    expect(parseQuantityToMilli("0.5")).toBe(500);
    expect(parseQuantityToMilli("1")).toBe(1_000);
  });

  it("allows signed values only when requested and rejects invalid precision/ranges", () => {
    expect(parseQuantityToMilli("-0.125", true)).toBe(-125);
    expect(parseQuantityToMilli("-1")).toBeNull();
    expect(parseQuantityToMilli("1.0001")).toBeNull();
    expect(parseQuantityToMilli("01")).toBeNull();
    expect(parseQuantityToMilli("1000000.001")).toBeNull();
  });
});
