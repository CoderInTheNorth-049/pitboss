const DB_NAME = 'pitboss';
const STORE = 'rivals';
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('indexeddb blocked'));
  });
}

export class RivalStore<T extends { id: string }> {
  private fallback = new Map<string, T>();
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    try {
      if (!('indexedDB' in globalThis)) return;
      this.db = await openDb();
    } catch {
      this.db = null;
    }
  }

  async loadAll(): Promise<T[]> {
    if (!this.db) return [...this.fallback.values()];
    return new Promise(resolve => {
      try {
        const tx = this.db!.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result as T[]);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async put(value: T): Promise<void> {
    if (!this.db) {
      this.fallback.set(value.id, value);
      return;
    }
    await new Promise<void>(resolve => {
      try {
        const tx = this.db!.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async delete(id: string): Promise<void> {
    this.fallback.delete(id);
    if (!this.db) return;
    await new Promise<void>(resolve => {
      try {
        const tx = this.db!.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}
