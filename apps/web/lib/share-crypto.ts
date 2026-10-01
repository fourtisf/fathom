/**
 * Encryption for shared chats. Each link gets a fresh random AES-256-GCM key that only ever lives in the
 * URL fragment (#…), which browsers never send to servers. The server stores ciphertext it can't read.
 */

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
const b64url = (bytes: Uint8Array) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));

function chunkedB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function encryptShare(doc: unknown): Promise<{ ciphertext: string; iv: string; key: string }> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(doc));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  return { ciphertext: chunkedB64(ct), iv: b64(iv), key: b64url(raw) };
}

export async function decryptShare<T>(ciphertext: string, iv: string, keyB64url: string): Promise<T> {
  const raw = unb64url(keyB64url);
  if (raw.length !== 32) throw new Error('bad_key');
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ciphertext));
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}
