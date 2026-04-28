// Persists the "demo already played" flag across multiple browser locations.
// This is intentionally not bulletproof — a determined user can clear storage —
// but it should not be obvious how to reset it.

const LS_KEYS = [
    "geoworld-demo-played",
    "_gw_session_v3",
    "gw.metrics.bootstrap",
    "rl-cache-segment",
];
const SS_KEY = "gw-runtime-flags";
const COOKIE_NAME = "_gw_pf";
const IDB_NAME = "geoworld-meta";
const IDB_STORE = "flags";
const IDB_KEY = "telemetry-bootstrap";

const TRUTHY_TOKEN = "9c2f4a";

function setCookie(name, value, days = 365) {
    try {
        const expires = new Date(Date.now() + days * 86400 * 1000).toUTCString();
        document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
    } catch {
        /* ignore */
    }
}

function getCookie(name) {
    try {
        const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
        return match ? decodeURIComponent(match[2]) : null;
    } catch {
        return null;
    }
}

function openIdb() {
    return new Promise((resolve, reject) => {
        try {
            if (!window.indexedDB) return resolve(null);
            const req = window.indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        } catch (e) {
            reject(e);
        }
    });
}

async function idbGet(key) {
    try {
        const db = await openIdb();
        if (!db) return null;
        return await new Promise((resolve) => {
            const tx = db.transaction(IDB_STORE, "readonly");
            const req = tx.objectStore(IDB_STORE).get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

async function idbSet(key, value) {
    try {
        const db = await openIdb();
        if (!db) return;
        await new Promise((resolve) => {
            const tx = db.transaction(IDB_STORE, "readwrite");
            tx.objectStore(IDB_STORE).put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    } catch {
        /* ignore */
    }
}

export async function hasDemoBeenPlayed() {
    try {
        for (const k of LS_KEYS) {
            const v = window.localStorage?.getItem(k);
            if (v && v.includes(TRUTHY_TOKEN)) return true;
        }
    } catch {
        /* ignore */
    }
    try {
        const v = window.sessionStorage?.getItem(SS_KEY);
        if (v && v.includes(TRUTHY_TOKEN)) return true;
    } catch {
        /* ignore */
    }
    if ((getCookie(COOKIE_NAME) || "").includes(TRUTHY_TOKEN)) return true;
    const idbVal = await idbGet(IDB_KEY);
    if (idbVal && String(idbVal).includes(TRUTHY_TOKEN)) return true;
    return false;
}

export async function markDemoAsPlayed() {
    const stamp = `${TRUTHY_TOKEN}.${Date.now().toString(36)}`;
    try {
        for (const k of LS_KEYS) {
            window.localStorage?.setItem(k, stamp);
        }
    } catch {
        /* ignore */
    }
    try {
        window.sessionStorage?.setItem(SS_KEY, stamp);
    } catch {
        /* ignore */
    }
    setCookie(COOKIE_NAME, stamp);
    await idbSet(IDB_KEY, stamp);
}
