// In-memory API usage counter, keyed by user id.
// Persists for the lifetime of the process.

const usageByUser = new Map();
// userId -> { total, lastSeen, endpoints: Map<"METHOD path", count> }

function normalizeRoute(req) {
    // Prefer the matched Express route to avoid distinct buckets per :id.
    const routePath = req.route?.path
        ? `${req.baseUrl || ""}${req.route.path}`
        : req.path || req.originalUrl || "?";
    return `${req.method} ${routePath}`;
}

function record(req) {
    const uid = req.user?.id;
    if (!uid) return;
    const isGuest = Boolean(req.user.is_guest);
    const key = isGuest ? `guest:${uid}` : `user:${uid}`;

    const entry = usageByUser.get(key) || {
        total: 0,
        lastSeen: 0,
        endpoints: new Map(),
        is_guest: isGuest,
        user_id: isGuest ? null : Number(uid),
    };
    const route = normalizeRoute(req);
    entry.endpoints.set(route, (entry.endpoints.get(route) || 0) + 1);
    entry.total += 1;
    entry.lastSeen = Date.now();
    usageByUser.set(key, entry);
}

function middleware(req, res, next) {
    res.on("finish", () => {
        try { record(req); } catch { /* ignore */ }
    });
    next();
}

function snapshot() {
    const out = [];
    for (const [key, entry] of usageByUser.entries()) {
        const endpoints = [...entry.endpoints.entries()]
            .map(([route, count]) => ({ route, count }))
            .sort((a, b) => b.count - a.count);
        out.push({
            key,
            user_id: entry.user_id,
            is_guest: entry.is_guest,
            total: entry.total,
            last_seen: entry.lastSeen,
            endpoints,
        });
    }
    out.sort((a, b) => b.total - a.total);
    return out;
}

function reset() {
    usageByUser.clear();
}

module.exports = { middleware, snapshot, reset };
