const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const DEMO_LAT = 40.6889478;
const DEMO_LNG = -74.0440041;

const DEMO_TTL_MS = 30 * 60 * 1000;
const DEMO_START_WINDOW_MS = 60 * 60 * 1000;
const DEMO_START_MAX_PER_WINDOW = 1;
const SV_CONFIG_WINDOW_MS = 60 * 60 * 1000;
const SV_CONFIG_MAX_PER_WINDOW = 8;
const GUESS_WINDOW_MS = 60 * 1000;
const GUESS_MAX_PER_WINDOW = 5;

const demoGames = new Map();
const startBuckets = new Map();
const svBuckets = new Map();
const guessBuckets = new Map();

function getClientIp(req) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length > 0) {
        return forwarded.split(",")[0].trim();
    }
    return req.ip || req.connection?.remoteAddress || "unknown";
}

function rateLimit(buckets, key, windowMs, max) {
    const now = Date.now();
    const entry = buckets.get(key);
    if (!entry || now - entry.start > windowMs) {
        buckets.set(key, { start: now, count: 1 });
        return { ok: true };
    }
    if (entry.count >= max) {
        return { ok: false, retryAfterMs: windowMs - (now - entry.start) };
    }
    entry.count += 1;
    return { ok: true };
}

function pruneDemos() {
    const now = Date.now();
    for (const [id, game] of demoGames) {
        if (now - game.created_at > DEMO_TTL_MS) demoGames.delete(id);
    }
}

function toRadians(value) {
    return (value * Math.PI) / 180;
}

function distanceKm(a, b) {
    const R = 6371;
    const dLat = toRadians(b.lat - a.lat);
    const dLng = toRadians(b.lng - a.lng);
    const sLat = toRadians(a.lat);
    const eLat = toRadians(b.lat);
    const x =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(sLat) * Math.cos(eLat) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function calculatePoints(km) {
    return Math.max(0, Math.round(5000 * Math.exp(-km / 2000)));
}

router.get("/streetview-config", (req, res) => {
    const ip = getClientIp(req);
    const limit = rateLimit(svBuckets, ip, SV_CONFIG_WINDOW_MS, SV_CONFIG_MAX_PER_WINDOW);
    if (!limit.ok) {
        return res.status(429).json({ error: "Too many demo requests. Try again later." });
    }
    const key = process.env.GOOGLE_STREET_VIEW_API_KEY;
    if (!key) return res.status(500).json({ error: "Street View API key not configured" });
    return res.json({ key });
});

router.post("/start", (req, res) => {
    const ip = getClientIp(req);
    const limit = rateLimit(startBuckets, ip, DEMO_START_WINDOW_MS, DEMO_START_MAX_PER_WINDOW);
    if (!limit.ok) {
        return res.status(429).json({
            error: "Demo already used recently. Sign up for unlimited play.",
            retry_after_ms: limit.retryAfterMs,
        });
    }

    pruneDemos();

    const demoId = crypto.randomBytes(16).toString("hex");
    demoGames.set(demoId, {
        demo_id: demoId,
        created_at: Date.now(),
        actual: { lat: DEMO_LAT, lng: DEMO_LNG },
        guessed: false,
    });

    return res.status(201).json({
        demo_id: demoId,
        street_view: {
            lat: DEMO_LAT,
            lng: DEMO_LNG,
            heading: 0,
            pitch: 0,
            zoom: 1,
        },
    });
});

router.post("/guess", (req, res) => {
    const ip = getClientIp(req);
    const limit = rateLimit(guessBuckets, ip, GUESS_WINDOW_MS, GUESS_MAX_PER_WINDOW);
    if (!limit.ok) {
        return res.status(429).json({ error: "Too many guesses. Slow down." });
    }

    const { demo_id, guess } = req.body || {};
    if (!demo_id || !guess) {
        return res.status(400).json({ error: "demo_id and guess are required" });
    }

    const game = demoGames.get(demo_id);
    if (!game) {
        return res.status(404).json({ error: "Demo not found or expired" });
    }
    if (game.guessed) {
        return res.status(400).json({ error: "Demo already completed" });
    }

    const lat = Number(guess.lat);
    const lng = Number(guess.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: "Invalid guess coordinates" });
    }

    const km = distanceKm({ lat, lng }, game.actual);
    const points = calculatePoints(km);
    game.guessed = true;

    return res.json({
        guess: { lat, lng },
        actual: game.actual,
        distance_km: Number(km.toFixed(3)),
        points,
    });
});

module.exports = router;
