import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../../components/Header/Header";
import StreetViewPano from "../../components/StreetViewPano/StreetViewPano";
import { useAuth } from "../../context/AuthContext";
import COUNTRIES from "../../data/countries";
import "./CountryStreakPage.css";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000/api";

const CountryStreakPage = () => {
    const navigate = useNavigate();
    const { token, isLoggedIn } = useAuth();

    const [game, setGame] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [selectedCountry, setSelectedCountry] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [lastResult, setLastResult] = useState(null);

    useEffect(() => {
        if (!isLoggedIn) {
            navigate("/login");
        }
    }, [isLoggedIn, navigate]);

    const startGame = async () => {
        setError("");
        setLastResult(null);
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/games/country-streak/start`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.error || "Failed to start");
            setGame(body);
            setSelectedCountry("");
        } catch (err) {
            setError(err.message || "Failed to start");
        } finally {
            setLoading(false);
        }
    };

    const submitGuess = async () => {
        if (!game?.game_id || !selectedCountry) {
            setError("Pick a country first");
            return;
        }
        setError("");
        setSubmitting(true);
        try {
            const res = await fetch(`${API_BASE_URL}/games/country-streak/guess`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    game_id: game.game_id,
                    country_code: selectedCountry,
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.error || "Failed to submit");
            setLastResult(body.last_result);
            setGame(body);
            setSelectedCountry("");
        } catch (err) {
            setError(err.message || "Failed to submit");
        } finally {
            setSubmitting(false);
        }
    };

    const sortedCountries = useMemo(() => COUNTRIES, []);

    const isActive = game?.status === "active";
    const isFinished = game?.status === "completed";
    const sv = game?.current_street_view;

    return (
        <div className="country-streak-page">
            <Header />

            <main className="country-streak-content">
                {!game ? (
                    <section className="country-streak-hero">
                        <h1>🏳️ Country Streak</h1>
                        <p>
                            Guess the country from a Street View. Each correct guess adds +1
                            and reveals a new country. One wrong guess and the streak ends.
                        </p>
                        <button
                            type="button"
                            className="country-streak-primary"
                            onClick={startGame}
                            disabled={loading}
                        >
                            {loading ? "Loading..." : "Start"}
                        </button>
                        {error ? <p className="country-streak-error">{error}</p> : null}
                    </section>
                ) : (
                    <>
                        <section className="country-streak-bar">
                            <div>
                                <span className="country-streak-label">Streak</span>
                                <strong className="country-streak-value">{game.streak}</strong>
                            </div>
                            <div>
                                <span className="country-streak-label">Round</span>
                                <strong className="country-streak-value">{game.current_round}</strong>
                            </div>
                            <button
                                type="button"
                                className="country-streak-ghost"
                                onClick={() => {
                                    setGame(null);
                                    setLastResult(null);
                                }}
                            >
                                Quit
                            </button>
                        </section>

                        {lastResult ? (
                            <section className={`country-streak-result ${lastResult.correct ? "is-correct" : "is-wrong"}`}>
                                {lastResult.correct ? (
                                    <p>✅ Correct! That was <strong>{lastResult.actual_name}</strong>.</p>
                                ) : (
                                    <p>❌ Wrong — that was <strong>{lastResult.actual_name}</strong>.</p>
                                )}
                            </section>
                        ) : null}

                        {isActive && sv ? (
                            <section className="country-streak-pano-wrap">
                                <StreetViewPano
                                    lat={sv.lat}
                                    lng={sv.lng}
                                    heading={sv.rotation || 0}
                                    pitch={sv.pitch || 0}
                                    zoom={sv.zoom || 1}
                                    allowMove
                                    allowZoom
                                    allowLook
                                    className="country-streak-pano"
                                />
                            </section>
                        ) : null}

                        {isActive ? (
                            <section className="country-streak-guess">
                                <label htmlFor="country-select">Which country is this?</label>
                                <select
                                    id="country-select"
                                    value={selectedCountry}
                                    onChange={(e) => setSelectedCountry(e.target.value)}
                                    disabled={submitting}
                                >
                                    <option value="">— Pick a country —</option>
                                    {sortedCountries.map((c) => (
                                        <option key={c.code} value={c.code}>{c.name}</option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    className="country-streak-primary"
                                    onClick={submitGuess}
                                    disabled={submitting || !selectedCountry}
                                >
                                    {submitting ? "Checking..." : "Submit"}
                                </button>
                            </section>
                        ) : null}

                        {isFinished ? (
                            <section className="country-streak-end">
                                <h2>Streak ended at {game.streak}</h2>
                                <div className="country-streak-end-actions">
                                    <button
                                        type="button"
                                        className="country-streak-primary"
                                        onClick={startGame}
                                        disabled={loading}
                                    >
                                        Play again
                                    </button>
                                    <button
                                        type="button"
                                        className="country-streak-ghost"
                                        onClick={() => navigate("/home")}
                                    >
                                        Back home
                                    </button>
                                </div>
                            </section>
                        ) : null}

                        {error ? <p className="country-streak-error">{error}</p> : null}
                    </>
                )}
            </main>
        </div>
    );
};

export default CountryStreakPage;
