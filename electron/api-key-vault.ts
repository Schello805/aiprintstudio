import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "node:crypto";

export type EncryptedApiKey = {
  version: 1;
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
};

const additionalData = Buffer.from("AI Print Studio OpenAI API key vault v1", "utf8");

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

function validPassword(password: string): boolean {
  return password.length >= 10 && password.length <= 1024;
}

export async function encryptApiKey(apiKey: string, password: string): Promise<EncryptedApiKey> {
  if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(apiKey)) throw new Error("Der API-Schlüssel hat kein gültiges OpenAI-Format.");
  if (!validPassword(password)) throw new Error("Das AI-Print-Studio-Passwort muss mindestens 10 Zeichen lang sein.");
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(password, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(additionalData);
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return {
    version: 1,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

export async function decryptApiKey(vault: EncryptedApiKey, password: string): Promise<string> {
  try {
    if (vault.version !== 1 || !validPassword(password)) throw new Error("invalid");
    const salt = Buffer.from(vault.salt, "base64");
    const iv = Buffer.from(vault.iv, "base64");
    const authTag = Buffer.from(vault.authTag, "base64");
    const ciphertext = Buffer.from(vault.ciphertext, "base64");
    if (salt.length !== 16 || iv.length !== 12 || authTag.length !== 16 || !ciphertext.length) throw new Error("invalid");
    const key = await deriveKey(password, salt);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(additionalData);
    decipher.setAuthTag(authTag);
    const apiKey = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(apiKey)) throw new Error("invalid");
    return apiKey;
  } catch {
    throw new Error("Das Passwort ist falsch oder der gespeicherte Schlüssel ist beschädigt.");
  }
}

