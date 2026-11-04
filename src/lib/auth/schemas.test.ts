import { describe, expect, it } from "vitest";
import { codeSchema, emailSchema } from "./schemas";

describe("emailSchema", () => {
  it("trims and lowercases", () => {
    expect(emailSchema.parse({ email: "  Runner@Example.com " }).email).toBe(
      "runner@example.com",
    );
  });

  it("rejects a malformed address", () => {
    expect(emailSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });
});

describe("codeSchema", () => {
  const email = "runner@example.com";

  it("accepts six digits, ignoring surrounding spaces", () => {
    expect(codeSchema.parse({ email, code: " 123456 " }).code).toBe("123456");
  });

  it.each(["12345", "1234567", "12345a", ""])("rejects %j", (code) => {
    expect(codeSchema.safeParse({ email, code }).success).toBe(false);
  });
});
