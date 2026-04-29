const express = require("express");
const router = express.Router();
const middleware = require("../auth").middleware;
const { requireVerified } = require("../auth");
const gameHandler = require("../gameHandler");
const db = require("../database");
const { insertMapPositionWithFallbacks } = require("./mapRoutes");
const { generateDynamicPositions } = require("../streetviewDynamic");
const countryStreakHandler = require("../countryStreakHandler");
const { ALLOWED_ROUND_TIME_SECONDS, normalizeRoundTimeSeconds } = require("../lobbyHandler");

async function createDynamicMap(userId) {
    const positions = await generateDynamicPositions(5);

    const createdAt = new Date().toISOString().replace("T", " ").slice(0, 19);
    const name = `Worldwide — ${createdAt}`;
    const description = "Auto-generated random Street View locations from around the world.";

    let inserted;
    try {
        inserted = await db.query(
            "INSERT INTO maps (name, description, created_by, is_dynamic) VALUES (?, ?, ?, 1)",
            [name, description, userId]
        );
    } catch {
        inserted = await db.query(
            "INSERT INTO maps (name, description, created_by) VALUES (?, ?, ?)",
            [name, description, userId]
        );
        if (inserted?.insertId) {
            try {
                await db.query("UPDATE maps SET is_dynamic = 1 WHERE id = ?", [inserted.insertId]);
            } catch {
                /* column may not exist; ignore */
            }
        }
    }

    const mapId = inserted?.insertId;
    if (!mapId) {
        throw new Error("Failed to create dynamic map record");
    }

    for (const position of positions) {
        await insertMapPositionWithFallbacks(mapId, position);
    }

    return { mapId, positions };
}

let cachedDailyRotationDate = null;

function todayDateString() {
    return new Date().toISOString().slice(0, 10);
}

async function getOrRotateDailyMap() {
    const today = todayDateString();

    const currentDailyRows = await db.query(
        "SELECT id, name, description FROM maps WHERE is_daily = 1 LIMIT 1"
    );
    const currentDaily = currentDailyRows[0] || null;

    if (cachedDailyRotationDate === today && currentDaily) {
        return currentDaily;
    }

    const candidates = await db.query(
        `SELECT m.id, m.name, m.description, COUNT(p.map_position_id) AS positions_count
         FROM maps m
         LEFT JOIN map_positions p ON p.map_id = m.id
         WHERE m.is_public = 1
         GROUP BY m.id, m.name, m.description
         HAVING positions_count > 0`
    );

    if (candidates.length === 0) {
        cachedDailyRotationDate = today;
        return currentDaily;
    }

    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    await db.query("UPDATE maps SET is_daily = 0 WHERE is_daily = 1");
    await db.query("UPDATE maps SET is_daily = 1 WHERE id = ?", [chosen.id]);
    cachedDailyRotationDate = today;

    return {
        id: chosen.id,
        name: chosen.name,
        description: chosen.description,
    };
}

