import { describe, expect, it } from "vitest";
import { isShopLogoKey } from "./storage";

describe("private shop logo object keys", () => {
  const shopId = "shop_123";

  it("accepts supported opaque filenames only within the requested shop prefix", () => {
    expect(isShopLogoKey(shopId, `${shopId}/123e4567-e89b-12d3-a456-426614174000.png`)).toBe(true);
    expect(isShopLogoKey(shopId, `${shopId}/123e4567-e89b-12d3-a456-426614174000.jpg`)).toBe(true);
    expect(isShopLogoKey(shopId, `${shopId}/123e4567-e89b-12d3-a456-426614174000.webp`)).toBe(true);
  });

  it("rejects another shop, traversal, legacy names, and unsupported extensions", () => {
    expect(isShopLogoKey(shopId, "another-shop/123e4567-e89b-12d3-a456-426614174000.png")).toBe(false);
    expect(isShopLogoKey(shopId, `${shopId}/../private.png`)).toBe(false);
    expect(isShopLogoKey(shopId, "123e4567-e89b-12d3-a456-426614174000.png")).toBe(false);
    expect(isShopLogoKey(shopId, `${shopId}/123e4567-e89b-12d3-a456-426614174000.svg`)).toBe(false);
  });
});
