const { randomUUID } = require("crypto");
const db = require("./database");
const { insertMapPositionWithFallbacks } = require("./routers/mapRoutes");

const activeStreakGames = new Map();

async function createDynamicMapForStreak(ownerId) {
    const createdAt = new Date().toISOString().replace("T", " ").slice(0, 19);
    const name = `Country Streak — ${createdAt}`;
    const description = "Country streak game — locations grow as you guess correctly.";

    let inserted;
    try {
        inserted = await db.query(
            "INSERT INTO maps (name, description, created_by, is_dynamic) VALUES (?, ?, ?, 1)",
            [name, description, ownerId]
        );
    } catch {
        inserted = await db.query(
            "INSERT INTO maps (name, description, created_by) VALUES (?, ?, ?)",
            [name, description, ownerId]
        );
        if (inserted?.insertId) {
            try {
                await db.query("UPDATE maps SET is_dynamic = 1 WHERE id = ?", [inserted.insertId]);
            } catch {
                /* ignore */
            }
        }
    }

    const mapId = inserted?.insertId;
    if (!mapId) {
        throw new Error("Failed to create country streak map");
    }
    return { mapId, name };
}

async function appendStreakPosition(mapId, candidate) {
    const position = {
        lat: candidate.lat,
        lng: candidate.lng,
        yaw: 0,
        pitch: 0,
        zoom: 1,
        panorama_id: candidate.pano_id,
        note: `${candidate.country_code} — ${candidate.country_name}`,
    };
    await insertMapPositionWithFallbacks(mapId, position);
}

function buildOneSideJson(ownerId, game) {
    return JSON.stringify({
        side: String(ownerId),
        score: game.streak,
        status: game.status,
        current_round: game.current_round_index,
        total_rounds: game.rounds.length,
        runtime_game_id: game.game_id,
        updated_at: new Date().toISOString(),
        completed_at: game.status === "completed" ? new Date().toISOString() : null,
    });
}

async function persistGame(game) {
    const oneSide = buildOneSideJson(game.owner_id, game);
    if (!game.db_game_id) {
        let result;
        try {
            result = await db.query(
                "INSERT INTO games (mode, one_side, second_side, map_id) VALUES (?, ?, ?, ?)",
                ["country_streak", oneSide, null, game.map_id]
            );
        } catch {
            result = await db.query(
                "INSERT INTO games (mode, one_side, map_id) VALUES (?, ?, ?)",
                ["country_streak", oneSide, game.map_id]
            );
        }
        game.db_game_id = result?.insertId || null;
    } else {
        await db.query("UPDATE games SET one_side = ? WHERE game_id = ?", [oneSide, game.db_game_id]);
    }
}

function publicView(game) {
    const currentRound = game.rounds[game.current_round_index] || null;
    const showRound = currentRound && game.status === "active" && !currentRound.guessed;
    return {
        game_id: game.game_id,
        mode: "country_streak",
        status: game.status,
        streak: game.streak,
        current_round: game.current_round_index + 1,
        total_rounds: game.rounds.length,
        last_result: game.last_result || null,
        awaiting_round: game.status === "active" && !showRound,
        recent_countries: game.recent_countries.slice(-5),
        current_street_view: showRound
            ? {
                lat: currentRound.lat,
                lng: currentRound.lng,
                rotation: 0,
                pitch: 0,
                zoom: 1,
                panorama_id: currentRound.pano_id || null,
            }
            : null,
    };
}

async function startCountryStreakGame(ownerId) {
    const { mapId } = await createDynamicMapForStreak(ownerId);

    const game = {
        game_id: randomUUID(),
        owner_id: ownerId,
        map_id: mapId,
        status: "active",
        streak: 0,
        current_round_index: 0,
        rounds: [],
        recent_countries: [],
        last_result: null,
        db_game_id: null,
        last_activity_at: Date.now(),
    };

    await persistGame(game);
    activeStreakGames.set(game.game_id, game);
    return game;
}

function findGameForUser(gameId, ownerId) {
    const game = activeStreakGames.get(gameId);
    if (!game) {
        const error = new Error("Game not found");
        error.statusCode = 404;
        throw error;
    }
    if (String(game.owner_id) !== String(ownerId)) {
        const error = new Error("Not your game");
        error.statusCode = 403;
        throw error;
    }
    return game;
}

function validateCandidate(candidate) {
    if (!candidate) throw Object.assign(new Error("candidate is required"), { statusCode: 400 });
    const lat = Number(candidate.lat);
    const lng = Number(candidate.lng);
    const code = String(candidate.country_code || "").toUpperCase();
    const name = String(candidate.country_name || code || "").trim();
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw Object.assign(new Error("lat and lng must be numbers"), { statusCode: 400 });
    }
    if (!/^[A-Z]{2}$/.test(code)) {
        throw Object.assign(new Error("country_code must be a 2-letter ISO code"), { statusCode: 400 });
    }
    return {
        lat,
        lng,
        pano_id: candidate.pano_id ? String(candidate.pano_id) : null,
        country_code: code,
        country_name: name || code,
    };
}

async function registerNextRound(gameId, ownerId, rawCandidate) {
    const game = findGameForUser(gameId, ownerId);
    if (game.status !== "active") {
        throw Object.assign(new Error("Game already finished"), { statusCode: 400 });
    }
    const current = game.rounds[game.current_round_index];
    if (current && !current.guessed) {
        // already have an active round — return as-is
        return publicView(game);
    }
    const candidate = validateCandidate(rawCandidate);
    await appendStreakPosition(game.map_id, candidate);
    game.rounds.push({
        lat: candidate.lat,
        lng: candidate.lng,
        pano_id: candidate.pano_id,
        country_code: candidate.country_code,
        country_name: candidate.country_name,
        guessed: false,
    });
    game.current_round_index = game.rounds.length - 1;
    game.recent_countries.push(candidate.country_code);
    game.last_activity_at = Date.now();
    await persistGame(game);
    return publicView(game);
}

async function submitCountryGuess(gameId, ownerId, guessedCode) {
    const game = findGameForUser(gameId, ownerId);
    if (game.status !== "active") {
        throw Object.assign(new Error("Game already finished"), { statusCode: 400 });
    }

    const round = game.rounds[game.current_round_index];
    if (!round || round.guessed) {
        throw Object.assign(new Error("No active round"), { statusCode: 400 });
    }

    const normalizedGuess = String(guessedCode || "").toUpperCase();
    const correct = normalizedGuess === round.country_code;
    round.guessed = true;

    game.last_result = {
        correct,
        actual_code: round.country_code,
        actual_name: round.country_name,
        actual_lat: round.lat,
        actual_lng: round.lng,
        guessed_code: normalizedGuess,
    };

    if (correct) {
        game.streak += 1;
    } else {
        game.status = "completed";
    }

    game.last_activity_at = Date.now();
    await persistGame(game);
    return publicView(game);
}

function getGameInfo(gameId, ownerId) {
    const game = findGameForUser(gameId, ownerId);
    return publicView(game);
}

module.exports = {
    startCountryStreakGame,
    registerNextRound,
    submitCountryGuess,
    getGameInfo,
    publicView,
};
