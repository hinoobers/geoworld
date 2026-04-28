require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");
const { verifyToken } = require("./auth");
const lobbyHandler = require("./lobbyHandler");
const multiplayerGameHandler = require("./multiplayerGameHandler");
const db = require("./database");
const swaggerUi = require("swagger-ui-express");
const openApiSpec = require("./openapi.json");

const PFP_DIR = path.join(__dirname, "uploads", "pfps");
fs.mkdirSync(PFP_DIR, { recursive: true });

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
    },
});

app.set("io", io);
multiplayerGameHandler.setIo(io);

const corsOptions = {
    origin: [
        "https://geoworld.byenoob.com"
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const apiUsage = require("./apiUsage");
app.use("/api", apiUsage.middleware);

app.use("/pfps", express.static(PFP_DIR, {
    fallthrough: false,
    maxAge: "7d",
}));

app.use("/api/users", require("./routers/userRoutes"));
app.use("/api/maps", require("./routers/mapRoutes"));
app.use("/api/games", require("./routers/gameRoutes"));
app.use("/api/lobbies", require("./routers/lobbyRoutes"));
app.use("/api/admin", require("./routers/adminRoutes"));
app.use("/api/auth", require("./routers/authOauthRoutes"));

app.get("/api/docs/openapi.json", (req, res) => res.json(openApiSpec));
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec, {
    customSiteTitle: "GeoWorld API Docs",
}));

const { userOrGuestMiddleware } = require("./auth");

const STREETVIEW_DAILY_LIMIT_PER_USER = 300;
const streetviewQuota = new Map(); // key: identity -> { day, count }

app.get("/api/streetview/config", userOrGuestMiddleware, (req, res) => {
    const key = process.env.GOOGLE_STREET_VIEW_API_KEY;
    if (!key) return res.status(500).json({ error: "Street View API key not configured" });

    const identity = req.user?.is_guest ? `guest:${req.user.id}` : `user:${req.user.id}`;
    const today = new Date().toISOString().slice(0, 10);
    const entry = streetviewQuota.get(identity) || { day: today, count: 0 };
    if (entry.day !== today) {
        entry.day = today;
        entry.count = 0;
    }
    if (entry.count >= STREETVIEW_DAILY_LIMIT_PER_USER) {
        return res.status(429).json({ error: "Daily street view quota reached. Try again tomorrow." });
    }
    entry.count += 1;
    streetviewQuota.set(identity, entry);

    return res.json({ key });
});

app.get("/api/stats", async (req, res) => {
    try {
        const [users] = await db.query("SELECT COUNT(*) AS count FROM users");
        const [games] = await db.query("SELECT COUNT(*) AS count FROM games");
        const [maps] = await db.query("SELECT COUNT(*) AS count FROM maps");
        res.json({
            users: Number(users?.count) || 0,
            games: Number(games?.count) || 0,
            maps: Number(maps?.count) || 0,
        });
    } catch (error) {
        console.error("[stats] failed", error?.message);
        res.status(500).json({ error: "Failed to load stats" });
    }
});

io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
        return next(new Error("Missing auth token"));
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        return next(new Error("Invalid auth token"));
    }

    socket.data.identity = lobbyHandler.identityFromToken(decoded);
    next();
});

function broadcastGameState(io, game) {
    const room = io.sockets.adapter.rooms.get(`game:${game.code}`);
    if (!room) return;
    for (const socketId of room) {
        const sock = io.sockets.sockets.get(socketId);
        const identity = sock?.data?.identity;
        if (!identity) continue;
        sock.emit(
            "game:state",
            multiplayerGameHandler.serializeStateForIdentity(game, identity.identity_id)
        );
    }
}

function broadcastPreviewToTeammates(io, game, senderIdentityId, payload) {
    const senderSide = game.participants[senderIdentityId]?.side;
    if (!senderSide) return;
    const room = io.sockets.adapter.rooms.get(`game:${game.code}`);
    if (!room) return;
    for (const socketId of room) {
        const sock = io.sockets.sockets.get(socketId);
        const identity = sock?.data?.identity;
        if (!identity || identity.identity_id === senderIdentityId) continue;
        if (game.participants[identity.identity_id]?.side !== senderSide) continue;
        sock.emit("game:preview", payload);
    }
}

const DISCONNECT_GRACE_MS = 5_000;
const pendingAbandons = new Map(); // key: `${gameCode}:${identityId}` -> timeout

function cancelPendingAbandon(gameCode, identityId) {
    const key = `${gameCode}:${identityId}`;
    const handle = pendingAbandons.get(key);
    if (handle) {
        clearTimeout(handle);
        pendingAbandons.delete(key);
    }
}

