// Verlauf in IndexedDB (bleibt nur auf dem Gerät)
const DB = 'passfoto', STORE = 'history', MAX = 30;
let dbp;
function open() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    const out = fn(s);
    t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
    t.onerror = () => rej(t.error);
  });
}
export async function addEntry(entry) {
  await tx('readwrite', s => s.put(entry));
  const all = await listEntries();
  for (const e of all.slice(MAX)) await removeEntry(e.id);
}
export async function listEntries() {
  const all = await tx('readonly', s => s.getAll());
  return (all || []).sort((a, b) => b.date - a.date);
}
export function removeEntry(id) { return tx('readwrite', s => s.delete(id)); }
