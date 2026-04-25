// This will handle active games
// After games are done, they r stored into database
// This will also handle multiplayer

const { randomUUID } = require("crypto");
const db = require("./database");

const activeGames = new Map();
const INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 30 * 1000;

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function sanitizePosition(position) {
    const lat = toNumber(position.lat ?? position.latitude);
    const lng = toNumber(position.lng ?? position.longitude);
    const positionId = position.id ?? position.position_id ?? position.map_position_id ?? position.positionId;

    if (lat === null || lng === null) {
        return null;
    }

    return {
        id: positionId,
        position_id: positionId,
        map_id: position.map_id,
        lat,
        lng,
        rotation: toNumber(position.yaw ?? position.rotation ?? position.heading) ?? 0,
        pitch: toNumber(position.pitch) ?? 0,
        zoom: toNumber(position.zoom) ?? 1,
        panorama_id: position.panorama_id ?? null,
    };
}

function shuffle(values) {
    const nextValues = [...values];
    for (let index = nextValues.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [nextValues[index], nextValues[randomIndex]] = [nextValues[randomIndex], nextValues[index]];
    }

    return nextValues;
}

function toRadians(value) {
    return (value * Math.PI) / 180;
}

function calculateDistanceKm(start, end) {
    const earthRadiusKm = 6371;
    const deltaLat = toRadians(end.lat - start.lat);
    const deltaLng = toRadians(end.lng - start.lng);
    const startLat = toRadians(start.lat);
    const endLat = toRadians(end.lat);

    const a =
        Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusKm * c;
}

function calculatePoints(distanceKm) {
    return Math.max(0, Math.round(5000 * Math.exp(-distanceKm / 2000)));
}

function getCurrentRound(game) {
    if (game.status !== "active") {
        return null;
    }

    return game.rounds[game.current_round_index] ?? null;
}

function buildRoundStreetView(round) {
    return {
        position_id: round.position_id,
        lat: round.actual.lat,
        lng: round.actual.lng,
        rotation: round.rotation,
        pitch: round.pitch,
        zoom: round.zoom,
        panorama_id: round.panorama_id,
    };
}

function buildGameInfo(game, playerId) {
    const currentRound = getCurrentRound(game);

    return {
        game_id: game.game_id,
        map_id: game.map_id,
        mode: game.mode,
        status: game.status,
        current_round: currentRound ? game.current_round_index + 1 : game.total_rounds,
        total_rounds: game.total_rounds,
        current_street_view: currentRound ? buildRoundStreetView(currentRound) : null,
        total_score: game.scores[playerId] ?? 0,
        allow_move: game.allow_move !== false,
        allow_zoom: game.allow_zoom !== false,
        allow_look: game.allow_look !== false,
    };
}

function markGameActivity(game) {
    game.last_activity_at = Date.now();
}

function countGameGuesses(game) {
    return game.rounds.reduce((total, round) => total + round.guesses.length, 0);
}

async function removeGameFromDatabase(game) {
    if (!game.db_game_id) {
        return;
    }

    await db.query("DELETE FROM game_guesses WHERE game_id = ?", [game.db_game_id]);
    await db.query("DELETE FROM games WHERE game_id = ?", [game.db_game_id]);
}

async function cleanupInactiveZeroGuessGames() {
    const now = Date.now();

    for (const [runtimeGameId, game] of activeGames.entries()) {
        const totalGuesses = countGameGuesses(game);
        if (totalGuesses > 0) {
            continue;
        }

        const lastActivityAt = Number(game.last_activity_at) || Date.parse(game.created_at) || now;
        const inactiveForMs = now - lastActivityAt;
        if (inactiveForMs < INACTIVITY_TIMEOUT_MS) {
            continue;
        }

        try {
            await removeGameFromDatabase(game);
            activeGames.delete(runtimeGameId);
        } catch (error) {
            console.error("[gameHandler] Failed to cleanup inactive game", {
                runtime_game_id: runtimeGameId,
                db_game_id: game.db_game_id,
                message: error?.message,
            });
        }
    }
}

