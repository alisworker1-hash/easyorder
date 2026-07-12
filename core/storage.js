/* EasyOrder core - namespaced persistence.
   Wraps localStorage with a key namespace so Pro state (eo.pro.*) and Home state
   (eo.home.*) never collide, and never collide with the existing storefront's eo.* keys.
   Falls back to an in-memory store when localStorage is unavailable (Node tests, private
   mode), so the engine stays DOM/browser-independent. */

const _memory = new Map();

function backend() {
  try {
    if (globalThis.localStorage) {
      // touch it to surface SecurityError in locked-down contexts, then use it
      globalThis.localStorage.getItem;
      return globalThis.localStorage;
    }
  } catch { /* fall through to memory */ }
  return {
    getItem: (k) => (_memory.has(k) ? _memory.get(k) : null),
    setItem: (k, v) => void _memory.set(k, String(v)),
    removeItem: (k) => void _memory.delete(k),
    key: (i) => [..._memory.keys()][i] ?? null,
    get length() { return _memory.size; },
  };
}

export function makeStore(namespace) {
  const ns = String(namespace).replace(/\.+$/, "");
  const full = (k) => `${ns}.${k}`;
  return {
    namespace: ns,
    get(key, fallback) {
      try {
        const v = backend().getItem(full(key));
        return v == null ? fallback : JSON.parse(v);
      } catch { return fallback; }
    },
    set(key, val) {
      try { backend().setItem(full(key), JSON.stringify(val)); return true; }
      catch { return false; }
    },
    remove(key) { try { backend().removeItem(full(key)); } catch {} },
    /* sub-keys (without the namespace prefix) currently stored under this namespace */
    keys() {
      const b = backend(); const out = []; const pfx = ns + ".";
      for (let i = 0; i < b.length; i++) {
        const k = b.key(i);
        if (k && k.startsWith(pfx)) out.push(k.slice(pfx.length));
      }
      return out;
    },
  };
}

/* Pre-made stores for the two products. */
export const proStore  = makeStore("eo.pro");
export const homeStore = makeStore("eo.home");
