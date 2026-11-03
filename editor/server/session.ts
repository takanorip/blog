export type Session = {
  login: string;
  token: string;
  exp: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (value: string) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

const importKey = async (secret: string) => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
};

export const randomToken = (bytes = 32) =>
  toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));

export const sealSession = async (session: Session, secret: string) => {
  const key = await importKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(JSON.stringify(session)),
    ),
  );
  const sealed = new Uint8Array(iv.length + cipher.length);
  sealed.set(iv);
  sealed.set(cipher, iv.length);
  return toBase64Url(sealed);
};

export const unsealSession = async (
  value: string,
  secret: string,
): Promise<Session | null> => {
  try {
    const sealed = fromBase64Url(value);
    const key = await importKey(secret);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: sealed.slice(0, 12) },
      key,
      sealed.slice(12),
    );
    const session = JSON.parse(decoder.decode(plain)) as Session;
    if (typeof session.exp !== "number" || session.exp < Date.now()) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
};
