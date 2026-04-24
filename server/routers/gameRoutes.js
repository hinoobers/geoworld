const express = require("express");
const router = express.Router();
const middleware = require("../auth").middleware;
const gameHandler = require("../gameHandler");
const db = require("../database");

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

router.post("/create-game", middleware, async (req, res) => {
    const { map_id, mode, round_count, allow_move, allow_zoom, allow_look } = req.body;
    // mode can be "singleplayer" or "multiplayer", in multiplayer, a lobby is created instead, start-game is not needed, if multiplayer, then start-game needs to be called

    if(!map_id || !mode) {
        return res.status(400).json({ error: "map_id and mode are required" });
    }

    if(mode !== "singleplayer" && mode !== "multiplayer") {
        return res.status(400).json({ error: "mode must be either singleplayer or multiplayer" });
    }

    const parsedMapId = Number(map_id);
    if (!Number.isInteger(parsedMapId) || parsedMapId <= 0) {
        return res.status(400).json({ error: "map_id must be a positive integer" });
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
        });
    } catch (error) {
        if (error.message === "This map has no playable positions") {
            return res.status(400).json({ error: error.message });
        }

        console.log("Error creating game:", error);
        return res.status(500).json({ error: "Failed to create game" });
    }
});

router.post("/start-game", middleware, (req, res) => {
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

router.post("/guess", middleware, async (req, res) => {
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

module.exports = router;