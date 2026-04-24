const express = require("express");
const router = express.Router();
const { randomUUID } = require("crypto");
const { middleware, userOrGuestMiddleware, generateGuestToken } = require("../auth");
const { query } = require("../database");
const lobbyHandler = require("../lobbyHandler");
const multiplayerGameHandler = require("../multiplayerGameHandler");

function broadcastLobby(req, lobby) {
    const io = req.app.get("io");
    if (!io || !lobby) return;
    io.to(`lobby:${lobby.code}`).emit("lobby_updated", lobbyHandler.serializeLobby(lobby));
}

router.post("/guest", (req, res) => {
    const displayName = lobbyHandler.generateGuestName();
    const guestId = randomUUID();
    const token = generateGuestToken({ id: guestId, display_name: displayName });
    res.status(201).json({
        token,
        guest: {
            id: guestId,
            display_name: displayName,
            is_guest: true,
        },
    });
});

router.post("/", middleware, async (req, res) => {
    const { map_id, allow_move, allow_zoom, allow_look, round_time_seconds } = req.body;
    const mapId = Number(map_id);
    if (!Number.isInteger(mapId) || mapId <= 0) {
        return res.status(400).json({ error: "map_id must be a positive integer" });
    }

    const identity = lobbyHandler.identityFromToken(req.user);
    if (!identity || identity.is_guest) {
        return res.status(403).json({ error: "Only registered users can create lobbies" });
    }

    try {
        const rows = await query("SELECT id, name FROM maps WHERE id = ?", [mapId]);
        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: "Map not found" });
        }

        const lobby = lobbyHandler.createLobby({
            mapId,
            mapName: rows[0].name,
            host: identity,
            allowMove: allow_move !== false,
            allowZoom: allow_zoom !== false,
            allowLook: allow_look !== false,
            roundTimeSeconds: round_time_seconds,
        });

        return res.status(201).json({
            code: lobby.code,
            lobby: lobbyHandler.serializeLobby(lobby),
        });
    } catch {
        return res.status(500).json({ error: "Failed to create lobby" });
    }
});

router.get("/:code", userOrGuestMiddleware, (req, res) => {
    const lobby = lobbyHandler.getLobby(req.params.code);
    if (!lobby) {
        return res.status(404).json({ error: "Lobby not found" });
    }

    return res.json(lobbyHandler.serializeLobby(lobby));
});

router.post("/:code/join", userOrGuestMiddleware, (req, res) => {
    const identity = lobbyHandler.identityFromToken(req.user);
    if (!identity) {
        return res.status(401).json({ error: "Invalid identity" });
    }

    try {
        const { lobby, participant } = lobbyHandler.joinLobby(req.params.code, identity);
        broadcastLobby(req, lobby);
        return res.json({
            lobby: lobbyHandler.serializeLobby(lobby),
            you: participant,
        });
    } catch (error) {
        if (error.message === "Lobby not found") {
            return res.status(404).json({ error: error.message });
        }
        return res.status(400).json({ error: error.message });
    }
});

router.post("/:code/side", userOrGuestMiddleware, (req, res) => {
    const identity = lobbyHandler.identityFromToken(req.user);
    const { target_identity_id, side } = req.body;

    try {
        const lobby = lobbyHandler.setParticipantSide(
            req.params.code,
            identity.identity_id,
            target_identity_id,
            side
        );
        broadcastLobby(req, lobby);
        return res.json(lobbyHandler.serializeLobby(lobby));
    } catch (error) {
        const status = error.message === "Lobby not found" ? 404 : 400;
        return res.status(status).json({ error: error.message });
    }
});

router.post("/:code/map", userOrGuestMiddleware, async (req, res) => {
    const identity = lobbyHandler.identityFromToken(req.user);
    const { map_id } = req.body;
    const parsedMapId = Number(map_id);

    if (!Number.isInteger(parsedMapId) || parsedMapId <= 0) {
        return res.status(400).json({ error: "map_id must be a positive integer" });
    }

    const lobby = lobbyHandler.getLobby(req.params.code);
    if (!lobby) {
        return res.status(404).json({ error: "Lobby not found" });
    }

    if (lobby.host_identity_id !== identity.identity_id) {
        return res.status(403).json({ error: "Only the host can change map" });
    }

    if (lobby.status !== "waiting") {
        return res.status(400).json({ error: "Map can only be changed before game starts" });
    }

    try {
        const rows = await query("SELECT id, name FROM maps WHERE id = ?", [parsedMapId]);
        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: "Map not found" });
        }

        lobby.map_id = parsedMapId;
        lobby.map_name = rows[0].name;
        broadcastLobby(req, lobby);
        return res.json({
            ok: true,
            lobby: lobbyHandler.serializeLobby(lobby),
        });
    } catch {
        return res.status(500).json({ error: "Failed to change lobby map" });
    }
});

