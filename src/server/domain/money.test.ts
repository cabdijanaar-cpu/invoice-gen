import { describe, expect, it } from "vitest";
import { parseMoneyToCents } from "./money";

describe("parseMoneyToCents", () => {
  it("converts decimal input to integer cents", () => {
    expect(parseMoneyToCents("12")).toBe(1_200);
    expect(parseMoneyToCents("12.3")).toBe(1_230);
    expect(parseMoneyToCents("12.34")).toBe(1_234);
  });

  it("rejects malformed, negative, and excessive precision values", () => {
    expect(parseMoneyToCents("-1.00")).toBeNull();
    expect(parseMoneyToCents("1.001")).toBeNull();
    expect(parseMoneyToCents("1,000.00")).toBeNull();
    expect(parseMoneyToCents("1e3")).toBeNull();
    expect(parseMoneyToCents("21474836.48")).toBeNull();
  });
});
