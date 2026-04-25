const { randomUUID } = require("crypto");

const lobbies = new Map();
const takenGuestNames = new Set();

function generateLobbyCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code;
    do {
        code = "";
        for (let i = 0; i < 6; i += 1) {
            code += alphabet[Math.floor(Math.random() * alphabet.length)];
        }
    } while (lobbies.has(code));
    return code;
}

function generateGuestName() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        const digits = String(Math.floor(10000 + Math.random() * 90000));
        const name = `Guest_${digits}`;
        if (!takenGuestNames.has(name)) {
            takenGuestNames.add(name);
            return name;
        }
    }

    const fallback = `Guest_${randomUUID().slice(0, 8)}`;
    takenGuestNames.add(fallback);
    return fallback;
}

function releaseGuestName(name) {
    if (name) {
        takenGuestNames.delete(name);
    }
}

const ALLOWED_ROUND_TIME_SECONDS = new Set([0, 30, 60, 180, 300]);

function normalizeRoundTimeSeconds(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return ALLOWED_ROUND_TIME_SECONDS.has(n) ? n : 0;
}

function normalizeRoundCount(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 5;
    if (n < 1) return 1;
    if (n > 50) return 50;
    return Math.floor(n);
}

function createLobby({ mapId, mapName, host, allowMove = true, allowZoom = true, allowLook = true, roundTimeSeconds = 0, roundCount = 5 }) {
    const code = generateLobbyCode();
    const hostParticipant = buildParticipant(host, "A");

    const lobby = {
        code,
        map_id: mapId,
        map_name: mapName || null,
        round_time_seconds: normalizeRoundTimeSeconds(roundTimeSeconds),
        round_count: normalizeRoundCount(roundCount),
        allow_move: Boolean(allowMove),
        allow_zoom: Boolean(allowZoom),
        allow_look: Boolean(allowLook),
        host_identity_id: host.identity_id,
        created_at: Date.now(),
        status: "waiting",
        participants: [hostParticipant],
        game_id: null,
    };

    lobbies.set(code, lobby);
    return lobby;
}

function buildParticipant(identity, side) {
    return {
        identity_id: identity.identity_id,
        user_id: identity.user_id ?? null,
        guest_id: identity.guest_id ?? null,
        display_name: identity.display_name,
        is_guest: Boolean(identity.is_guest),
        side,
        is_connected: true,
    };
}

function getLobby(code) {
    return lobbies.get(code) || null;
}

function joinLobby(code, identity) {
    const lobby = lobbies.get(code);
    if (!lobby) {
        throw new Error("Lobby not found");
    }

    const existing = lobby.participants.find((p) => p.identity_id === identity.identity_id);
    if (existing) {
        existing.is_connected = true;
        existing.display_name = identity.display_name;
        return { lobby, participant: existing, reconnected: true };
    }

    if (lobby.status !== "waiting") {
        throw new Error("Lobby is no longer accepting players");
    }

    const sideCounts = countSides(lobby);
    const side = sideCounts.A <= sideCounts.B ? "A" : "B";
    const participant = buildParticipant(identity, side);
    lobby.participants.push(participant);
    return { lobby, participant, reconnected: false };
}

function resetLobbyToWaiting(code) {
    const lobby = lobbies.get(code);
    if (!lobby) return null;
    lobby.status = "waiting";
    lobby.game_id = null;
    return lobby;
}

function disbandLobby(code) {
    const lobby = lobbies.get(code);
    if (!lobby) return null;
    for (const participant of lobby.participants) {
        if (participant.is_guest) releaseGuestName(participant.display_name);
    }
    lobbies.delete(code);
    return lobby;
}

function countSides(lobby) {
    const counts = { A: 0, B: 0 };
    for (const participant of lobby.participants) {
        if (participant.side === "A" || participant.side === "B") {
            counts[participant.side] += 1;
        }
    }
    return counts;
}

function setParticipantSide(code, actingIdentityId, targetIdentityId, nextSide) {
    const lobby = lobbies.get(code);
    if (!lobby) {
        throw new Error("Lobby not found");
    }

    if (lobby.host_identity_id !== actingIdentityId) {
        throw new Error("Only the host can move players");
    }

    if (nextSide !== "A" && nextSide !== "B") {
        throw new Error("Side must be A or B");
    }

    const target = lobby.participants.find((p) => p.identity_id === targetIdentityId);
    if (!target) {
        throw new Error("Participant not found");
    }

    target.side = nextSide;
    return lobby;
}

function removeParticipant(code, identityId) {
    const lobby = lobbies.get(code);
    if (!lobby) return null;

    const participant = lobby.participants.find((p) => p.identity_id === identityId);
    if (!participant) return lobby;

    if (participant.is_guest && participant.display_name) {
        releaseGuestName(participant.display_name);
    }

    lobby.participants = lobby.participants.filter((p) => p.identity_id !== identityId);

    if (lobby.participants.length === 0) {
        lobbies.delete(code);
        return null;
    }

    if (lobby.host_identity_id === identityId) {
        lobby.host_identity_id = lobby.participants[0].identity_id;
    }

    return lobby;
}

function markDisconnected(code, identityId) {
    const lobby = lobbies.get(code);
    if (!lobby) return null;

    const participant = lobby.participants.find((p) => p.identity_id === identityId);
    if (!participant) return lobby;

    participant.is_connected = false;
    return lobby;
}

function serializeLobby(lobby) {
    if (!lobby) return null;
    return {
        code: lobby.code,
        map_id: lobby.map_id,
        map_name: lobby.map_name ?? null,
        round_time_seconds: Number(lobby.round_time_seconds) || 0,
        round_count: Number(lobby.round_count) || 5,
        allow_move: lobby.allow_move !== false,
        allow_zoom: lobby.allow_zoom !== false,
        allow_look: lobby.allow_look !== false,
        host_identity_id: lobby.host_identity_id,
        status: lobby.status,
        game_id: lobby.game_id,
        participants: lobby.participants.map((p) => ({
            identity_id: p.identity_id,
            user_id: p.user_id,
            display_name: p.display_name,
            is_guest: p.is_guest,
            side: p.side,
            is_connected: p.is_connected,
            is_host: p.identity_id === lobby.host_identity_id,
        })),
    };
}

function identityFromToken(decodedToken) {
    if (!decodedToken) return null;

    if (decodedToken.is_guest) {
        return {
            identity_id: `guest:${decodedToken.id}`,
            guest_id: decodedToken.id,
            user_id: null,
            display_name: decodedToken.username,
            is_guest: true,
        };
    }

    return {
        identity_id: `user:${decodedToken.id}`,
        guest_id: null,
        user_id: decodedToken.id,
        display_name: decodedToken.username,
        is_guest: false,
    };
}

module.exports = {
    generateGuestName,
    releaseGuestName,
    createLobby,
    getLobby,
    joinLobby,
    setParticipantSide,
    removeParticipant,
    markDisconnected,
    serializeLobby,
    identityFromToken,
    resetLobbyToWaiting,
    disbandLobby,
    normalizeRoundTimeSeconds,
    ALLOWED_ROUND_TIME_SECONDS,
    normalizeRoundCount,
};
