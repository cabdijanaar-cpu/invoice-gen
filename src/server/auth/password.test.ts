import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("stores a salted scrypt hash and verifies only the matching password", async () => {
    const password = "a-long-development-password";
    const encoded = await hashPassword(password);

    expect(encoded).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(encoded).not.toContain(password);
    await expect(verifyPassword(password, encoded)).resolves.toBe(true);
    await expect(verifyPassword("a-different-password", encoded)).resolves.toBe(false);
  });

  it("rejects malformed stored hashes", async () => {
    await expect(verifyPassword("password", "not-a-valid-hash")).resolves.toBe(false);
  });
});
