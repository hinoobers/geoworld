import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import StreetViewPano from "../../components/StreetViewPano/StreetViewPano";
import { useAuth } from "../../context/AuthContext";
import { pickCountryStreakRound } from "../../utils/pickStreetView";
import "./CountryStreakPage.css";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000/api";
const BASEMAP_URL =
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
const BASEMAP_ATTRIBUTION = "Tiles &copy; Esri";
const WORLD_BOUNDS = [[-85, -180], [85, 180]];

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

const baseStyle = {
    weight: 0.6,
    color: "#5c8dff",
    fillColor: "#1d2742",
    fillOpacity: 0.05,
};
const hoverStyle = { ...baseStyle, fillColor: "#8f50ff", fillOpacity: 0.35 };
const selectedStyle = { ...baseStyle, fillColor: "#5c8dff", fillOpacity: 0.55, weight: 1.2, color: "#a4cbff" };
const correctStyle = { ...baseStyle, fillColor: "#39d38a", fillOpacity: 0.6, color: "#8ff2b7", weight: 1.2 };
const wrongStyle = { ...baseStyle, fillColor: "#ff5b6e", fillOpacity: 0.6, color: "#ffb1bb", weight: 1.2 };

function CountryLayer({ geojson, selectedCode, lockedResult, onSelect }) {
    const onEachFeature = useCallback(
        (feature, layer) => {
            const iso = (feature.properties.iso || "").toUpperCase();
            layer.on({
                mouseover: () => {
                    if (lockedResult) return;
                    if (iso === selectedCode) return;
                    layer.setStyle(hoverStyle);
                },
                mouseout: () => {
                    if (lockedResult) {
                        applyLockedStyle(layer, iso, lockedResult);
                        return;
                    }
                    layer.setStyle(iso === selectedCode ? selectedStyle : baseStyle);
                },
                click: () => {
                    if (lockedResult) return;
                    if (!iso) return;
                    onSelect(iso);
                },
            });

            if (lockedResult) {
                applyLockedStyle(layer, iso, lockedResult);
            } else {
                layer.setStyle(iso === selectedCode ? selectedStyle : baseStyle);
            }
        },
        [selectedCode, lockedResult, onSelect]
    );

    return <GeoJSON key={`${selectedCode}-${lockedResult?.actual_code || ""}`} data={geojson} onEachFeature={onEachFeature} style={baseStyle} />;
}

function applyLockedStyle(layer, iso, result) {
    if (iso === result.actual_code) {
        layer.setStyle(correctStyle);
    } else if (iso === result.guessed_code && !result.correct) {
        layer.setStyle(wrongStyle);
    } else {
        layer.setStyle(baseStyle);
    }
}

async function api(path, token, options = {}) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(options.headers || {}),
        },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || "Request failed");
    return body;
}