async function runFirstSuccessfulWrite(statements) {
    let lastError;

    for (const statement of statements) {
        try {
            return await db.query(statement.sql, statement.params);
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error("Failed to write to database");
}

async function persistCreatedGame(game, ownerId) {
    const score = game.scores[ownerId] || 0;

    const oneSide = JSON.stringify({
        side: String(ownerId),
        score,
        status: game.status,
        current_round: 0,
        total_rounds: game.total_rounds,
        runtime_game_id: game.game_id,
        updated_at: new Date().toISOString(),
    });

    const result = await runFirstSuccessfulWrite([
        {
            sql: "INSERT INTO games (mode, one_side, second_side, map_id) VALUES (?, ?, ?, ?)",
            params: [game.mode, oneSide, null, game.map_id],
        },
        {
            sql: "INSERT INTO games (mode, one_side, map_id) VALUES (?, ?, ?)",
            params: [game.mode, oneSide, game.map_id],
        },
    ]);

    return result?.insertId || null;
}

async function persistGuess(game, playerId, round, roundNumber, guessLocation, distanceKm, points) {
    const guessJson = JSON.stringify(guessLocation);
    
    if (round.position_id == null) {
        throw new Error("Round position id is missing");
    }
    
    if (game.db_game_id == null) {
        throw new Error("Game database id is missing");
    }

    await runFirstSuccessfulWrite([
        {
            sql: "INSERT INTO game_guesses (map_position_id, game_id, side, guess) VALUES (?, ?, ?, ?)",
            params: [round.position_id, game.db_game_id, String(playerId), guessJson],
        },
    ]);
}

function buildSidePayload(game, playerId, score) {
    return JSON.stringify({
        side: String(playerId),
        score,
        status: game.status,
        current_round: game.current_round_index,
        total_rounds: game.total_rounds,
        runtime_game_id: game.game_id,
        updated_at: new Date().toISOString(),
        completed_at: game.status === "completed" ? new Date().toISOString() : null,
    });
}

async function persistGameProgress(game, playerId) {
    const score = game.scores[playerId] || 0;

    if (!game.db_game_id) {
        return;
    }

    if (String(game.owner_id) === String(playerId)) {
        await db.query("UPDATE games SET one_side = ? WHERE game_id = ?", [
            buildSidePayload(game, playerId, score),
            game.db_game_id,
        ]);
        return;
    }

    if (!game.second_side_user_id) {
        game.second_side_user_id = playerId;
    }

    if (String(game.second_side_user_id) === String(playerId)) {
        await db.query("UPDATE games SET second_side = ? WHERE game_id = ?", [
            buildSidePayload(game, playerId, score),
            game.db_game_id,
        ]);
        return;
    }

    throw new Error("This game already has two sides assigned");
}

async function loadMapPositions(mapId) {
    const rows = await db.query("SELECT * FROM map_positions WHERE map_id = ?", [mapId]);
    return rows.map(sanitizePosition).filter(Boolean);
}

async function createGame(mapId, mode, ownerId, requestedRounds, options = {}) {
    const positions = await loadMapPositions(mapId);
    if (positions.length === 0) {
        throw new Error("This map has no playable positions");
    }

    const maxRounds = positions.length;
    const singleplayerCap = Math.min(5, maxRounds);
    const roundsToPlay = requestedRounds && requestedRounds > 0
        ? Math.min(requestedRounds, maxRounds)
        : (mode === "singleplayer" ? singleplayerCap : maxRounds);
    const selectedPositions = shuffle(positions).slice(0, roundsToPlay);

    const game = {
        game_id: randomUUID(),
        map_id: mapId,
        mode,
        owner_id: ownerId,
        status: mode === "multiplayer" ? "lobby" : "active",
        created_at: new Date().toISOString(),
        current_round_index: 0,
        rounds: selectedPositions.map((position) => ({
            position_id: position.id ?? position.position_id ?? position.map_position_id,
            actual: {
                lat: position.lat,
                lng: position.lng,
            },
            rotation: position.rotation,
            pitch: position.pitch,
            zoom: position.zoom,
            panorama_id: position.panorama_id,
            guesses: [],
        })),
        total_rounds: roundsToPlay,
        scores: {
            [ownerId]: 0,
        },
        db_game_id: null,
        second_side_user_id: null,
        last_activity_at: Date.now(),
        allow_move: options.allowMove !== false,
        allow_zoom: options.allowZoom !== false,
        allow_look: options.allowLook !== false,
    };

    game.db_game_id = await persistCreatedGame(game, ownerId);

    activeGames.set(game.game_id, game);
    return game;
}

function startGame(gameId, userId) {
    const game = activeGames.get(gameId);
    if (!game) {
        throw new Error("Game not found");
    }

    if (game.mode !== "multiplayer") {
        throw new Error("Only multiplayer games need to be started");
    }

    if (String(game.owner_id) !== String(userId)) {
        throw new Error("Only the lobby owner can start this game");
    }

    game.status = "active";
    markGameActivity(game);
    return game;
}

function getGameInfo(gameId, playerId) {
    const game = activeGames.get(gameId);
    if (!game) {
        throw new Error("Game not found");
    }

    markGameActivity(game);

    return buildGameInfo(game, playerId);
}

function heartbeat(gameId) {
    const game = activeGames.get(gameId);
    if (!game) {
        throw new Error("Game not found");
    }

    markGameActivity(game);
    return {
        game_id: game.game_id,
        acknowledged: true,
    };
}

async function guess(gameId, playerId, playerGuess) {
    const game = activeGames.get(gameId);
    if (!game) {
        throw new Error("Game not found");
    }

    if (game.status !== "active") {
        throw new Error("Game is not active");
    }

    const currentRound = getCurrentRound(game);
    if (!currentRound) {
        throw new Error("No active round found");
    }

    const lat = toNumber(playerGuess?.lat);
    const lng = toNumber(playerGuess?.lng);
    if (lat === null || lng === null) {
        throw new Error("Guess must include numeric lat and lng");
    }

    const alreadyGuessed = currentRound.guesses.some((entry) => String(entry.player_id) === String(playerId));
    if (alreadyGuessed) {
        throw new Error("You already guessed this round");
    }

    const guessLocation = { lat, lng };
    const distanceKm = calculateDistanceKm(guessLocation, currentRound.actual);
    const points = calculatePoints(distanceKm);
    const roundNumber = game.current_round_index + 1;

    currentRound.guesses.push({
        player_id: playerId,
        guess: guessLocation,
        distance_km: distanceKm,
        points,
    });

    game.scores[playerId] = (game.scores[playerId] || 0) + points;

    await persistGuess(game, playerId, currentRound, roundNumber, guessLocation, distanceKm, points);

    game.current_round_index += 1;
    if (game.current_round_index >= game.total_rounds) {
        game.status = "completed";
    }

    markGameActivity(game);

    await persistGameProgress(game, playerId);

    return {
        round_result: {
            distance_km: Number(distanceKm.toFixed(3)),
            points,
            guess: guessLocation,
            actual: currentRound.actual,
        },
        game: buildGameInfo(game, playerId),
        game_completed: game.status === "completed",
    };
}

module.exports = {
    createGame,
    startGame,
    getGameInfo,
    heartbeat,
    guess,
};

const cleanupTimer = setInterval(() => {
    cleanupInactiveZeroGuessGames().catch((error) => {
        console.error("[gameHandler] Cleanup loop failed", error?.message || error);
    });
}, CLEANUP_INTERVAL_MS);

if (typeof cleanupTimer.unref === "function") {
    cleanupTimer.unref();
}