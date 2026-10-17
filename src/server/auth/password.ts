import "server-only";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
const COST = 32_768;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, {
      N: COST,
      r: BLOCK_SIZE,
      p: PARALLELISM,
      maxmem: MAX_MEMORY,
    }, (error, key) => error ? reject(error) : resolve(key as Buffer));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt);
  return ["scrypt", COST, BLOCK_SIZE, PARALLELISM, salt.toString("hex"), derived.toString("hex")].join("$");
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, costText, blockText, parallelText, saltText, hashText, extra] = encoded.split("$");
  if (algorithm !== "scrypt" || !costText || !blockText || !parallelText || !saltText || !hashText || extra) {
    return false;
  }

  const cost = Number(costText);
  const blockSize = Number(blockText);
  const parallelism = Number(parallelText);
  if (cost !== COST || blockSize !== BLOCK_SIZE || parallelism !== PARALLELISM) return false;
  if (!/^[\da-f]{32}$/.test(saltText) || !/^[\da-f]{128}$/.test(hashText)) return false;

  const salt = Buffer.from(saltText, "hex");
  const expected = Buffer.from(hashText, "hex");
  const actual = await deriveKey(password, salt);
  return timingSafeEqual(actual, expected);
}
