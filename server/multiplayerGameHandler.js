const db = require("./database");
const lobbyHandler = require("./lobbyHandler");

const COMPLETED_GAME_TTL_MS = 30 * 60 * 1000;

function toRadians(value) {
    return (value * Math.PI) / 180;
}

function calculateDistanceKm(start, end) {
    const earthRadiusKm = 6371;
    const dLat = toRadians(end.lat - start.lat);
    const dLng = toRadians(end.lng - start.lng);
    const lat1 = toRadians(start.lat);
    const lat2 = toRadians(end.lat);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculatePoints(distanceKm) {
    return Math.max(0, Math.round(5000 * Math.exp(-distanceKm / 2000)));
}

function sanitizePosition(row) {
    const lat = Number(row.latitude ?? row.lat);
    const lng = Number(row.longitude ?? row.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
        position_id: row.map_position_id ?? row.id ?? null,
        lat,
        lng,
        rotation: Number(row.yaw ?? row.rotation ?? 0),
        pitch: Number(row.pitch ?? 0),
        zoom: Number(row.zoom ?? 1),
        panorama_id: row.panorama_id ?? null,
    };
}

async function loadMapPositions(mapId) {
    const rows = await db.query("SELECT * FROM map_positions WHERE map_id = ?", [mapId]);
    return rows.map(sanitizePosition).filter(Boolean);
}

function shuffle(values) {
    const out = [...values];
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

const activeGames = new Map();

let ioRef = null;
function setIo(io) {
    ioRef = io;
}

function broadcastGameState(game) {
    if (!ioRef) return;
    const room = ioRef.sockets.adapter.rooms.get(`game:${game.code}`);
    if (!room) return;
    for (const socketId of room) {
        const sock = ioRef.sockets.sockets.get(socketId);
        const identity = sock?.data?.identity;
        if (!identity) continue;
        sock.emit("game:state", serializeStateForIdentity(game, identity.identity_id));
    }
}

function clearRoundTimer(game) {
    if (game.round_timer) {
        clearTimeout(game.round_timer);
        game.round_timer = null;
    }
}

function armRoundTimer(game) {
    clearRoundTimer(game);
    const seconds = Number(game.round_time_seconds) || 0;
    const round = currentRound(game);
    if (!round || round.revealed || seconds <= 0) {
        if (round) round.deadline_ms = null;
        return;
    }

    round.deadline_ms = Date.now() + seconds * 1000;
    game.round_timer = setTimeout(() => forceExpireRound(game), seconds * 1000);
    if (typeof game.round_timer.unref === "function") game.round_timer.unref();
}

function forceExpireRound(game) {
    game.round_timer = null;
    const round = currentRound(game);
    if (!round || round.revealed) return;

    for (const [identityId, participant] of Object.entries(game.participants)) {
        if (round.guesses[identityId]) continue;
        if (participant.side !== "A" && participant.side !== "B") continue;
        const preview = round.previews[identityId];
        const fallback = preview || { lat: 0, lng: 0 };
        round.guesses[identityId] = { lat: Number(fallback.lat), lng: Number(fallback.lng) };
    }

    finalizeRoundIfBothSidesDone(game);
    broadcastGameState(game);
}

async function createGameFromLobby(lobby, requestedRounds) {
    const positions = await loadMapPositions(lobby.map_id);
    if (positions.length === 0) {
        throw new Error("This map has no playable positions");
    }

    const roundCount = requestedRounds && requestedRounds > 0
        ? Math.min(requestedRounds, positions.length)
        : Math.min(5, positions.length);
    const chosen = shuffle(positions).slice(0, roundCount);

    const sides = { A: [], B: [] };
    const participants = {};
    for (const participant of lobby.participants) {
        if (participant.side !== "A" && participant.side !== "B") continue;
        sides[participant.side].push(participant.identity_id);
        participants[participant.identity_id] = {
            identity_id: participant.identity_id,
            user_id: participant.user_id ?? null,
            display_name: participant.display_name,
            is_guest: participant.is_guest,
            side: participant.side,
            is_connected: true,
        };
    }

    const rounds = chosen.map((position) => ({
        position_id: position.position_id,
        actual: { lat: position.lat, lng: position.lng },
        rotation: position.rotation,
        pitch: position.pitch,
        zoom: position.zoom,
        panorama_id: position.panorama_id,
        guesses: {},
        previews: {},
        side_result: null,
        continues: new Set(),
        revealed: false,
    }));

    const game = {
        code: lobby.code,
        map_id: lobby.map_id,
        host_identity_id: lobby.host_identity_id,
        round_time_seconds: Number(lobby.round_time_seconds) || 0,
        allow_move: lobby.allow_move !== false,
        allow_zoom: lobby.allow_zoom !== false,
        sides,
        participants,
        rounds,
        current_round_index: 0,
        total_rounds: rounds.length,
        status: "active",
        scores: { A: 0, B: 0 },
        created_at: Date.now(),
        round_timer: null,
    };

    activeGames.set(lobby.code, game);
    armRoundTimer(game);
    return game;
}

function getGame(code) {
    return activeGames.get(code) || null;
}

function deleteGame(code) {
    const game = activeGames.get(code);
    if (game) clearRoundTimer(game);
    activeGames.delete(code);
}

function currentRound(game) {
    return game.rounds[game.current_round_index] || null;
}

function sideHasAllGuessed(game, round, side) {
    const members = game.sides[side];
    if (!members || members.length === 0) return false;
    const blockingMembers = members.filter((id) => {
        if (round.guesses[id] != null) return false;
        const p = game.participants[id];
        if (!p) return false;
        return p.is_connected !== false;
    });
    return blockingMembers.length === 0;
}

function markParticipantConnected(game, identityId, flag) {
    const participant = game.participants[identityId];
    if (!participant) return;
    participant.is_connected = Boolean(flag);
}

function finalizeRoundIfBothSidesDone(game) {
    const round = currentRound(game);
    if (!round || round.revealed) return false;
    if (!sideHasAllGuessed(game, round, "A") || !sideHasAllGuessed(game, round, "B")) return false;

    const result = { A: null, B: null };
    for (const side of ["A", "B"]) {
        let best = null;
        for (const memberId of game.sides[side]) {
            const guess = round.guesses[memberId];
            if (!guess) continue;
            const distance_km = calculateDistanceKm(guess, round.actual);
            if (!best || distance_km < best.distance_km) {
                best = { identity_id: memberId, guess, distance_km };
            }
        }
        if (best) {
            best.points = calculatePoints(best.distance_km);
            result[side] = best;
            game.scores[side] += best.points;
        }
    }
    round.side_result = result;
    round.revealed = true;
    round.deadline_ms = null;
    clearRoundTimer(game);

    const isLastRound = game.current_round_index === game.total_rounds - 1;
    if (isLastRound && !game.persisted) {
        persistCompletedGame(game).catch((err) =>
            console.error("[multiplayerGameHandler] persist on last reveal failed", err?.message)
        );
        lobbyHandler.resetLobbyToWaiting(game.code);
    }

    return true;
}

function serializeStreetView(round) {
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

function serializeGameSummary(game) {
    return {
        code: game.code,
        map_id: game.map_id,
        host_identity_id: game.host_identity_id,
        sides: game.sides,
        participants: Object.values(game.participants),
        total_rounds: game.total_rounds,
    };
}

function serializeStateForIdentity(game, identityId) {
    const me = game.participants[identityId];
    const mySide = me?.side || null;
    const round = currentRound(game);

    const base = {
        code: game.code,
        status: game.status,
        current_round: Math.min(game.current_round_index + 1, game.total_rounds),
        total_rounds: game.total_rounds,
        scores: game.scores,
        my_side: mySide,
    };

    if (game.status === "completed" || !round) {
        return {
            ...base,
            status: "completed",
            completed_rounds: game.rounds.map((r) => ({
                actual: r.actual,
                side_result: r.side_result,
            })),
        };
    }

    const myTeamPreviews = {};
    const myTeamGuesses = {};
    for (const [id, preview] of Object.entries(round.previews)) {
        if (game.participants[id]?.side === mySide) {
            myTeamPreviews[id] = preview;
        }
    }
    for (const [id, guess] of Object.entries(round.guesses)) {
        if (game.participants[id]?.side === mySide) {
            myTeamGuesses[id] = guess;
        }
    }

    const revealed = round.revealed;
    const continuesBySide = { A: [], B: [] };
    for (const id of round.continues) {
        const side = game.participants[id]?.side;
        if (side === "A" || side === "B") continuesBySide[side].push(id);
    }

    return {
        ...base,
        street_view: serializeStreetView(round),
        my_team_previews: myTeamPreviews,
        my_team_guesses: myTeamGuesses,
        my_guess: round.guesses[identityId] || null,
        side_done: {
            A: sideHasAllGuessed(game, round, "A"),
            B: sideHasAllGuessed(game, round, "B"),
        },
        round_time_seconds: Number(game.round_time_seconds) || 0,
        allow_move: game.allow_move !== false,
        allow_zoom: game.allow_zoom !== false,
        deadline_ms: round.deadline_ms || null,
        revealed,
        actual: revealed ? round.actual : null,
        all_guesses: revealed ? round.guesses : null,
        side_result: revealed ? round.side_result : null,
        continues_by_side: revealed ? continuesBySide : null,
    };
}

function updatePreview(game, identityId, latlng) {
    const round = currentRound(game);
    if (!round || round.revealed) return null;
    if (round.guesses[identityId]) return null;
    if (!game.participants[identityId]) return null;
    round.previews[identityId] = { lat: Number(latlng.lat), lng: Number(latlng.lng) };
    return round;
}

function clearPreview(game, identityId) {
    const round = currentRound(game);
    if (!round) return null;
    if (round.previews[identityId]) {
        delete round.previews[identityId];
    }
    return round;
}

function submitGuess(game, identityId, latlng) {
    const round = currentRound(game);
    if (!round) throw new Error("No active round");
    if (round.revealed) throw new Error("Round already revealed");
    if (round.guesses[identityId]) throw new Error("You already guessed this round");
    if (!game.participants[identityId]) throw new Error("You are not in this game");

    const lat = Number(latlng.lat);
    const lng = Number(latlng.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error("Invalid guess coordinates");
    }

    round.guesses[identityId] = { lat, lng };
    delete round.previews[identityId];

    finalizeRoundIfBothSidesDone(game);

    return round;
}

function buildSideJson(game, sideLabel) {
    const memberIds = game.sides[sideLabel] || [];
    const members = memberIds.map((id) => {
        const p = game.participants[id];
        return {
            identity_id: id,
            user_id: p?.user_id ?? null,
            display_name: p?.display_name ?? null,
            is_guest: Boolean(p?.is_guest),
        };
    });
    const userIds = members
        .filter((m) => !m.is_guest && m.user_id != null)
        .map((m) => m.user_id);

    return JSON.stringify({
        side_label: sideLabel,
        mode: "multiplayer",
        lobby_code: game.code,
        score: game.scores[sideLabel] || 0,
        status: "completed",
        total_rounds: game.total_rounds,
        members,
        user_ids: userIds,
        completed_at: new Date().toISOString(),
    });
}

async function persistCompletedGame(game) {
    if (game.persisted) return;
    game.persisted = true;

    try {
        const oneSide = buildSideJson(game, "A");
        const secondSide = buildSideJson(game, "B");
        await db.query(
            "INSERT INTO games (mode, one_side, second_side, map_id) VALUES (?, ?, ?, ?)",
            ["multiplayer", oneSide, secondSide, game.map_id]
        );
    } catch (error) {
        console.error("[multiplayerGameHandler] persistCompletedGame failed", error?.message);
        game.persisted = false;
    }
}

async function completeGame(game) {
    if (game.status === "completed") return;
    game.status = "completed";
    clearRoundTimer(game);
    await persistCompletedGame(game);
    lobbyHandler.resetLobbyToWaiting(game.code);
    scheduleCleanup(game);
}

function scheduleCleanup(game) {
    if (game.cleanup_timer) return;
    game.cleanup_timer = setTimeout(() => {
        activeGames.delete(game.code);
    }, COMPLETED_GAME_TTL_MS);
    if (typeof game.cleanup_timer.unref === "function") {
        game.cleanup_timer.unref();
    }
}

async function registerContinue(game, identityId) {
    const round = currentRound(game);
    if (!round || !round.revealed) return { advanced: false };
    round.continues.add(identityId);

    let hasA = false;
    let hasB = false;
    for (const id of round.continues) {
        const side = game.participants[id]?.side;
        if (side === "A") hasA = true;
        if (side === "B") hasB = true;
    }

    if (hasA && hasB) {
        game.current_round_index += 1;
        if (game.current_round_index >= game.total_rounds) {
            await completeGame(game);
            return { advanced: true, completed: true };
        }
        armRoundTimer(game);
        return { advanced: true, completed: false };
    }

    return { advanced: false, completed: false };
}

module.exports = {
    setIo,
    createGameFromLobby,
    getGame,
    deleteGame,
    currentRound,
    serializeGameSummary,
    serializeStateForIdentity,
    updatePreview,
    clearPreview,
    submitGuess,
    registerContinue,
    markParticipantConnected,
    finalizeRoundIfBothSidesDone,
};