io.on("connection", (socket) => {
    socket.on("join_lobby", ({ code }, ack) => {
        const identity = socket.data.identity;
        if (!identity || !code) {
            if (typeof ack === "function") ack({ ok: false, error: "Bad request" });
            return;
        }

        const lobby = lobbyHandler.getLobby(code);
        if (!lobby) {
            if (typeof ack === "function") ack({ ok: false, error: "Lobby not found" });
            return;
        }

        socket.join(`lobby:${code}`);
        socket.data.lobby_code = code;

        const existing = lobby.participants.find((p) => p.identity_id === identity.identity_id);
        if (existing) {
            existing.is_connected = true;
        }

        io.to(`lobby:${code}`).emit("lobby_updated", lobbyHandler.serializeLobby(lobby));
        if (typeof ack === "function") ack({ ok: true });
    });

    socket.on("game:join", ({ code }, ack) => {
        const identity = socket.data.identity;
        if (!identity || !code) {
            if (typeof ack === "function") ack({ ok: false, error: "Bad request" });
            return;
        }

        const game = multiplayerGameHandler.getGame(code);
        if (!game) {
            if (typeof ack === "function") ack({ ok: false, error: "Game not found" });
            return;
        }

        if (!game.participants[identity.identity_id]) {
            if (typeof ack === "function") ack({ ok: false, error: "You are not in this game" });
            return;
        }

        socket.join(`game:${code}`);
        socket.data.game_code = code;

        cancelPendingAbandon(code, identity.identity_id);
        multiplayerGameHandler.markParticipantConnected(game, identity.identity_id, true);

        const state = multiplayerGameHandler.serializeStateForIdentity(game, identity.identity_id);
        const summary = multiplayerGameHandler.serializeGameSummary(game);
        if (typeof ack === "function") ack({ ok: true, summary, state });
    });

    socket.on("game:preview", ({ code, lat, lng }) => {
        const identity = socket.data.identity;
        if (!identity || !code) return;

        const game = multiplayerGameHandler.getGame(code);
        if (!game) return;

        const round = multiplayerGameHandler.updatePreview(game, identity.identity_id, { lat, lng });
        if (!round) return;

        broadcastPreviewToTeammates(io, game, identity.identity_id, {
            identity_id: identity.identity_id,
            lat: Number(lat),
            lng: Number(lng),
        });
    });

    socket.on("game:submit_guess", ({ code, lat, lng }, ack) => {
        const identity = socket.data.identity;
        if (!identity || !code) {
            if (typeof ack === "function") ack({ ok: false, error: "Bad request" });
            return;
        }

        const game = multiplayerGameHandler.getGame(code);
        if (!game) {
            if (typeof ack === "function") ack({ ok: false, error: "Game not found" });
            return;
        }

        try {
            multiplayerGameHandler.submitGuess(game, identity.identity_id, { lat, lng });
            broadcastGameState(io, game);
            if (typeof ack === "function") ack({ ok: true });
        } catch (error) {
            if (typeof ack === "function") ack({ ok: false, error: error.message });
        }
    });

    socket.on("game:continue", async ({ code }, ack) => {
        const identity = socket.data.identity;
        if (!identity || !code) {
            if (typeof ack === "function") ack({ ok: false, error: "Bad request" });
            return;
        }

        const game = multiplayerGameHandler.getGame(code);
        if (!game) {
            if (typeof ack === "function") ack({ ok: false, error: "Game not found" });
            return;
        }

        try {
            await multiplayerGameHandler.registerContinue(game, identity.identity_id);
            broadcastGameState(io, game);
            if (typeof ack === "function") ack({ ok: true });
        } catch (error) {
            if (typeof ack === "function") ack({ ok: false, error: error.message });
        }
    });

    socket.on("disconnect", () => {
        const identity = socket.data.identity;
        if (!identity) return;

        const lobbyCode = socket.data.lobby_code;
        if (lobbyCode) {
            const lobby = lobbyHandler.markDisconnected(lobbyCode, identity.identity_id);
            if (lobby) {
                io.to(`lobby:${lobbyCode}`).emit("lobby_updated", lobbyHandler.serializeLobby(lobby));
            }
        }

        const gameCode = socket.data.game_code;
        if (gameCode) {
            const game = multiplayerGameHandler.getGame(gameCode);
            if (game) {
                const lobby = lobbyHandler.getLobby(gameCode);
                const disconnectedName = game.participants[identity.identity_id]?.display_name || "A player";

                if (lobby && lobby.status === "in_game") {
                    multiplayerGameHandler.markParticipantConnected(game, identity.identity_id, false);
                    broadcastGameState(io, game);

                    const key = `${gameCode}:${identity.identity_id}`;
                    cancelPendingAbandon(gameCode, identity.identity_id);

                    const handle = setTimeout(() => {
                        pendingAbandons.delete(key);
                        const liveGame = multiplayerGameHandler.getGame(gameCode);
                        const liveLobby = lobbyHandler.getLobby(gameCode);
                        if (!liveGame || !liveLobby || liveLobby.status !== "in_game") return;
                        const stillDisconnected = liveGame.participants[identity.identity_id]?.is_connected === false;
                        if (!stillDisconnected) return;

                        const disconnectedIsHost = liveLobby.host_identity_id === identity.identity_id;
                        const reason = `${disconnectedName} left the match`;
                        io.to(`lobby:${gameCode}`).emit("lobby_abandoned", {
                            reason,
                            left_identity_id: identity.identity_id,
                            host_left: disconnectedIsHost,
                        });
                        io.to(`game:${gameCode}`).emit("lobby_abandoned", {
                            reason,
                            left_identity_id: identity.identity_id,
                            host_left: disconnectedIsHost,
                        });
                        multiplayerGameHandler.deleteGame(gameCode);

                        if (disconnectedIsHost) {
                            lobbyHandler.disbandLobby(gameCode);
                            return;
                        }

                        const updatedLobby = lobbyHandler.removeParticipant(gameCode, identity.identity_id);
                        if (updatedLobby) {
                            updatedLobby.status = "waiting";
                            updatedLobby.game_id = null;
                            io.to(`lobby:${gameCode}`).emit("lobby_updated", lobbyHandler.serializeLobby(updatedLobby));
                        }
                    }, DISCONNECT_GRACE_MS);
                    if (typeof handle.unref === "function") handle.unref();
                    pendingAbandons.set(key, handle);
                    return;
                }

                multiplayerGameHandler.markParticipantConnected(game, identity.identity_id, false);
                multiplayerGameHandler.finalizeRoundIfBothSidesDone(game);
                broadcastGameState(io, game);
            }
        }
    });
});

server.listen(process.env.SERVER_PORT, () => {
    console.log(`Server is running on port ${process.env.SERVER_PORT}`);
});
