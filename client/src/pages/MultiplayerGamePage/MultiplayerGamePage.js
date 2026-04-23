import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2xUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";
import { useAuth } from "../../context/AuthContext";
import "./MultiplayerGamePage.css";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000/api";
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:3000";
const GUEST_STORAGE_KEY = "geoworld-guest";

const BASEMAP_URL =
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
const BASEMAP_ATTRIBUTION = "Tiles &copy; Esri";
const WORLD_BOUNDS = [[-85, -180], [85, 180]];

function BaseTileLayer() {
    return (
        <TileLayer
            attribution={BASEMAP_ATTRIBUTION}
            url={BASEMAP_URL}
            minZoom={2}
            maxZoom={18}
        />
    );
}

function MapInvalidateOnMount() {
    const map = useMap();
    useEffect(() => {
        const t = setTimeout(() => map.invalidateSize(), 150);
        const onResize = () => map.invalidateSize();
        window.addEventListener("resize", onResize);
        return () => {
            clearTimeout(t);
            window.removeEventListener("resize", onResize);
        };
    }, [map]);
    return null;
}

const DEFAULT_MARKER_ICON = new L.Icon({
    iconRetinaUrl: markerIcon2xUrl,
    iconUrl: markerIconUrl,
    shadowUrl: markerShadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
});

function sideMarkerIcon(side, label) {
    const color = side === "A" ? "#3a86ff" : "#f072c6";
    return L.divIcon({
        className: "mp-marker",
        html: `<div class="mp-marker-inner" style="background:${color};">${label}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
    });
}

function teammateMarkerIcon(letter) {
    return L.divIcon({
        className: "mp-marker",
        html: `<div class="mp-marker-inner mp-marker-teammate">${letter}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
    });
}