const CountryStreakPage = () => {
    const navigate = useNavigate();
    const { token, isLoggedIn } = useAuth();

    const [game, setGame] = useState(null);
    const [geojson, setGeojson] = useState(null);
    const [selectedCode, setSelectedCode] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [pickingRound, setPickingRound] = useState(false);
    const registeringRef = useRef(false);

    useEffect(() => {
        if (!isLoggedIn) navigate("/login");
    }, [isLoggedIn, navigate]);

    useEffect(() => {
        let cancelled = false;
        fetch("/countries-110m.geojson")
            .then((r) => r.json())
            .then((data) => {
                if (!cancelled) setGeojson(data);
            })
            .catch(() => {
                if (!cancelled) setError("Failed to load country map");
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const sv = game?.current_street_view;
    const lastResult = game?.last_result;
    const isFinished = game?.status === "completed";
    const awaitingRound = game?.awaiting_round;
    const lockedResult = lastResult && (isFinished || awaitingRound) ? lastResult : null;

    const registerNextRound = useCallback(
        async (currentGame) => {
            if (registeringRef.current) return;
            registeringRef.current = true;
            setPickingRound(true);
            setError("");
            try {
                const exclude = currentGame.recent_countries || [];
                const candidate = await pickCountryStreakRound(exclude);
                if (!candidate) throw new Error("Could not find a Street View location");
                const updated = await api("/games/country-streak/register-round", token, {
                    method: "POST",
                    body: JSON.stringify({ game_id: currentGame.game_id, candidate }),
                });
                setGame(updated);
                setSelectedCode("");
            } catch (err) {
                setError(err.message || "Failed to load next round");
            } finally {
                setPickingRound(false);
                registeringRef.current = false;
            }
        },
        [token]
    );

    const startGame = async () => {
        setError("");
        setBusy(true);
        try {
            const created = await api("/games/country-streak/start", token, { method: "POST" });
            setGame(created);
            setSelectedCode("");
            await registerNextRound(created);
        } catch (err) {
            setError(err.message || "Failed to start");
        } finally {
            setBusy(false);
        }
    };

    const submitGuess = async () => {
        if (!game?.game_id || !selectedCode) {
            setError("Click a country on the map first");
            return;
        }
        setError("");
        setBusy(true);
        try {
            const updated = await api("/games/country-streak/guess", token, {
                method: "POST",
                body: JSON.stringify({ game_id: game.game_id, country_code: selectedCode }),
            });
            setGame(updated);
        } catch (err) {
            setError(err.message || "Failed to submit");
        } finally {
            setBusy(false);
        }
    };

    const continueAfterCorrect = () => {
        if (game) registerNextRound(game);
    };

    const newGame = () => {
        setGame(null);
        setSelectedCode("");
        setError("");
    };

    const startScreen = !game;

    const handleSelect = useCallback((iso) => setSelectedCode(iso), []);

    const countryLayer = useMemo(() => {
        if (!geojson) return null;
        return (
            <CountryLayer
                geojson={geojson}
                selectedCode={selectedCode}
                lockedResult={lockedResult}
                onSelect={handleSelect}
            />
        );
    }, [geojson, selectedCode, lockedResult, handleSelect]);

    const selectedName = useMemo(() => {
        if (!selectedCode || !geojson) return "";
        const f = geojson.features.find((x) => (x.properties.iso || "").toUpperCase() === selectedCode);
        return f?.properties?.name || selectedCode;
    }, [selectedCode, geojson]);

    return (
        <div className="play-page country-streak-play">
            {startScreen ? (
                <section className="finish-screen">
                    <div className="finish-card">
                        <h2>🏳️ Country Streak</h2>
                        <p>
                            Guess the country from a Street View. Click on the map to highlight your
                            pick. One wrong guess ends the streak.
                        </p>
                        <div className="finish-actions">
                            <button type="button" onClick={() => navigate("/home")}>Back</button>
                            <button type="button" onClick={startGame} disabled={busy}>
                                {busy ? "Loading…" : "Start"}
                            </button>
                        </div>
                        {error ? <p className="play-error">{error}</p> : null}
                    </div>
                </section>
            ) : (
                <>
                    {sv ? (
                        <StreetViewPano
                            lat={sv.lat}
                            lng={sv.lng}
                            heading={sv.rotation || 0}
                            pitch={sv.pitch || 0}
                            zoom={sv.zoom || 1}
                            allowMove
                            allowZoom
                            allowLook
                            className="street-view-full"
                        />
                    ) : (
                        <div className="street-view-empty">
                            {pickingRound ? "Loading next country…" : "Preparing round…"}
                        </div>
                    )}

                    <aside className="hud-panel hud-left">
                        <div className="hud-actions">
                            <button type="button" onClick={() => navigate("/home")}>Back</button>
                        </div>
                        <h1>Country Streak</h1>
                        <p className="play-score">
                            Streak <strong>{game.streak}</strong>
                            {" · "}Round <strong>{game.current_round}</strong>
                        </p>

                        {lastResult ? (
                            <p className={`streak-result ${lastResult.correct ? "is-correct" : "is-wrong"}`}>
                                {lastResult.correct
                                    ? `✅ Correct — ${lastResult.actual_name}`
                                    : `❌ Wrong — that was ${lastResult.actual_name}`}
                            </p>
                        ) : null}

                        {sv && !lockedResult ? (
                            <p className="play-muted">
                                Selected: <strong>{selectedName || "— pick on map —"}</strong>
                            </p>
                        ) : null}

                        {sv && !lockedResult ? (
                            <button type="button" onClick={submitGuess} disabled={busy || !selectedCode}>
                                {busy ? "Checking…" : "Submit guess"}
                            </button>
                        ) : null}

                        {awaitingRound && !isFinished ? (
                            <button type="button" onClick={continueAfterCorrect} disabled={pickingRound}>
                                {pickingRound ? "Loading…" : "Next country"}
                            </button>
                        ) : null}

                        {isFinished ? (
                            <button type="button" onClick={newGame}>Play again</button>
                        ) : null}

                        {error ? <p className="play-error">{error}</p> : null}
                    </aside>

                    <div className="hud-panel hud-map streak-map-shell">
                        <MapContainer
                            center={[20, 0]}
                            zoom={1}
                            minZoom={1}
                            worldCopyJump
                            maxBounds={WORLD_BOUNDS}
                            maxBoundsViscosity={1.0}
                            scrollWheelZoom
                            className="guess-map"
                        >
                            <TileLayer attribution={BASEMAP_ATTRIBUTION} url={BASEMAP_URL} minZoom={1} maxZoom={10} />
                            <MapInvalidateOnMount />
                            {countryLayer}
                        </MapContainer>
                    </div>
                </>
            )}
        </div>
    );
};

export default CountryStreakPage;
