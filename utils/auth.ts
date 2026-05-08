import * as Crypto from "expo-crypto";

export const PASSWORD_VALIDATION_MESSAGE =
  "Password must be at least 8 characters and include at least one number.";

export function isPasswordValid(password: string): boolean {
  const hasMinLength = password.length >= 8;
  const hasNumber = /\d/.test(password);
  return hasMinLength && hasNumber;
}

export async function hashPassword(plain: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, plain);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  const hashedInput = await hashPassword(plain);
  return hashedInput === hash;
}
