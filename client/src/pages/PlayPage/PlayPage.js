import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2xUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";
import { useAuth } from "../../context/AuthContext";
import "./PlayPage.css";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000/api";
const DEFAULT_MARKER_ICON = new L.Icon({
    iconRetinaUrl: markerIcon2xUrl,
    iconUrl: markerIconUrl,
    shadowUrl: markerShadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
});

async function apiRequest(path, token, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(options.headers || {}),
        },
    });

    const responseBody = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(responseBody?.error || "Request failed");
    }

    return responseBody;
}

function buildStreetViewEmbedUrl(streetView) {
    if (!streetView) {
        return null;
    }

    const lat = Number(streetView.lat);
    const lng = Number(streetView.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }

    const heading = Number(streetView.rotation);
    const safeHeading = Number.isFinite(heading) ? heading : 0;

    return `https://maps.google.com/maps?q=&layer=c&cbll=${lat},${lng}&cbp=11,${safeHeading},0,0,0&output=svembed`;
}

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
            noWrap={false}
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

function GuessMapEvents({ onPick }) {
    useMapEvents({
        click(event) {
            onPick(event.latlng);
        },
    });

    return null;
}

function ResultMap({ guessPoint, actualPoint }) {
    const map = useMap();

    useEffect(() => {
        if (!guessPoint || !actualPoint) {
            return;
        }

        map.fitBounds([guessPoint, actualPoint], {
            padding: [48, 48],
        });
    }, [actualPoint, guessPoint, map]);

    return null;
}

function isCompleted(game) {
    return game?.status === "completed";
}

const PlayPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { token, isLoggedIn } = useAuth();

    const [maps, setMaps] = useState([]);
    const [selectedMapId, setSelectedMapId] = useState("");
    const [game, setGame] = useState(null);
    const [pendingGame, setPendingGame] = useState(null);
    const [guessLat, setGuessLat] = useState("");
    const [guessLng, setGuessLng] = useState("");
    const [latestRoundResult, setLatestRoundResult] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [showResultScreen, setShowResultScreen] = useState(false);
    const autoStartAttempted = useRef(false);
    const requestedMapId = useMemo(() => {
        const query = new URLSearchParams(location.search);
        const mapIdFromQuery = Number(query.get("map"));
        if (!Number.isInteger(mapIdFromQuery) || mapIdFromQuery <= 0) {
            return null;
        }

        return mapIdFromQuery;
    }, [location.search]);

    const streetViewEmbedUrl = useMemo(() => buildStreetViewEmbedUrl(game?.current_street_view), [game]);
    const guessedLocation = useMemo(() => {
        const lat = Number(guessLat);
        const lng = Number(guessLng);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return null;
        }

        return [lat, lng];
    }, [guessLat, guessLng]);

    const guessedPoint = useMemo(() => {
        if (!latestRoundResult?.guess) {
            return null;
        }

        return [Number(latestRoundResult.guess.lat), Number(latestRoundResult.guess.lng)];
    }, [latestRoundResult]);

    const actualPoint = useMemo(() => {
        if (!latestRoundResult?.actual) {
            return null;
        }

        return [Number(latestRoundResult.actual.lat), Number(latestRoundResult.actual.lng)];
    }, [latestRoundResult]);

    useEffect(() => {
        if (!isLoggedIn) {
            navigate("/login");
            return;
        }

        let cancelled = false;

        async function fetchMaps() {
            try {
                setLoading(true);
                const response = await apiRequest("/maps/list", token);
                if (cancelled) {
                    return;
                }

                const loadedMaps = response || [];
                setMaps(loadedMaps);
                if (loadedMaps.length > 0) {
                    const hasRequestedMap = requestedMapId !== null
                        ? loadedMaps.some((map) => Number(map.map_id) === requestedMapId)
                        : false;
                    setSelectedMapId(hasRequestedMap ? String(requestedMapId) : String(loadedMaps[0].map_id));
                }
            } catch (nextError) {
                if (!cancelled) {
                    setError(nextError.message);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        fetchMaps();

        return () => {
            cancelled = true;
        };
    }, [isLoggedIn, navigate, requestedMapId, token]);

    useEffect(() => {
        if (requestedMapId === null || autoStartAttempted.current || game || loading || maps.length === 0) {
            return;
        }

        const mapExists = maps.some((map) => Number(map.map_id) === requestedMapId);
        if (!mapExists) {
            autoStartAttempted.current = true;
            return;
        }

        autoStartAttempted.current = true;
        setSelectedMapId(String(requestedMapId));

        const startRequestedMap = async () => {
            setError("");
            setLatestRoundResult(null);

            try {
                setLoading(true);
                const created = await apiRequest("/games/create-game", token, {
                    method: "POST",
                    body: JSON.stringify({
                        map_id: requestedMapId,
                        mode: "singleplayer",
                    }),
                });

                const gameInfo = await apiRequest(`/games/gameinfo?game_id=${created.game_id}`, token);
                setGame(gameInfo);
                setPendingGame(null);
                setShowResultScreen(false);
                setGuessLat("");
                setGuessLng("");
            } catch (nextError) {
                setError(nextError.message);
            } finally {
                setLoading(false);
            }
        };

        startRequestedMap();
    }, [game, loading, maps, requestedMapId, token]);

    useEffect(() => {
        if (!game?.game_id || !token) {
            return;
        }

        let stopped = false;
        let lastHeartbeatAt = 0;

        const sendHeartbeat = async () => {
            if (stopped) {
                return;
            }

            try {
                await apiRequest("/games/heartbeat", token, {
                    method: "POST",
                    body: JSON.stringify({
                        game_id: game.game_id,
                    }),
                });
                lastHeartbeatAt = Date.now();
            } catch {
                // Ignore heartbeat failures; game actions still show explicit errors.
            }
        };

        const maybeSendHeartbeat = () => {
            if (document.visibilityState === "hidden") {
                return;
            }

            const now = Date.now();
            if (now - lastHeartbeatAt < 10000) {
                return;
            }

            sendHeartbeat();
        };

        sendHeartbeat();
        const heartbeatInterval = setInterval(() => {
            maybeSendHeartbeat();
        }, 30000);

        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                maybeSendHeartbeat();
            }
        };

        window.addEventListener("focus", maybeSendHeartbeat);
        window.addEventListener("pointerdown", maybeSendHeartbeat);
        window.addEventListener("keydown", maybeSendHeartbeat);
        document.addEventListener("visibilitychange", onVisibilityChange);

        return () => {
            stopped = true;
            clearInterval(heartbeatInterval);
            window.removeEventListener("focus", maybeSendHeartbeat);
            window.removeEventListener("pointerdown", maybeSendHeartbeat);
            window.removeEventListener("keydown", maybeSendHeartbeat);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, [game?.game_id, token]);

    const handleStartGame = async () => {
        if (!selectedMapId) {
            setError("Select a map first");
            return;
        }

        setError("");
        setLatestRoundResult(null);

        try {
            setLoading(true);
            const created = await apiRequest("/games/create-game", token, {
                method: "POST",
                body: JSON.stringify({
                    map_id: Number(selectedMapId),
                    mode: "singleplayer",
                }),
            });

            const gameInfo = await apiRequest(`/games/gameinfo?game_id=${created.game_id}`, token);
            setGame(gameInfo);
            setPendingGame(null);
            setShowResultScreen(false);
            setGuessLat("");
            setGuessLng("");
        } catch (nextError) {
            setError(nextError.message);
        } finally {
            setLoading(false);
        }
    };

    const handleGuessSubmit = async (event) => {
        event.preventDefault();

        const lat = Number(guessLat);
        const lng = Number(guessLng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            setError("Guess must include valid numeric latitude and longitude");
            return;
        }

        if (!game?.game_id) {
            setError("Start a game before guessing");
            return;
        }

        setError("");

        try {
            setLoading(true);
            const result = await apiRequest("/games/guess", token, {
                method: "POST",
                body: JSON.stringify({
                    game_id: game.game_id,
                    guess: { lat, lng },
                }),
            });

            setLatestRoundResult(result.round_result);
            setPendingGame(result.game);
            setShowResultScreen(true);
            setGuessLat("");
            setGuessLng("");
        } catch (nextError) {
            setError(nextError.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="play-page">
            {showResultScreen && latestRoundResult ? (
                <div className="result-page">
                    <header className="result-topbar">
                        <div>
                            <h2>Round Result</h2>
                            <p>+{latestRoundResult.points} points</p>
                        </div>
                        <div className="result-meta">
                            <span>Distance {latestRoundResult.distance_km} km</span>
                        </div>
                    </header>

                    <section className="result-map-wrap">
                        <MapContainer
                            center={actualPoint || guessedPoint || [0, 0]}
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
                            {guessedPoint && actualPoint ? <ResultMap guessPoint={guessedPoint} actualPoint={actualPoint} /> : null}
                            {guessedPoint ? <Marker position={guessedPoint} icon={DEFAULT_MARKER_ICON} /> : null}
                            {actualPoint ? <Marker position={actualPoint} icon={DEFAULT_MARKER_ICON} /> : null}
                            {guessedPoint && actualPoint ? <Polyline positions={[guessedPoint, actualPoint]} pathOptions={{ color: "#ffd166", weight: 3 }} /> : null}
                        </MapContainer>
                    </section>

                    <section className="result-footer">
                        <div className="result-summary-inline">
                            <p>Actual: {latestRoundResult.actual.lat}, {latestRoundResult.actual.lng}</p>
                            <p>Your guess: {latestRoundResult.guess.lat}, {latestRoundResult.guess.lng}</p>
                        </div>

                        <button
                            type="button"
                            className="continue-button"
                            onClick={() => {
                                if (pendingGame) {
                                    setGame(pendingGame);
                                }

                                setPendingGame(null);
                                setShowResultScreen(false);
                                setLatestRoundResult(null);
                                setGuessLat("");
                                setGuessLng("");
                            }}
                        >
                            Continue to Next Round
                        </button>
                    </section>
                </div>
            ) : (
                <>
                    {streetViewEmbedUrl ? (
                        <iframe
                            title="Street View"
                            src={streetViewEmbedUrl}
                            className="street-view-full"
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                            allowFullScreen
                        />
                    ) : (
                        <div className="street-view-empty">Start a game to load Street View.</div>
                    )}

                    <aside className="hud-panel hud-left">
                        <div className="hud-actions">
                            <button type="button" onClick={() => navigate("/home")}>Back</button>
                        </div>

                        <h1>GeoWorld Play</h1>
                        <p className="play-muted">Good luck, and have fun!</p>

                        {!game ? (
                            <>
                                <label htmlFor="map-select">Map</label>
                                <select
                                    id="map-select"
                                    value={selectedMapId}
                                    onChange={(event) => setSelectedMapId(event.target.value)}
                                    disabled={loading || maps.length === 0}
                                >
                                    {maps.length === 0 ? <option value="">No maps available</option> : null}
                                    {maps.map((map) => (
                                        <option key={map.map_id} value={String(map.map_id)}>
                                            {map.name} ({map.positions_count} rounds)
                                        </option>
                                    ))}
                                </select>

                                <button type="button" onClick={handleStartGame} disabled={loading || !selectedMapId}>
                                    Start Singleplayer Game
                                </button>
                            </>
                        ) : null}

                        {error ? <p className="play-error">{error}</p> : null}
                    </aside>

                    {game?.status === "active" && !showResultScreen ? (
                        <form className="hud-panel hud-map" onSubmit={handleGuessSubmit}>
                            <div className="guess-map-shell">
                                <MapContainer
                                    center={guessedLocation || [20, 0]}
                                    zoom={2}
                                    minZoom={2}
                                    worldCopyJump
                                    maxBounds={WORLD_BOUNDS}
                                    maxBoundsViscosity={1.0}
                                    scrollWheelZoom
                                    className="guess-map"
                                >
                                    <BaseTileLayer />
                                    <MapInvalidateOnMount />
                                    <GuessMapEvents
                                        onPick={({ lat, lng }) => {
                                            setGuessLat(lat.toFixed(6));
                                            setGuessLng(lng.toFixed(6));
                                        }}
                                    />
                                    {guessedLocation ? <Marker position={guessedLocation} icon={DEFAULT_MARKER_ICON} /> : null}
                                </MapContainer>
                            </div>

                            <div className="guess-input-grid">
                                <p className="guess-hint">Click on the map to place your guess marker.</p>
                            </div>

                            <button type="submit" disabled={loading || !guessedLocation}>Submit Guess</button>
                        </form>
                    ) : null}

            {isCompleted(game) && !showResultScreen ? (
                <section className="finish-screen">
                    <div className="finish-card">
                        <h2>Game Finished</h2>
                        <p>Final score: {game.total_score}</p>
                        <p>Rounds played: {game.total_rounds}</p>
                        {latestRoundResult ? <p>Last round: +{latestRoundResult.points} points</p> : null}
                        <div className="finish-actions">
                            <button type="button" onClick={() => navigate("/home")}>Back Home</button>
                            <button
                                type="button"
                                onClick={() => {
                                    setGame(null);
                                    setLatestRoundResult(null);
                                    setGuessLat("");
                                    setGuessLng("");
                                    setError("");
                                }}
                            >
                                New Game
                            </button>
                        </div>
                    </div>
                </section>
            ) : null}
                </>
            )}
        </div>
    );
};

export default PlayPage;
