import { describe, expect, it } from "vitest";
import { decryptApiKey, encryptApiKey } from "./api-key-vault.js";

describe("API key vault", () => {
  const apiKey = "sk-test_abcdefghijklmnopqrstuvwxyz0123456789";
  const password = "ein wirklich langes testpasswort";

  it("encrypts and decrypts without storing the password or plaintext key", async () => {
    const vault = await encryptApiKey(apiKey, password);
    expect(JSON.stringify(vault)).not.toContain(apiKey);
    expect(JSON.stringify(vault)).not.toContain(password);
    await expect(decryptApiKey(vault, password)).resolves.toBe(apiKey);
  });

  it("uses fresh salt and nonce for every encryption", async () => {
    const first = await encryptApiKey(apiKey, password);
    const second = await encryptApiKey(apiKey, password);
    expect(first.salt).not.toBe(second.salt);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("rejects wrong passwords and modified ciphertext", async () => {
    const vault = await encryptApiKey(apiKey, password);
    await expect(decryptApiKey(vault, "das ist leider falsch")).rejects.toThrow("Passwort ist falsch");
    await expect(decryptApiKey({ ...vault, ciphertext: `${vault.ciphertext.slice(0, -2)}AA` }, password)).rejects.toThrow("beschädigt");
  });
});

