import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2xUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";
import StreetViewPano from "../../components/StreetViewPano/StreetViewPano";
import { hasDemoBeenPlayed, markDemoAsPlayed } from "./demoFlags";
import "../PlayPage/PlayPage.css";

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

const BASEMAP_URL =
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
const WORLD_BOUNDS = [[-85, -180], [85, 180]];

function BaseTileLayer() {
    return (
        <TileLayer
            attribution="Tiles &copy; Esri"
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
        if (!guessPoint || !actualPoint) return;
        map.fitBounds([guessPoint, actualPoint], { padding: [48, 48] });
    }, [actualPoint, guessPoint, map]);
    return null;
}

const DemoPage = () => {
    const navigate = useNavigate();
    const [alreadyPlayed, setAlreadyPlayed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [demo, setDemo] = useState(null);
    const [guess, setGuess] = useState(null);
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const initRef = useRef(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const played = await hasDemoBeenPlayed();
            if (!cancelled) setAlreadyPlayed(played);
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const startDemo = async () => {
        if (initRef.current) return;
        initRef.current = true;
        setError("");
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/demo/start`, { method: "POST" });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || "Failed to start demo");
            setDemo(body);
        } catch (e) {
            setError(e.message);
            initRef.current = false;
        } finally {
            setLoading(false);
        }
    };

    const submitGuess = async () => {
        if (!demo || !guess) return;
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`${API_BASE_URL}/demo/guess`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ demo_id: demo.demo_id, guess }),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || "Failed to submit guess");
            setResult(body);
            await markDemoAsPlayed();
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const guessedPoint = useMemo(
        () => (result?.guess ? [result.guess.lat, result.guess.lng] : null),
        [result]
    );
    const actualPoint = useMemo(
        () => (result?.actual ? [result.actual.lat, result.actual.lng] : null),
        [result]
    );

    if (alreadyPlayed && !demo) {
        return (
            <div className="play-page">
                <section className="finish-screen">
                    <div className="finish-card">
                        <h2>Demo Already Played</h2>
                        <p>You've already tried the demo!. Sign up for unlimited play!</p>
                        <div className="finish-actions">
                            <button type="button" onClick={() => navigate("/signup")}>Create Account</button>
                            <button type="button" onClick={() => navigate("/")}>Back</button>
                        </div>
                    </div>
                </section>
            </div>
        );
    }

    if (!demo) {
        return (
            <div className="play-page">
                <section className="finish-screen">
                    <div className="finish-card">
                        <h2>GeoWorld Demo</h2>
                        <p>Try our platform once on a demo location!</p>
                        {error ? <p className="play-error">{error}</p> : null}
                        <div className="finish-actions">
                            <button type="button" onClick={startDemo} disabled={loading}>
                                {loading ? "Loading..." : "Start Demo"}
                            </button>
                            <button type="button" onClick={() => navigate("/")}>Back</button>
                        </div>
                        <p style={{ marginTop: 12, opacity: 0.75, fontSize: 13 }}>
                            Want more rounds, custom maps, multiplayer? <Link to="/signup" style={{ color: "#4ea1ff", textDecoration: "underline" }}>Create an account</Link>.
                        </p>
                    </div>
                </section>
            </div>
        );
    }

    if (result) {
        return (
            <div className="play-page">
                <div className="result-page">
                    <header className="result-topbar">
                        <div>
                            <h2>Demo Result</h2>
                            <p>Actual: {result.actual.lat}, {result.actual.lng}</p>
                            <p>Your guess: {result.guess.lat}, {result.guess.lng}</p>
                        </div>
                        <div className="result-meta">
                            <span>Distance {result.distance_km} km</span>
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
                            <p className="result-points">+{result.points} points</p>
                        </div>
                        <button
                            type="button"
                            className="continue-button"
                            onClick={() => navigate("/signup")}
                        >
                            Create Account to Keep Playing
                        </button>
                    </section>
                </div>
            </div>
        );
    }

    const sv = demo.street_view;
    return (
        <div className="play-page">
            <StreetViewPano
                lat={sv.lat}
                lng={sv.lng}
                heading={sv.heading}
                pitch={sv.pitch}
                zoom={sv.zoom}
                demo
                className="street-view-full"
            />

            <aside className="hud-panel hud-left">
                <div className="hud-actions">
                    <button type="button" onClick={() => navigate("/")}>Back</button>
                </div>
                <h1>GeoWorld Demo</h1>
                <p className="play-muted">Place your guess on the map.</p>
                {error ? <p className="play-error">{error}</p> : null}
            </aside>

            <form
                className="hud-panel hud-map"
                onSubmit={(e) => {
                    e.preventDefault();
                    submitGuess();
                }}
            >
                <div className="guess-map-shell">
                    <MapContainer
                        center={guess ? [guess.lat, guess.lng] : [20, 0]}
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
                            onPick={({ lat, lng }) => setGuess({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) })}
                        />
                        {guess ? <Marker position={[guess.lat, guess.lng]} icon={DEFAULT_MARKER_ICON} /> : null}
                    </MapContainer>
                </div>
                <div className="guess-input-grid">
                    <p className="guess-hint">Click on the map to place your guess marker.</p>
                </div>
                <button type="submit" disabled={loading || !guess}>Submit Guess</button>
            </form>
        </div>
    );
};

export default DemoPage;
