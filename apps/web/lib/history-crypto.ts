/**
 * Client-side encryption for saved chats (CLAUDE.md §0.2): the key is derived from a wallet
 * signature, is non-extractable, and lives only in this browser (IndexedDB). The server only
 * ever receives ciphertext it cannot decrypt.
 */
import { brand } from '@fathom/config';

const DB_NAME = 'noxsea';
const STORE = 'history-keys';
const enc = new TextEncoder();

export function historyKeyMessage(address: string): string {
  return (
    `${brand.name} chat history key\n\n` +
    'Signing this creates the key that encrypts your saved chats. It stays in this browser, ' +
    'is never sent to our servers, and costs no gas.\n\n' +
    `Wallet: ${address.toLowerCase()}`
  );
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const b64 = (bytes: ArrayBuffer | Uint8Array) => {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]!);
  return btoa(s);
};
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Wallets sign deterministically (RFC 6979), so the same wallet always yields the same key. */
export async function deriveHistoryKey(signature: string): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey(
    'raw',
    await crypto.subtle.digest('SHA-256', hexToBytes(signature)),
    'HKDF',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('noxsea-history-v1'), info: enc.encode('chat-history') },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)));
  return { ciphertext: b64(data), iv: b64(iv) };
}

export async function decryptJson<T>(key: CryptoKey, ciphertext: string, iv: string): Promise<T> {
  const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ciphertext));
  return JSON.parse(new TextDecoder().decode(data)) as T;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const keyId = (address: string) => address.toLowerCase();

export async function loadHistoryKey(address: string): Promise<CryptoKey | null> {
  try {
    return ((await tx('readonly', (s) => s.get(keyId(address)))) as CryptoKey | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function storeHistoryKey(address: string, key: CryptoKey): Promise<void> {
  try {
    await tx('readwrite', (s) => s.put(key, keyId(address)));
  } catch {
    // Private windows may block IndexedDB; the key then lives only in memory for this tab.
  }
}

export async function deleteHistoryKey(address: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(keyId(address)));
  } catch {}
}
