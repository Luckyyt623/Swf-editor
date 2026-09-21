

const DB_NAME = "swf-studio";
const DB_VERSION = 1;
const STORE = "sessions";
const SESSION_KEY = "last-session";

export interface StoredSession {
  fileName: string;
  bytes: Uint8Array;
  savedAt: number;
}

export function storageAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!storageAvailable()) {
      reject(new Error("IndexedDB is not available in this browser/context"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
}

export async function saveSession(fileName: string, bytes: Uint8Array): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const session: StoredSession = { fileName, bytes, savedAt: Date.now() };
      tx.objectStore(STORE).put(session, SESSION_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to save session"));
      tx.onabort = () => reject(tx.error ?? new Error("Save aborted"));
    });
  } finally {
    db.close();
  }
}

export async function loadSession(): Promise<StoredSession | null> {
  const db = await openDb();
  try {
    return await new Promise<StoredSession | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(SESSION_KEY);
      req.onsuccess = () => resolve((req.result as StoredSession | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error("Failed to load session"));
    });
  } finally {
    db.close();
  }
}

export async function peekSession(): Promise<{ fileName: string; savedAt: number } | null> {
  const session = await loadSession();
  if (!session) return null;
  return { fileName: session.fileName, savedAt: session.savedAt };
}

export async function clearSession(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(SESSION_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to clear session"));
    });
  } finally {
    db.close();
  }
}