function parseSide(raw) {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

async function hasPlayedDailyToday(userId, mapId) {
    const needle = `%"side":"${userId}"%`;
    const rows = await db.query(
        `SELECT one_side, second_side
         FROM games
         WHERE map_id = ?
           AND (one_side LIKE ? OR second_side LIKE ?)
           AND DATE(created_at) = CURDATE()`,
        [mapId, needle, needle]
    );

    const userIdStr = String(userId);
    for (const row of rows) {
        for (const raw of [row.one_side, row.second_side]) {
            const side = parseSide(raw);
            if (!side) continue;
            if (String(side.side) !== userIdStr) continue;
            if (side.status === "completed") return true;
        }
    }
    return false;
}

router.get("/daily-challenge", middleware, async (req, res) => {
    try {
        const dailyMap = await getOrRotateDailyMap();
        if (!dailyMap) {
            return res.status(404).json({ error: "No daily challenge map available" });
        }

        const alreadyPlayed = await hasPlayedDailyToday(req.user.id, dailyMap.id);

        return res.json({
            map_id: dailyMap.id,
            name: dailyMap.name,
            description: dailyMap.description,
            already_played: alreadyPlayed,
        });
    } catch (error) {
        console.error("[gameRoutes] daily-challenge failed", error?.message);
        return res.status(500).json({ error: "Failed to load daily challenge" });
    }
});

router.get("/daily-leaderboard", middleware, async (req, res) => {
    try {
        const dailyMap = await getOrRotateDailyMap();
        if (!dailyMap) {
            return res.status(404).json({ error: "No daily challenge map available" });
        }

        const alreadyPlayed = await hasPlayedDailyToday(req.user.id, dailyMap.id);
        if (!alreadyPlayed) {
            return res.status(403).json({ error: "Play the daily challenge first to view results" });
        }

        const games = await db.query(
            `SELECT game_id, one_side, second_side
             FROM games
             WHERE map_id = ? AND DATE(created_at) = CURDATE()
             ORDER BY game_id ASC`,
            [dailyMap.id]
        );

        const firstCompletedByUser = new Map();
        for (const row of games) {
            const sides = [parseSide(row.one_side), parseSide(row.second_side)].filter(Boolean);
            for (const side of sides) {
                if (side.status !== "completed") continue;
                const userIdKey = String(side.side);
                if (firstCompletedByUser.has(userIdKey)) continue;

                firstCompletedByUser.set(userIdKey, {
                    user_id: Number(userIdKey),
                    score: Number(side.score) || 0,
                    total_rounds: Number(side.total_rounds) || 0,
                    game_id: row.game_id,
                });
            }
        }

        if (firstCompletedByUser.size === 0) {
            return res.json({
                map_id: dailyMap.id,
                map_name: dailyMap.name,
                entries: [],
            });
        }

        const userIds = [...firstCompletedByUser.keys()].map(Number);
        const placeholders = userIds.map(() => "?").join(",");
        const users = await db.query(
            `SELECT id, username FROM users WHERE id IN (${placeholders})`,
            userIds
        );
        const usernameById = new Map(users.map((user) => [Number(user.id), user.username]));

        const limitRaw = Number(req.query.limit);
        const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 10;

        const entries = [...firstCompletedByUser.values()]
            .map((entry) => ({
                ...entry,
                username: usernameById.get(entry.user_id) || "Unknown",
                is_me: entry.user_id === Number(req.user.id),
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

        return res.json({
            map_id: dailyMap.id,
            map_name: dailyMap.name,
            entries,
        });
    } catch (error) {
        console.error("[gameRoutes] daily-leaderboard failed", error?.message);
        return res.status(500).json({ error: "Failed to load daily leaderboard" });
    }
});

router.get("/gameinfo", middleware, (req, res) => {
    const { game_id } = req.query;
    if (!game_id) {
        return res.status(400).json({ error: "game_id is required" });
    }

    try {
        const game = gameHandler.getGameInfo(game_id, req.user.id);
        return res.json(game);
    } catch (error) {
        if (error.message === "Game not found") {
            return res.status(404).json({ error: error.message });
        }

        return res.status(400).json({ error: error.message });
    }
});

router.post("/create-game", middleware, requireVerified, async (req, res) => {
    const { map_id, mode, round_count, allow_move, allow_zoom, allow_look, dynamic, round_time_seconds } = req.body;

    if (round_time_seconds !== undefined && !ALLOWED_ROUND_TIME_SECONDS.has(Number(round_time_seconds))) {
        return res.status(400).json({ error: "Invalid round_time_seconds" });
    }
    // mode can be "singleplayer" or "multiplayer", in multiplayer, a lobby is created instead, start-game is not needed, if multiplayer, then start-game needs to be called

    if (!mode) {
        return res.status(400).json({ error: "mode is required" });
    }

    if(mode !== "singleplayer" && mode !== "multiplayer") {
        return res.status(400).json({ error: "mode must be either singleplayer or multiplayer" });
    }

    const wantDynamic = Boolean(dynamic);
    if (wantDynamic && mode !== "singleplayer") {
        return res.status(400).json({ error: "Dynamic maps are only supported for singleplayer" });
    }

    let parsedMapId;
    if (wantDynamic) {
        try {
            const created = await createDynamicMap(req.user.id);
            parsedMapId = created.mapId;
        } catch (error) {
            console.error("[gameRoutes] dynamic map creation failed", error?.message);
            const message = error?.message || "Failed to generate dynamic map";
            return res.status(503).json({ error: message });
        }
    } else {
        if (!map_id) {
            return res.status(400).json({ error: "map_id is required" });
        }
        parsedMapId = Number(map_id);
        if (!Number.isInteger(parsedMapId) || parsedMapId <= 0) {
            return res.status(400).json({ error: "map_id must be a positive integer" });
        }
    }

    try {
        const parsedRoundCount = Number(round_count);
        const game = await gameHandler.createGame(
            parsedMapId,
            mode,
            req.user.id,
            Number.isFinite(parsedRoundCount) ? parsedRoundCount : null,
            {
                allowMove: allow_move !== false,
                allowZoom: allow_zoom !== false,
                allowLook: allow_look !== false,
                roundTimeSeconds: normalizeRoundTimeSeconds(round_time_seconds),
            }
        );

        return res.status(201).json({
            game_id: game.game_id,
            status: game.status,
            mode: game.mode,
            total_rounds: game.total_rounds,
            current_street_view:
                game.status === "active"
                    ? game.rounds[0]
                        ? {
                            position_id: game.rounds[0].position_id,
                            lat: game.rounds[0].actual.lat,
                            lng: game.rounds[0].actual.lng,
                            rotation: game.rounds[0].rotation,
                            pitch: game.rounds[0].pitch,
                            zoom: game.rounds[0].zoom,
                            panorama_id: game.rounds[0].panorama_id,
                        }
                        : null
                    : null,
            allow_move: game.allow_move !== false,
            allow_zoom: game.allow_zoom !== false,
            allow_look: game.allow_look !== false,
            round_time_seconds: Number(game.round_time_seconds) || 0,
        });
    } catch (error) {
        if (error.message === "This map has no playable positions") {
            return res.status(400).json({ error: error.message });
        }

        console.log("Error creating game:", error);
        return res.status(500).json({ error: "Failed to create game" });
    }
});

router.post("/start-game", middleware, requireVerified, (req, res) => {
    const { game_id } = req.body;
    if (!game_id) {
        return res.status(400).json({ error: "game_id is required" });
    }

    try {
        const game = gameHandler.startGame(game_id, req.user.id);
        return res.json({
            game_id: game.game_id,
            status: game.status,
            current_street_view: game.rounds[0]
                ? {
                    position_id: game.rounds[0].position_id,
                    lat: game.rounds[0].actual.lat,
                    lng: game.rounds[0].actual.lng,
                    rotation: game.rounds[0].rotation,
                    pitch: game.rounds[0].pitch,
                    zoom: game.rounds[0].zoom,
                    panorama_id: game.rounds[0].panorama_id,
                }
                : null,
        });
    } catch (error) {
        if (error.message === "Game not found") {
            return res.status(404).json({ error: error.message });
        }

        return res.status(400).json({ error: error.message });
    }

});

router.post("/guess", middleware, requireVerified, async (req, res) => {
    const { game_id, guess } = req.body;
    if (!game_id || !guess) {
        return res.status(400).json({ error: "game_id and guess are required" });
    }

    try {
        const result = await gameHandler.guess(game_id, req.user.id, guess);
        return res.json(result);
    } catch (error) {
        if (error.message === "Game not found") {
            return res.status(404).json({ error: error.message });
        }

        return res.status(400).json({ error: error.message });
    }
});

router.post("/heartbeat", middleware, (req, res) => {
    const { game_id } = req.body;
    if (!game_id) {
        return res.status(400).json({ error: "game_id is required" });
    }

    try {
        const result = gameHandler.heartbeat(game_id);
        return res.json(result);
    } catch (error) {
        if (error.message === "Game not found") {
            return res.status(404).json({ error: error.message });
        }

        return res.status(400).json({ error: error.message });
    }
});

router.get("/country-streak/best", middleware, async (req, res) => {
    try {
        const needle = `%"side":"${req.user.id}"%`;
        const rows = await db.query(
            `SELECT one_side FROM games
             WHERE mode = 'country_streak'
               AND one_side LIKE ?`,
            [needle]
        );
        let best = 0;
        for (const row of rows) {
            const side = parseSide(row.one_side);
            if (!side) continue;
            const score = Number(side.score) || 0;
            if (score > best) best = score;
        }
        return res.json({ best });
    } catch (error) {
        console.error("[gameRoutes] country streak best failed", error?.message);
        return res.status(500).json({ error: "Failed to load best streak" });
    }
});

router.get("/country-streak/leaderboard", middleware, async (req, res) => {
    try {
        const rows = await db.query(
            "SELECT one_side FROM games WHERE mode = 'country_streak'"
        );
        const bestByUser = new Map();
        for (const row of rows) {
            const side = parseSide(row.one_side);
            if (!side) continue;
            const uid = Number(side.side);
            if (!uid) continue;
            const score = Number(side.score) || 0;
            const prev = bestByUser.get(uid) || 0;
            if (score > prev) bestByUser.set(uid, score);
        }
        if (bestByUser.size === 0) return res.json([]);
        const ids = [...bestByUser.keys()];
        const placeholders = ids.map(() => "?").join(",");
        const users = await db.query(
            `SELECT id, username, is_restricted FROM users WHERE id IN (${placeholders})`,
            ids
        );
        const usernameById = new Map(
            users.filter((u) => Number(u.is_restricted) !== 1).map((u) => [Number(u.id), u.username])
        );
        const limitRaw = Number(req.query.limit);
        const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 50;
        const entries = [...bestByUser.entries()]
            .map(([uid, best]) => ({
                user_id: uid,
                username: usernameById.get(uid),
                best_streak: best,
            }))
            .filter((e) => e.username)
            .sort((a, b) => b.best_streak - a.best_streak)
            .slice(0, limit);
        return res.json(entries);
    } catch (error) {
        console.error("[gameRoutes] country streak leaderboard failed", error?.message);
        return res.status(500).json({ error: "Failed to load country streak leaderboard" });
    }
});

router.post("/country-streak/start", middleware, requireVerified, async (req, res) => {
    try {
        const game = await countryStreakHandler.startCountryStreakGame(req.user.id);
        return res.status(201).json(countryStreakHandler.publicView(game));
    } catch (error) {
        console.error("[gameRoutes] country streak start failed", error?.message);
        return res.status(503).json({ error: error?.message || "Failed to start country streak" });
    }
});

router.post("/country-streak/register-round", middleware, requireVerified, async (req, res) => {
    const { game_id, candidate } = req.body || {};
    if (!game_id || !candidate) {
        return res.status(400).json({ error: "game_id and candidate are required" });
    }
    try {
        const result = await countryStreakHandler.registerNextRound(
            game_id,
            req.user.id,
            candidate
        );
        return res.json(result);
    } catch (error) {
        const status = error?.statusCode || 500;
        return res.status(status).json({ error: error?.message || "Failed to register round" });
    }
});

router.post("/country-streak/guess", middleware, requireVerified, async (req, res) => {
    const { game_id, country_code } = req.body || {};
    if (!game_id || !country_code) {
        return res.status(400).json({ error: "game_id and country_code are required" });
    }
    try {
        const result = await countryStreakHandler.submitCountryGuess(
            game_id,
            req.user.id,
            country_code
        );
        return res.json(result);
    } catch (error) {
        const status = error?.statusCode || 500;
        return res.status(status).json({ error: error?.message || "Failed to submit guess" });
    }
});

router.get("/country-streak/:gameId", middleware, (req, res) => {
    try {
        const info = countryStreakHandler.getGameInfo(req.params.gameId, req.user.id);
        return res.json(info);
    } catch (error) {
        const status = error?.statusCode || 500;
        return res.status(status).json({ error: error?.message || "Failed to load game" });
    }
});

module.exports = router;