function readGuest() {
    try {
        const raw = localStorage.getItem(GUEST_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function buildStreetViewEmbedUrl(streetView) {
    if (!streetView) return null;
    const lat = Number(streetView.lat);
    const lng = Number(streetView.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const heading = Number.isFinite(Number(streetView.rotation)) ? Number(streetView.rotation) : 0;
    const zoom = Number.isFinite(Number(streetView.zoom)) ? Number(streetView.zoom) : 0;
    const fov = Math.max(10, Math.min(120, 180 / Math.pow(2, zoom)));
    console.log("[MultiplayerGamePage] street view zoom", { raw: streetView.zoom, applied: zoom, fov });
    return `https://maps.google.com/maps?q=&layer=c&cbll=${lat},${lng}&cbp=11,${heading},0,0,${fov}&output=svembed`;
}

function GuessMapEvents({ onPick, disabled }) {
    useMapEvents({
        click(event) {
            if (disabled) return;
            onPick(event.latlng);
        },
    });
    return null;
}

function ResultMap({ points }) {
    const map = useMap();
    useEffect(() => {
        if (!points || points.length < 2) return;
        map.fitBounds(points, { padding: [48, 48] });
    }, [map, points]);
    return null;
}

const MultiplayerGamePage = () => {
    const { code } = useParams();
    const navigate = useNavigate();
    const { token: userToken, user, isLoggedIn } = useAuth();

    const guest = useMemo(() => readGuest(), []);
    const activeToken = userToken || guest?.token || null;
    const identityId = useMemo(() => {
        if (isLoggedIn && user?.id != null) return `user:${user.id}`;
        if (guest?.id) return `guest:${guest.id}`;
        return null;
    }, [isLoggedIn, user?.id, guest?.id]);

    const [summary, setSummary] = useState(null);
    const [state, setState] = useState(null);
    const [error, setError] = useState("");
    const [abandonedMessage, setAbandonedMessage] = useState("");
    const [abandonedByHost, setAbandonedByHost] = useState(false);
    const [myPendingGuess, setMyPendingGuess] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [iFinishedLocally, setIFinishedLocally] = useState(false);
    const socketRef = useRef(null);

    const streetViewUrl = useMemo(() => buildStreetViewEmbedUrl(state?.street_view), [state?.street_view]);

    useEffect(() => {
        if (!activeToken) {
            navigate(`/lobby/${encodeURIComponent(code)}`);
            return;
        }

        const socket = io(SOCKET_URL, {
            auth: { token: activeToken },
            transports: ["websocket"],
        });
        socketRef.current = socket;

        socket.on("connect", () => {
            socket.emit("game:join", { code }, (ack) => {
                if (!ack?.ok) {
                    setError(ack?.error || "Failed to join game");
                    return;
                }
                setSummary(ack.summary);
                setState(ack.state);
            });
        });

        socket.on("game:state", (nextState) => {
            setState((prev) => {
                if (prev && nextState?.current_round !== prev.current_round) {
                    setMyPendingGuess(null);
                }
                return nextState;
            });
        });

        socket.on("game:preview", ({ identity_id, lat, lng }) => {
            setState((prev) => {
                if (!prev) return prev;
                const nextPreviews = { ...(prev.my_team_previews || {}), [identity_id]: { lat, lng } };
                return { ...prev, my_team_previews: nextPreviews };
            });
        });

        socket.on("connect_error", (socketError) => {
            setError(socketError.message || "Socket error");
        });

        socket.on("lobby_abandoned", ({ reason, host_left } = {}) => {
            setAbandonedMessage(reason || "The multiplayer match was abandoned.");
            setAbandonedByHost(Boolean(host_left));
            setError("");
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [activeToken, code, navigate]);

    const participantsById = useMemo(() => {
        const map = {};
        for (const p of summary?.participants || []) map[p.identity_id] = p;
        return map;
    }, [summary]);
    const amHost = Boolean(summary && identityId && summary.host_identity_id === identityId);
    const nameFor = useCallback((id) => participantsById[id]?.display_name || "?", [participantsById]);

    const sideLabels = useMemo(() => {
        const all = summary?.participants || [];
        const sideA = all.filter((p) => p.side === "A");
        const sideB = all.filter((p) => p.side === "B");
        if (sideA.length === 1 && sideB.length === 1) {
            return { A: sideA[0].display_name, B: sideB[0].display_name };
        }
        return { A: "Side A", B: "Side B" };
    }, [summary]);

    const placePin = (latlng) => {
        if (!socketRef.current || !latlng) return;
        setMyPendingGuess({ lat: latlng.lat, lng: latlng.lng });
        socketRef.current.emit("game:preview", { code, lat: latlng.lat, lng: latlng.lng });
    };

    const submitGuess = () => {
        if (!myPendingGuess || !socketRef.current) return;
        setSubmitting(true);
        socketRef.current.emit("game:submit_guess", {
            code,
            lat: myPendingGuess.lat,
            lng: myPendingGuess.lng,
        }, (ack) => {
            setSubmitting(false);
            if (!ack?.ok) setError(ack?.error || "Failed to submit guess");
        });
    };

    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const deadline = state?.deadline_ms;
        if (!deadline || state?.revealed) return;
        const id = setInterval(() => setNow(Date.now()), 500);
        return () => clearInterval(id);
    }, [state?.deadline_ms, state?.revealed]);

    const timeLeftMs = state?.deadline_ms && !state?.revealed
        ? Math.max(0, state.deadline_ms - now)
        : null;

    useEffect(() => {
        if (timeLeftMs === null) return;
        if (timeLeftMs > 0) return;
        if (state?.my_guess || state?.revealed) return;
        if (!socketRef.current) return;
        const pin = myPendingGuess || { lat: 0, lng: 0 };
        socketRef.current.emit("game:submit_guess", { code, lat: pin.lat, lng: pin.lng });
    }, [timeLeftMs, state?.my_guess, state?.revealed, myPendingGuess, code]);

    const leaveGame = async () => {
        if (activeToken) {
            try {
                await fetch(`${API_BASE_URL}/lobbies/${encodeURIComponent(code)}/leave`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${activeToken}` },
                });
            } catch {
                // Server also handles cleanup on socket disconnect.
            }
        }
        navigate(isLoggedIn ? "/home" : "/");
    };

    const clickContinue = () => {
        if (!socketRef.current) return;
        const isLastRound = state?.current_round === state?.total_rounds;
        socketRef.current.emit("game:continue", { code });
        if (isLastRound) {
            setIFinishedLocally(true);
        }
    };

    if (error && !state) {
        return (
            <div className="play-page">
                <div className="street-view-empty">
                    <div>
                        <p>{error}</p>
                        <button type="button" className="continue-button" onClick={() => navigate("/home")}>Back to home</button>
                    </div>
                </div>
            </div>
        );
    }

    if (!state) {
        return (
            <div className="play-page">
                <div className="street-view-empty">Connecting to game…</div>
            </div>
        );
    }

    if (abandonedMessage) {
        const showHostOptions = amHost && !abandonedByHost;
        return (
            <div className="play-page">
                <section className="finish-screen">
                    <div className="finish-card mp-finish-card">
                        <h2>Match Ended</h2>
                        <p>{abandonedMessage}</p>
                        <div className={`finish-actions ${showHostOptions ? "mp-finish-actions-two" : ""}`}>
                            {showHostOptions ? (
                                <button type="button" onClick={() => navigate(isLoggedIn ? "/home" : "/")}>Back to home</button>
                            ) : null}
                            <button
                                type="button"
                                onClick={() => navigate(showHostOptions ? `/lobby/${encodeURIComponent(code)}` : (isLoggedIn ? "/home" : "/"))}
                            >
                                {showHostOptions ? "Back to lobby" : "Back"}
                            </button>
                        </div>
                    </div>
                </section>
            </div>
        );
    }

    if (state.status === "completed" || iFinishedLocally) {
        const winner = state.scores.A === state.scores.B ? null : (state.scores.A > state.scores.B ? "A" : "B");
        return (
            <div className="play-page">
                <section className="finish-screen">
                    <div className="finish-card">
                        <h2>Game Finished</h2>
                        <p>Side A: <strong>{state.scores.A.toLocaleString()}</strong> pts</p>
                        <p>Side B: <strong>{state.scores.B.toLocaleString()}</strong> pts</p>
                        <p>
                            {winner ? `Side ${winner} wins!` : "It's a tie."}
                            {state.my_side ? ` (You were on Side ${state.my_side}.)` : ""}
                        </p>
                        <div className="finish-actions">
                            <button type="button" onClick={() => navigate(`/lobby/${encodeURIComponent(code)}`)}>
                                Back to Lobby
                            </button>
                        </div>
                    </div>
                </section>
            </div>
        );
    }

    const isRevealed = state.revealed;
    const myLocked = state.my_guess;
    const mySide = state.my_side;
    const otherSide = mySide === "A" ? "B" : "A";
    const mySideDone = state.side_done?.[mySide];
    const otherSideDone = state.side_done?.[otherSide];

    if (isRevealed && state.actual && state.side_result) {
        const actualPoint = [state.actual.lat, state.actual.lng];
        const sideAGuess = state.side_result.A?.guess ? [state.side_result.A.guess.lat, state.side_result.A.guess.lng] : null;
        const sideBGuess = state.side_result.B?.guess ? [state.side_result.B.guess.lat, state.side_result.B.guess.lng] : null;
        const boundsPoints = [actualPoint, sideAGuess, sideBGuess].filter(Boolean);

        const continuesA = state.continues_by_side?.A ?? [];
        const continuesB = state.continues_by_side?.B ?? [];
        const iContinued = [...continuesA, ...continuesB].includes(identityId);
        const myResult = state.side_result[mySide];
        const otherResult = state.side_result[otherSide];

        return (
            <div className="play-page">
                <div className="result-page">
                    <header className="result-topbar">
                        <div>
                            <h2>Round {state.current_round} / {state.total_rounds}</h2>
                            <p>Side A +{(state.side_result.A?.points || 0).toLocaleString()} · Side B +{(state.side_result.B?.points || 0).toLocaleString()}</p>
                        </div>
                        <div className="result-meta">
                            <span>Total — A: {state.scores.A.toLocaleString()} · B: {state.scores.B.toLocaleString()}</span>
                        </div>
                    </header>

                    <section className="result-map-wrap">
                        <MapContainer
                            center={actualPoint}
                            zoom={3}
                            minZoom={2}
                            worldCopyJump
                            maxBounds={WORLD_BOUNDS}
                            maxBoundsViscosity={1.0}
                            scrollWheelZoom
                            className="result-map"
                        >
                            <BaseTileLayer />
                            <MapInvalidateOnMount />
                            <Marker position={actualPoint} icon={DEFAULT_MARKER_ICON} />
                            {sideAGuess ? (
                                <>
                                    <Marker position={sideAGuess} icon={sideMarkerIcon("A", "A")} />
                                    <Polyline positions={[actualPoint, sideAGuess]} pathOptions={{ color: "#3a86ff", weight: 3 }} />
                                </>
                            ) : null}
                            {sideBGuess ? (
                                <>
                                    <Marker position={sideBGuess} icon={sideMarkerIcon("B", "B")} />
                                    <Polyline positions={[actualPoint, sideBGuess]} pathOptions={{ color: "#f072c6", weight: 3 }} />
                                </>
                            ) : null}
                            {boundsPoints.length >= 2 ? <ResultMap points={boundsPoints} /> : null}
                        </MapContainer>
                    </section>

                    <section className="result-footer">
                        <div className="result-summary-inline">
                            {myResult ? (
                                <p>Your side ({mySide}): +{myResult.points.toLocaleString()} · {myResult.distance_km.toFixed(1)} km · best guess by {nameFor(myResult.identity_id)}</p>
                            ) : null}
                            {otherResult ? (
                                <p>Side {otherSide}: +{otherResult.points.toLocaleString()} · {otherResult.distance_km.toFixed(1)} km · best guess by {nameFor(otherResult.identity_id)}</p>
                            ) : null}
                        </div>

                        <button
                            type="button"
                            className="continue-button"
                            onClick={clickContinue}
                            disabled={iContinued}
                        >
                            {iContinued
                                ? `Ready — A: ${continuesA.length > 0 ? "✓" : "…"} B: ${continuesB.length > 0 ? "✓" : "…"}`
                                : "Continue to Next Round"}
                        </button>
                    </section>
                </div>
            </div>
        );
    }

    const teammatePreviewPins = Object.entries(state.my_team_previews || {})
        .filter(([id]) => id !== identityId)
        .map(([id, pt]) => (
            <Marker
                key={`tp-${id}`}
                position={[pt.lat, pt.lng]}
                icon={teammateMarkerIcon((nameFor(id)[0] || "?").toUpperCase())}
            />
        ));

    const teammateLockedPins = Object.entries(state.my_team_guesses || {})
        .filter(([id]) => id !== identityId)
        .map(([id, pt]) => (
            <Marker
                key={`tl-${id}`}
                position={[pt.lat, pt.lng]}
                icon={teammateMarkerIcon((nameFor(id)[0] || "?").toUpperCase())}
            />
        ));

    const submitLabel = (() => {
        if (myLocked) {
            if (mySideDone && !otherSideDone) return "Waiting for other side…";
            if (!mySideDone) return "Waiting for your team…";
            return "Revealing…";
        }
        if (!myPendingGuess) return "Place a pin to guess";
        return submitting ? "Submitting…" : "Submit Guess";
    })();

    const submitDisabled = Boolean(myLocked) || !myPendingGuess || submitting;
    const myPinLatLng = myLocked || myPendingGuess;

    return (
        <div className="play-page">
            {streetViewUrl ? (
                <iframe
                    title="Street View"
                    src={streetViewUrl}
                    className="street-view-full"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    allowFullScreen
                />
            ) : (
                <div className="street-view-empty">Street view unavailable.</div>
            )}

            {timeLeftMs !== null ? (
                <div className={`mp-timer-overlay ${timeLeftMs <= 10000 ? "is-critical" : ""}`}>
                    {Math.floor(timeLeftMs / 60000)}:{String(Math.floor((timeLeftMs % 60000) / 1000)).padStart(2, "0")}
                </div>
            ) : null}

            <aside className="hud-panel hud-left">
                <div className="hud-actions">
                    <button type="button" onClick={leaveGame}>Back</button>
                </div>

                <h1>Round {state.current_round} / {state.total_rounds}</h1>
                <p className="play-muted">
                    You are on Side {mySide || "?"} — {myLocked ? "locked in." : "drop a pin when you know it."}
                </p>

                <div className="mp-scoreboard">
                    <div className={`mp-scoreboard-side ${mySide === "A" ? "is-me" : ""}`}>
                        <span>{sideLabels.A}</span>
                        <strong>{state.scores.A.toLocaleString()}</strong>
                        {state.side_done?.A ? <em>✓ guessed</em> : null}
                    </div>
                    <div className={`mp-scoreboard-side ${mySide === "B" ? "is-me" : ""}`}>
                        <span>{sideLabels.B}</span>
                        <strong>{state.scores.B.toLocaleString()}</strong>
                        {state.side_done?.B ? <em>✓ guessed</em> : null}
                    </div>
                </div>

                {error ? <p className="play-error">{error}</p> : null}
            </aside>

            <form
                className="hud-panel hud-map"
                onSubmit={(event) => {
                    event.preventDefault();
                    submitGuess();
                }}
            >
                <div className="guess-map-shell">
                    <MapContainer
                        center={[20, 0]}
                        zoom={2}
                        minZoom={2}
                        maxBounds={WORLD_BOUNDS}
                        maxBoundsViscosity={1.0}
                        scrollWheelZoom
                        className="guess-map"
                        worldCopyJump
                    >
                        <BaseTileLayer />
                        <MapInvalidateOnMount />
                        <GuessMapEvents onPick={placePin} disabled={Boolean(myLocked)} />
                        {teammatePreviewPins}
                        {teammateLockedPins}
                        {myPinLatLng ? (
                            <Marker position={[myPinLatLng.lat, myPinLatLng.lng]} icon={DEFAULT_MARKER_ICON} />
                        ) : null}
                    </MapContainer>
                </div>

                <div className="guess-input-grid">
                    <p className="guess-hint">
                        Click the map to place your pin. Teammates see it instantly.
                    </p>
                </div>

                <button type="submit" disabled={submitDisabled}>
                    {submitLabel}
                </button>
            </form>
        </div>
    );
};

export default MultiplayerGamePage;
