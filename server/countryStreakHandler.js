const { randomUUID } = require("crypto");
const db = require("./database");
const { pickStreetViewWithCountry } = require("./streetviewDynamic");
const { insertMapPositionWithFallbacks } = require("./routers/mapRoutes");

const activeStreakGames = new Map();

const RECENT_COUNTRY_EXCLUDE = 3;

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
    return position;
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
    return {
        game_id: game.game_id,
        mode: "country_streak",
        status: game.status,
        streak: game.streak,
        current_round: game.current_round_index + 1,
        total_rounds: game.rounds.length,
        last_result: game.last_result || null,
        current_street_view: currentRound && game.status === "active"
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

    const initial = [];
    const usedCountries = [];
    for (let i = 0; i < 2; i += 1) {
        const candidate = await pickStreetViewWithCountry(usedCountries);
        if (!candidate) {
            throw new Error("Could not generate enough countries");
        }
        await appendStreakPosition(mapId, candidate);
        initial.push(candidate);
        usedCountries.push(candidate.country_code);
    }

    const game = {
        game_id: randomUUID(),
        owner_id: ownerId,
        map_id: mapId,
        status: "active",
        streak: 0,
        current_round_index: 0,
        rounds: initial.map((c) => ({
            lat: c.lat,
            lng: c.lng,
            pano_id: c.pano_id,
            country_code: c.country_code,
            country_name: c.country_name,
        })),
        recent_countries: usedCountries,
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

async function submitCountryGuess(gameId, ownerId, guessedCode) {
    const game = findGameForUser(gameId, ownerId);
    if (game.status !== "active") {
        const error = new Error("Game already finished");
        error.statusCode = 400;
        throw error;
    }

    const round = game.rounds[game.current_round_index];
    if (!round) {
        const error = new Error("No active round");
        error.statusCode = 400;
        throw error;
    }

    const normalizedGuess = String(guessedCode || "").toUpperCase();
    const correct = normalizedGuess === round.country_code;

    if (correct) {
        game.streak += 1;
        game.current_round_index += 1;
        game.last_result = {
            correct: true,
            actual_code: round.country_code,
            actual_name: round.country_name,
            guessed_code: normalizedGuess,
        };

        const exclude = game.recent_countries.slice(-RECENT_COUNTRY_EXCLUDE);
        const next = await pickStreetViewWithCountry(exclude);
        if (!next) {
            game.status = "completed";
            game.last_result.error = "Could not generate next country";
        } else {
            await appendStreakPosition(game.map_id, next);
            game.rounds.push({
                lat: next.lat,
                lng: next.lng,
                pano_id: next.pano_id,
                country_code: next.country_code,
                country_name: next.country_name,
            });
            game.recent_countries.push(next.country_code);
        }
    } else {
        game.status = "completed";
        game.last_result = {
            correct: false,
            actual_code: round.country_code,
            actual_name: round.country_name,
            guessed_code: normalizedGuess,
        };
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
    submitCountryGuess,
    getGameInfo,
    publicView,
};