router.post("/:code/settings", userOrGuestMiddleware, async (req, res) => {
    const identity = lobbyHandler.identityFromToken(req.user);
    const { map_id, round_time_seconds, allow_move, allow_zoom, allow_look } = req.body || {};

    const lobby = lobbyHandler.getLobby(req.params.code);
    if (!lobby) {
        return res.status(404).json({ error: "Lobby not found" });
    }
    if (lobby.host_identity_id !== identity.identity_id) {
        return res.status(403).json({ error: "Only the host can change settings" });
    }
    if (lobby.status !== "waiting") {
        return res.status(400).json({ error: "Settings can only be changed before game starts" });
    }

    try {
        if (map_id !== undefined) {
            const parsedMapId = Number(map_id);
            if (!Number.isInteger(parsedMapId) || parsedMapId <= 0) {
                return res.status(400).json({ error: "map_id must be a positive integer" });
            }
            const rows = await query("SELECT id, name FROM maps WHERE id = ?", [parsedMapId]);
            if (!rows || rows.length === 0) {
                return res.status(404).json({ error: "Map not found" });
            }
            lobby.map_id = parsedMapId;
            lobby.map_name = rows[0].name;
        }

        if (round_time_seconds !== undefined) {
            if (!lobbyHandler.ALLOWED_ROUND_TIME_SECONDS.has(Number(round_time_seconds))) {
                return res.status(400).json({ error: "Invalid round_time_seconds" });
            }
            lobby.round_time_seconds = lobbyHandler.normalizeRoundTimeSeconds(round_time_seconds);
        }

        if (typeof allow_move === "boolean") lobby.allow_move = allow_move;
        if (typeof allow_zoom === "boolean") lobby.allow_zoom = allow_zoom;
        if (typeof allow_look === "boolean") lobby.allow_look = allow_look;

        broadcastLobby(req, lobby);
        return res.json({ ok: true, lobby: lobbyHandler.serializeLobby(lobby) });
    } catch {
        return res.status(500).json({ error: "Failed to update lobby settings" });
    }
});

router.post("/:code/leave", userOrGuestMiddleware, (req, res) => {
    const identity = lobbyHandler.identityFromToken(req.user);
    const existing = lobbyHandler.getLobby(req.params.code);

    if (!existing) {
        return res.json({ ok: true });
    }

    const isHost = existing.host_identity_id === identity.identity_id;
    const inGame = existing.status === "in_game";
    const leaverName = req.user?.username || (isHost ? "Host" : "A player");

    if (inGame) {
        const reason = `${leaverName} left the match`;
        const io = req.app.get("io");
        if (io) {
            io.to(`lobby:${req.params.code}`).emit("lobby_abandoned", {
                reason,
                left_identity_id: identity.identity_id,
                host_left: isHost,
            });
            io.to(`game:${req.params.code}`).emit("lobby_abandoned", {
                reason,
                left_identity_id: identity.identity_id,
                host_left: isHost,
            });
        }

        if (multiplayerGameHandler.getGame(req.params.code)) {
            multiplayerGameHandler.deleteGame(req.params.code);
        }

        if (isHost) {
            lobbyHandler.disbandLobby(req.params.code);
            return res.json({ ok: true, disbanded: true });
        }

        const updatedLobby = lobbyHandler.removeParticipant(req.params.code, identity.identity_id);
        if (updatedLobby) {
            updatedLobby.status = "waiting";
            updatedLobby.game_id = null;
            broadcastLobby(req, updatedLobby);
        }

        return res.json({ ok: true, disbanded: false, returned_to_lobby: true });
    }

    if (isHost) {
        const io = req.app.get("io");
        if (io) {
            io.to(`lobby:${req.params.code}`).emit("lobby_abandoned", {
                reason: "Host left the lobby",
                left_identity_id: identity.identity_id,
                host_left: true,
            });
        }
        lobbyHandler.disbandLobby(req.params.code);
        return res.json({ ok: true, disbanded: true });
    }

    const lobby = lobbyHandler.removeParticipant(req.params.code, identity.identity_id);
    if (lobby) broadcastLobby(req, lobby);
    return res.json({ ok: true });
});

router.post("/:code/start", userOrGuestMiddleware, async (req, res) => {
    const identity = lobbyHandler.identityFromToken(req.user);
    const lobby = lobbyHandler.getLobby(req.params.code);
    if (!lobby) return res.status(404).json({ error: "Lobby not found" });
    if (lobby.host_identity_id !== identity.identity_id) {
        return res.status(403).json({ error: "Only the host can start the game" });
    }
    if (lobby.status !== "waiting") {
        return res.status(400).json({ error: "Lobby is not in a startable state" });
    }

    const sideACount = lobby.participants.filter((p) => p.side === "A").length;
    const sideBCount = lobby.participants.filter((p) => p.side === "B").length;
    if (sideACount === 0 || sideBCount === 0) {
        return res.status(400).json({ error: "Both sides need at least one player" });
    }

    try {
        await multiplayerGameHandler.createGameFromLobby(lobby);
        lobby.status = "in_game";

        const io = req.app.get("io");
        if (io) {
            io.to(`lobby:${req.params.code}`).emit("game_started", { code: req.params.code });
        }
        return res.json({ ok: true });
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
});

router.post("/:code/kick", userOrGuestMiddleware, (req, res) => {
    const identity = lobbyHandler.identityFromToken(req.user);
    const { target_identity_id } = req.body;

    const existing = lobbyHandler.getLobby(req.params.code);
    if (!existing) {
        return res.status(404).json({ error: "Lobby not found" });
    }
    if (existing.host_identity_id !== identity.identity_id) {
        return res.status(403).json({ error: "Only the host can kick players" });
    }
    if (!target_identity_id || target_identity_id === identity.identity_id) {
        return res.status(400).json({ error: "Invalid kick target" });
    }

    const io = req.app.get("io");
    if (io) {
        io.to(`lobby:${req.params.code}`).emit("lobby_kicked", { identity_id: target_identity_id });
    }

    const lobby = lobbyHandler.removeParticipant(req.params.code, target_identity_id);
    if (lobby) broadcastLobby(req, lobby);
    return res.json({ ok: true });
});

module.exports = router;
