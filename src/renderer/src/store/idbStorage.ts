/**
 * Async IndexedDB-backed storage for Zustand's persist middleware.
 *
 * Why: the sessions store persists the entire conversation history (messages,
 * tool results, and base64 image previews). On localStorage that meant
 *   - synchronous main-thread writes on every mutation (jank), and
 *   - a ~5–10 MB quota that a few screenshots or a long session can blow,
 *     silently failing persistence so sessions vanish on reload.
 * IndexedDB is asynchronous and has a far larger quota. We additionally
 * coalesce rapid writes so a burst of mutations during a turn serializes once.
 *
 * Falls back to localStorage when IndexedDB is unavailable (e.g. jsdom in tests).
 */
import type { PersistStorage, StorageValue } from 'zustand/middleware'

const DB_NAME = 'coide'
const STORE = 'kv'
const hasIdb = typeof indexedDB !== 'undefined'

let dbPromise: Promise<IDBDatabase> | null = null
function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

async function kvGet(key: string): Promise<string | null> {
  if (!hasIdb) return localStorage.getItem(key)
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
    req.onsuccess = () => resolve((req.result as string | undefined) ?? null)
    req.onerror = () => reject(req.error)
  })
}

async function kvSet(key: string, value: string): Promise<void> {
  if (!hasIdb) {
    localStorage.setItem(key, value)
    return
  }
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function kvDel(key: string): Promise<void> {
  if (!hasIdb) {
    localStorage.removeItem(key)
    return
  }
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Build a PersistStorage that writes through IndexedDB and coalesces bursts of
 * writes into a single serialization + write `throttleMs` after the last change.
 */
export function createIdbStorage<T>(throttleMs = 800): PersistStorage<T> {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const pending = new Map<string, StorageValue<T>>()

  const flush = (name: string): void => {
    const value = pending.get(name)
    timers.delete(name)
    pending.delete(name)
    if (value === undefined) return
    void kvSet(name, JSON.stringify(value)).catch((e) => console.error('[idb] persist failed', e))
  }

  // Best-effort flush of any debounced write when the window goes away.
  if (typeof window !== 'undefined') {
    const flushAll = (): void => {
      for (const name of [...pending.keys()]) flush(name)
    }
    window.addEventListener('pagehide', flushAll)
    window.addEventListener('beforeunload', flushAll)
  }

  return {
    getItem: async (name) => {
      try {
        let raw = await kvGet(name)
        // One-time migration: pull existing data out of the old localStorage backend.
        if (raw == null && hasIdb) {
          const legacy = localStorage.getItem(name)
          if (legacy != null) {
            raw = legacy
            await kvSet(name, legacy).catch(() => {})
            try {
              localStorage.removeItem(name)
            } catch {
              /* ignore */
            }
          }
        }
        return raw ? (JSON.parse(raw) as StorageValue<T>) : null
      } catch (e) {
        console.error('[idb] getItem failed', e)
        return null
      }
    },
    setItem: (name, value) => {
      pending.set(name, value)
      const existing = timers.get(name)
      if (existing) clearTimeout(existing)
      timers.set(name, setTimeout(() => flush(name), throttleMs))
    },
    removeItem: async (name) => {
      const t = timers.get(name)
      if (t) {
        clearTimeout(t)
        timers.delete(name)
      }
      pending.delete(name)
      await kvDel(name).catch(() => {})
    }
  }
}
