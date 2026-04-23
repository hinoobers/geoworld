import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import Header from "../../components/Header/Header";
import { useAuth } from "../../context/AuthContext";
import "./LobbyPage.css";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000/api";
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:3000";
const GUEST_STORAGE_KEY = "geoworld-guest";
const MAP_MODAL_PAGE_SIZE = 6;

function readGuest() {
    try {
        const raw = localStorage.getItem(GUEST_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function writeGuest(guest) {
    if (guest) {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(guest));
    } else {
        localStorage.removeItem(GUEST_STORAGE_KEY);
    }
}

const LobbyPage = () => {
    const { code } = useParams();
    const navigate = useNavigate();
    const { token: userToken, user, isLoggedIn } = useAuth();

    const [guest, setGuest] = useState(() => readGuest());
    const activeToken = userToken || guest?.token || null;

    useEffect(() => {
        if (userToken && guest) {
            writeGuest(null);
            setGuest(null);
        }
    }, [userToken, guest]);

    const [lobby, setLobby] = useState(null);
    const [me, setMe] = useState(null);
    const [error, setError] = useState("");
    const [joining, setJoining] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const [showMapModal, setShowMapModal] = useState(false);
    const [availableMaps, setAvailableMaps] = useState([]);
    const [mapsLoading, setMapsLoading] = useState(false);
    const [mapsError, setMapsError] = useState("");
    const [selectedMapId, setSelectedMapId] = useState("");
    const [mapSearch, setMapSearch] = useState("");
    const [mapSort, setMapSort] = useState("plays");
    const [mapPage, setMapPage] = useState(1);
    const [updatingMap, setUpdatingMap] = useState(false);
    const [selectedRoundTime, setSelectedRoundTime] = useState(0);
    const socketRef = useRef(null);

    const ROUND_TIME_OPTIONS = [
        { value: 0, label: "No time limit" },
        { value: 30, label: "30 seconds" },
        { value: 60, label: "60 seconds" },
        { value: 180, label: "3 minutes" },
        { value: 300, label: "5 minutes" },
    ];
    const roundTimeLabel = (s) =>
        ROUND_TIME_OPTIONS.find((o) => o.value === Number(s))?.label || "No time limit";

    const identityId = useMemo(() => {
        if (isLoggedIn && user?.id != null) return `user:${user.id}`;
        if (guest?.id) return `guest:${guest.id}`;
        return null;
    }, [isLoggedIn, user?.id, guest?.id]);

    const amHost = Boolean(lobby && identityId && lobby.host_identity_id === identityId);

    const joinAsGuest = useCallback(async () => {
        setError("");
        try {
            const response = await fetch(`${API_BASE_URL}/lobbies/guest`, { method: "POST" });
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.error || "Failed to create guest");
            const guestRecord = { id: body.guest.id, display_name: body.guest.display_name, token: body.token };
            writeGuest(guestRecord);
            setGuest(guestRecord);
        } catch (nextError) {
            setError(nextError.message || "Failed to create guest identity");
        }
    }, []);

    const joinLobby = useCallback(async (tokenToUse) => {
        setJoining(true);
        setError("");
        try {
            const response = await fetch(`${API_BASE_URL}/lobbies/${encodeURIComponent(code)}/join`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${tokenToUse}`,
                },
            });
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.error || "Failed to join lobby");
            setLobby(body.lobby);
            setMe(body.you);
        } catch (nextError) {
            setError(nextError.message || "Failed to join lobby");
        } finally {
            setJoining(false);
        }
    }, [code]);

    useEffect(() => {
        if (!activeToken) return;
        joinLobby(activeToken);
    }, [activeToken, joinLobby]);

    useEffect(() => {
        if (!activeToken || !lobby) return;

        const socket = io(SOCKET_URL, {
            auth: { token: activeToken },
            transports: ["websocket"],
        });
        socketRef.current = socket;

        socket.on("connect", () => {
            socket.emit("join_lobby", { code }, (ack) => {
                if (!ack?.ok) setError(ack?.error || "Socket join failed");
            });
        });

        socket.on("lobby_updated", (next) => {
            setLobby(next);
        });

        socket.on("lobby_kicked", ({ identity_id }) => {
            if (identity_id === identityId) {
                setError("You were removed from the lobby.");
                setTimeout(() => navigate("/home"), 1200);
            }
        });

        socket.on("game_started", ({ code: startedCode }) => {
            if (startedCode === code) {
                navigate(`/multiplayer/${encodeURIComponent(startedCode)}`);
            }
        });

        socket.on("lobby_abandoned", ({ reason } = {}) => {
            alert(`Lobby has been abandoned, ${reason ? reason.toLowerCase() : "host left"}`);
            navigate("/");
        });

        socket.on("connect_error", (socketError) => {
            setError(socketError.message || "Socket error");
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [activeToken, code, lobby?.code, identityId, navigate]);

    const moveParticipant = async (targetIdentityId, side) => {
        if (!activeToken) return;

        const current = lobby?.participants?.find((p) => p.identity_id === targetIdentityId);
        if (!current || current.side === side) return;

        try {
            const response = await fetch(`${API_BASE_URL}/lobbies/${encodeURIComponent(code)}/side`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${activeToken}`,
                },
                body: JSON.stringify({ target_identity_id: targetIdentityId, side }),
            });
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.error || "Failed to move player");
            setLobby(body);
        } catch (nextError) {
            setError(nextError.message || "Failed to move player");
        }
    };

    const kickParticipant = async (targetIdentityId) => {
        if (!activeToken) return;
        try {
            const response = await fetch(`${API_BASE_URL}/lobbies/${encodeURIComponent(code)}/kick`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${activeToken}`,
                },
                body: JSON.stringify({ target_identity_id: targetIdentityId }),
            });
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.error || "Failed to kick player");
        } catch (nextError) {
            setError(nextError.message || "Failed to kick player");
        }
    };

    const leaveLobby = async () => {
        if (!activeToken) return;
        try {
            await fetch(`${API_BASE_URL}/lobbies/${encodeURIComponent(code)}/leave`, {
                method: "POST",
                headers: { Authorization: `Bearer ${activeToken}` },
            });
        } catch {
            // Ignore — server cleans up on disconnect anyway.
        } finally {
            navigate("/home");
        }
    };

    const copyLink = async () => {
        const url = `${window.location.origin}/lobby/${code}`;
        try {
            await navigator.clipboard.writeText(url);
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 1800);
        } catch {
            setError("Copy failed. Link: " + url);
        }
    };

    const startGame = async () => {
        if (!activeToken) return;
        setError("");
        try {
            const response = await fetch(`${API_BASE_URL}/lobbies/${encodeURIComponent(code)}/start`, {
                method: "POST",
                headers: { Authorization: `Bearer ${activeToken}` },
            });
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.error || "Failed to start game");
        } catch (nextError) {
            setError(nextError.message || "Failed to start game");
        }
    };

    const openMapModal = () => {
        if (!amHost) return;
        setSelectedMapId(String(lobby?.map_id || ""));
        setSelectedRoundTime(Number(lobby?.round_time_seconds) || 0);
        setMapSearch("");
        setMapSort("plays");
        setMapPage(1);
        setMapsError("");
        setShowMapModal(true);
    };

    const closeMapModal = () => {
        if (updatingMap) return;
        setShowMapModal(false);
        setMapsError("");
    };

    const saveLobbyMap = async () => {
        if (!activeToken || !amHost) return;
        const nextMapId = Number(selectedMapId);
        if (!Number.isInteger(nextMapId) || nextMapId <= 0) {
            setMapsError("Select a valid map");
            return;
        }

        setMapsError("");
        try {
            setUpdatingMap(true);
            const response = await fetch(`${API_BASE_URL}/lobbies/${encodeURIComponent(code)}/settings`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${activeToken}`,
                },
                body: JSON.stringify({
                    map_id: nextMapId,
                    round_time_seconds: Number(selectedRoundTime) || 0,
                }),
            });

            const body = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(body?.error || "Failed to update map");
            }

            if (body?.lobby) {
                setLobby(body.lobby);
            }

            setShowMapModal(false);
        } catch (nextError) {
            setMapsError(nextError.message || "Failed to update map");
        } finally {
            setUpdatingMap(false);
        }
    };

    useEffect(() => {
        if (!showMapModal || !activeToken || !amHost) {
            return;
        }

        let cancelled = false;

        const fetchMaps = async () => {
            try {
                setMapsLoading(true);
                setMapsError("");
                const response = await fetch(`${API_BASE_URL}/maps/list`, {
                    headers: {
                        Authorization: `Bearer ${activeToken}`,
                    },
                });

                const body = await response.json().catch(() => []);
                if (!response.ok) {
                    throw new Error(body?.error || "Failed to load maps");
                }

                if (!cancelled) {
                    setAvailableMaps(Array.isArray(body) ? body : []);
                }
            } catch (nextError) {
                if (!cancelled) {
                    setAvailableMaps([]);
                    setMapsError(nextError.message || "Failed to load maps");
                }
            } finally {
                if (!cancelled) {
                    setMapsLoading(false);
                }
            }
        };

        fetchMaps();

        return () => {
            cancelled = true;
        };
    }, [activeToken, amHost, showMapModal]);

    const modalVisibleMaps = useMemo(() => {
        const query = mapSearch.trim().toLowerCase();
        const filtered = query
            ? availableMaps.filter((map) => {
                const name = String(map.name || "").toLowerCase();
                const description = String(map.description || "").toLowerCase();
                return name.includes(query) || description.includes(query);
            })
            : availableMaps;

        const sorted = [...filtered];
        if (mapSort === "plays") {
            sorted.sort((a, b) => Number(b.plays_count || 0) - Number(a.plays_count || 0));
        } else if (mapSort === "name") {
            sorted.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
        } else {
            sorted.sort((a, b) => Number(b.positions_count || 0) - Number(a.positions_count || 0));
        }

        return sorted;
    }, [availableMaps, mapSearch, mapSort]);

    const modalTotalPages = Math.max(1, Math.ceil(modalVisibleMaps.length / MAP_MODAL_PAGE_SIZE));
    const normalizedModalPage = Math.min(mapPage, modalTotalPages);
    const pagedModalMaps = useMemo(() => {
        const start = (normalizedModalPage - 1) * MAP_MODAL_PAGE_SIZE;
        return modalVisibleMaps.slice(start, start + MAP_MODAL_PAGE_SIZE);
    }, [modalVisibleMaps, normalizedModalPage]);

    useEffect(() => {
        if (mapPage > modalTotalPages) {
            setMapPage(modalTotalPages);
        }
    }, [mapPage, modalTotalPages]);

    if (!activeToken) {
        return (
            <div className="lobby-page">
                <Header />
                <main className="lobby-content">
                    <section className="lobby-hero">
                        <h1>Join Lobby {code}</h1>
                        <p>You need an identity to join. Log in, or play as a guest.</p>
                        <div className="lobby-auth-actions">
                            <button
                                type="button"
                                className="lobby-primary"
                                onClick={() => navigate(`/login?redirect=${encodeURIComponent(`/lobby/${code}`)}`)}
                            >
                                Log in
                            </button>
                            <button
                                type="button"
                                className="lobby-secondary"
                                onClick={() => navigate(`/signup?redirect=${encodeURIComponent(`/lobby/${code}`)}`)}
                            >
                                Sign up
                            </button>
                            <button type="button" className="lobby-secondary" onClick={joinAsGuest}>
                                Play as Guest
                            </button>
                        </div>
                        {error ? <p className="lobby-error">{error}</p> : null}
                    </section>
                </main>
            </div>
        );
    }

    const sideA = lobby?.participants?.filter((p) => p.side === "A") ?? [];
    const sideB = lobby?.participants?.filter((p) => p.side === "B") ?? [];

    return (
        <div className="lobby-page">
            <Header />
            <main className="lobby-content">
                <section className="lobby-hero">
                    <div className="lobby-hero-head">
                        <h1>Lobby {code}</h1>
                        <div className="lobby-hero-buttons">
                            <button type="button" className="lobby-copy" onClick={copyLink}>
                                {linkCopied ? "Link copied!" : "Copy invite link"}
                            </button>
                            <button type="button" className="lobby-leave" onClick={leaveLobby}>
                                Leave lobby
                            </button>
                        </div>
                    </div>
                    <p>
                        {amHost
                            ? "Drag players between sides, then start when each side has at least one."
                            : "Share the link, pick sides, and wait for the host to start."}
                    </p>
                    {lobby ? (
                        <p className="lobby-map-line">
                            Map: {lobby.map_name || `#${lobby.map_id}`} · Round timer: {roundTimeLabel(lobby.round_time_seconds)}
                        </p>
                    ) : null}
                    {me ? (
                        <p className="lobby-you">
                            You are <strong>{me.display_name}</strong>{me.is_guest ? " (guest)" : ""}{amHost ? " — host" : ""}
                        </p>
                    ) : null}
                    {error ? <p className="lobby-error">{error}</p> : null}
                    {joining && !lobby ? <p className="lobby-hint">Joining lobby…</p> : null}
                </section>

                {lobby ? (
                    <section className="lobby-sides">
                        <SidePanel
                            sideLabel="Side A"
                            sideCode="A"
                            participants={sideA}
                            amHost={amHost}
                            myIdentityId={identityId}
                            onMove={moveParticipant}
                            onKick={kickParticipant}
                        />
                        <SidePanel
                            sideLabel="Side B"
                            sideCode="B"
                            participants={sideB}
                            amHost={amHost}
                            myIdentityId={identityId}
                            onMove={moveParticipant}
                            onKick={kickParticipant}
                        />
                    </section>
                ) : null}

                {lobby ? (
                    <section className="lobby-controls">
                        {amHost ? (
                            <>
                                {sideA.length === 0 || sideB.length === 0 ? (
                                    <p className="lobby-hint">
                                        Each side needs at least one player to start.
                                    </p>
                                ) : null}
                                <div className="lobby-host-actions">
                                    <button
                                        type="button"
                                        className="lobby-secondary"
                                        onClick={openMapModal}
                                        disabled={lobby?.status !== "waiting"}
                                    >
                                        Edit Settings
                                    </button>
                                    <button
                                        type="button"
                                        className="lobby-primary"
                                        onClick={startGame}
                                        disabled={sideA.length === 0 || sideB.length === 0}
                                    >
                                        Start Game
                                    </button>
                                </div>
                            </>
                        ) : (
                            <p className="lobby-hint">Waiting for the host to start…</p>
                        )}
                    </section>
                ) : null}
            </main>

            {showMapModal ? (
                <div className="lobby-modal-backdrop" onClick={closeMapModal}>
                    <div className="lobby-modal" onClick={(event) => event.stopPropagation()}>
                        <h2>Edit Lobby Settings</h2>
                        <p>Pick a map and choose the round timer before starting the game.</p>

                        <section className="lobby-modal-controls" style={{ marginBottom: 12 }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span>Time between rounds</span>
                                <select
                                    value={String(selectedRoundTime)}
                                    onChange={(event) => setSelectedRoundTime(Number(event.target.value))}
                                    disabled={updatingMap}
                                    className="lobby-modal-sort"
                                >
                                    {ROUND_TIME_OPTIONS.map((option) => (
                                        <option key={option.value} value={String(option.value)}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </section>

                        <section className="lobby-modal-controls">
                            <input
                                type="search"
                                value={mapSearch}
                                onChange={(event) => {
                                    setMapSearch(event.target.value);
                                    setMapPage(1);
                                }}
                                placeholder="Search maps"
                                className="lobby-modal-search"
                                disabled={mapsLoading || updatingMap}
                            />
                            <select
                                value={mapSort}
                                onChange={(event) => {
                                    setMapSort(event.target.value);
                                    setMapPage(1);
                                }}
                                className="lobby-modal-sort"
                                disabled={mapsLoading || updatingMap}
                            >
                                <option value="plays">Most played</option>
                                <option value="name">Name</option>
                                <option value="positions">Most locations</option>
                            </select>
                        </section>

                        <section className="lobby-modal-map-list">
                            {pagedModalMaps.map((map) => (
                                <article
                                    key={`lobby-map-${map.map_id}`}
                                    className={`lobby-modal-map-card ${String(map.map_id) === selectedMapId ? "is-selected" : ""}`}
                                    onClick={() => setSelectedMapId(String(map.map_id))}
                                >
                                    <div className="lobby-modal-map-head">
                                        <h3>{map.name || "Untitled map"}</h3>
                                        <span>{Number(map.plays_count || 0)} plays</span>
                                    </div>
                                    <p>{Number(map.positions_count || 0)} locations</p>
                                </article>
                            ))}

                            {!mapsLoading && pagedModalMaps.length === 0 ? (
                                <article className="lobby-modal-empty">
                                    <h3>No maps found</h3>
                                    <p>{mapSearch.trim() ? "Try another search term." : "No maps are available yet."}</p>
                                </article>
                            ) : null}
                        </section>

                        {!mapsLoading && modalVisibleMaps.length > MAP_MODAL_PAGE_SIZE ? (
                            <div className="lobby-modal-pagination">
                                <button
                                    type="button"
                                    className="lobby-secondary"
                                    onClick={() => setMapPage((page) => Math.max(1, page - 1))}
                                    disabled={normalizedModalPage <= 1 || updatingMap}
                                >
                                    Prev
                                </button>
                                <span>Page {normalizedModalPage} / {modalTotalPages}</span>
                                <button
                                    type="button"
                                    className="lobby-secondary"
                                    onClick={() => setMapPage((page) => Math.min(modalTotalPages, page + 1))}
                                    disabled={normalizedModalPage >= modalTotalPages || updatingMap}
                                >
                                    Next
                                </button>
                            </div>
                        ) : null}

                        {mapsLoading ? <p className="lobby-hint">Loading maps...</p> : null}
                        {mapsError ? <p className="lobby-error">{mapsError}</p> : null}

                        <div className="lobby-modal-actions">
                            <button type="button" className="lobby-secondary" onClick={closeMapModal} disabled={updatingMap}>Cancel</button>
                            <button
                                type="button"
                                className="lobby-primary"
                                onClick={saveLobbyMap}
                                disabled={updatingMap || !selectedMapId}
                            >
                                {updatingMap ? "Saving..." : "Save settings"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

const SidePanel = ({ sideLabel, sideCode, participants, amHost, myIdentityId, onMove, onKick }) => {
    const otherSide = sideCode === "A" ? "B" : "A";
    const [isDropTarget, setIsDropTarget] = useState(false);

    const handleDragOver = (event) => {
        if (!amHost) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (!isDropTarget) setIsDropTarget(true);
    };

    const handleDragLeave = (event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setIsDropTarget(false);
    };

    const handleDrop = (event) => {
        event.preventDefault();
        setIsDropTarget(false);
        if (!amHost) return;
        const targetIdentityId = event.dataTransfer.getData("text/plain");
        if (targetIdentityId) onMove(targetIdentityId, sideCode);
    };

    return (
        <div
            className={`lobby-side lobby-side-${sideCode.toLowerCase()} ${isDropTarget ? "is-drop-target" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <h2>{sideLabel} <span className="lobby-side-count">({participants.length})</span></h2>
            {participants.length === 0 ? (
                <p className="lobby-empty">
                    {amHost ? "Drop a player here." : "No players yet."}
                </p>
            ) : (
                <ul className="lobby-participants">
                    {participants.map((participant) => (
                        <ParticipantRow
                            key={participant.identity_id}
                            participant={participant}
                            amHost={amHost}
                            myIdentityId={myIdentityId}
                            otherSide={otherSide}
                            onMove={onMove}
                            onKick={onKick}
                        />
                    ))}
                </ul>
            )}
        </div>
    );
};

const ParticipantRow = ({ participant, amHost, myIdentityId, otherSide, onMove, onKick }) => {
    const [isDragging, setIsDragging] = useState(false);
    const isMe = participant.identity_id === myIdentityId;

    const handleDragStart = (event) => {
        if (!amHost) {
            event.preventDefault();
            return;
        }
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", participant.identity_id);
        setIsDragging(true);
    };

    const handleDragEnd = () => setIsDragging(false);

    const rowClass = [
        participant.is_connected ? "" : "is-offline",
        isDragging ? "is-dragging" : "",
        amHost ? "is-draggable" : "",
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <li
            className={rowClass}
            draggable={amHost}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <span className="lobby-name">
                {participant.display_name}
                {participant.is_host ? " 👑" : ""}
                {participant.is_guest ? " (guest)" : ""}
                {isMe ? " (you)" : ""}
                {!participant.is_connected ? " — offline" : ""}
            </span>
            {amHost ? (
                <div className="lobby-row-actions">
                    <button
                        type="button"
                        className="lobby-move"
                        onClick={() => onMove(participant.identity_id, otherSide)}
                        title={`Move to ${otherSide}`}
                    >
                        → {otherSide}
                    </button>
                    {!isMe ? (
                        <button
                            type="button"
                            className="lobby-kick"
                            onClick={() => onKick(participant.identity_id)}
                            title="Kick from lobby"
                        >
                            ×
                        </button>
                    ) : null}
                </div>
            ) : null}
        </li>
    );
};

export default LobbyPage;
