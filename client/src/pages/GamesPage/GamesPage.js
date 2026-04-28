import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../../components/Header/Header";
import { useAuth } from "../../context/AuthContext";
import "./GamesPage.css";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000/api";

const GamesPage = () => {
    const navigate = useNavigate();
    const { token, isLoggedIn } = useAuth();

    const [games, setGames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [modeFilter, setModeFilter] = useState("all");
    const [resultFilter, setResultFilter] = useState("all");
    const [sortOrder, setSortOrder] = useState("newest");
    const [openGame, setOpenGame] = useState(null);
    const [openPositions, setOpenPositions] = useState([]);
    const [openLoading, setOpenLoading] = useState(false);
    const [openError, setOpenError] = useState("");

    const openGameDetails = async (game) => {
        setOpenGame(game);
        setOpenPositions([]);
        setOpenError("");
        if (!game?.map_id) return;
        try {
            setOpenLoading(true);
            const res = await fetch(`${API_BASE_URL}/maps/pos/${game.map_id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const body = await res.json().catch(() => []);
            if (!res.ok) throw new Error(body?.error || "Failed to load locations");
            setOpenPositions(Array.isArray(body) ? body : []);
        } catch (err) {
            setOpenError(err.message || "Failed to load locations");
        } finally {
            setOpenLoading(false);
        }
    };

    useEffect(() => {
        if (!isLoggedIn) {
            navigate("/login");
        }
    }, [isLoggedIn, navigate]);

    useEffect(() => {
        if (!token) {
            return;
        }

        let cancelled = false;

        const loadGames = async () => {
            try {
                setLoading(true);
                setError("");

                const response = await fetch(`${API_BASE_URL}/users/me/games`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                const responseBody = await response.json().catch(() => []);
                if (!response.ok) {
                    throw new Error(responseBody?.error || "Failed to load games");
                }

                if (!cancelled) {
                    setGames(Array.isArray(responseBody) ? responseBody : []);
                }
            } catch (nextError) {
                if (!cancelled) {
                    setGames([]);
                    setError(nextError.message || "Failed to load games");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        loadGames();

        return () => {
            cancelled = true;
        };
    }, [token]);

    const visibleGames = useMemo(() => {
        const filtered = games.filter((game) => {
            const modeMatches = modeFilter === "all" || game.mode === modeFilter;
            const resultMatches = resultFilter === "all" || game.result === resultFilter;
            return modeMatches && resultMatches;
        });
        const ts = (g) => (g.created_at ? new Date(g.created_at).getTime() : 0);
        return filtered.slice().sort((a, b) =>
            sortOrder === "oldest" ? ts(a) - ts(b) : ts(b) - ts(a)
        );
    }, [games, modeFilter, resultFilter, sortOrder]);

    const renderResultLabel = (game) => {
        if (!game.result) return "-";
        if (game.result === "win") return "Win";
        if (game.result === "loss") return "Loss";
        if (game.result === "draw") return "Draw";
        return game.result;
    };

    const formatShortScore = (score) => {
        const n = Math.max(0, Math.round(Number(score) || 0));
        if (n < 1000) return String(n);
        return `${Math.round(n / 1000)}K`;
    };

    const singleplayerBadge = (game) => {
        if (game.status !== "completed") {
            return { label: "-", className: "games-result-unknown" };
        }
        const score = Number(game.score) || 0;
        const totalRounds = Number(game.total_rounds) || 0;
        const max = totalRounds * 5000;
        const ratio = max > 0 ? score / max : 0;

        let tier = "bad";
        if (ratio >= 0.6) tier = "good";
        else if (ratio >= 0.3) tier = "mid";

        return {
            label: formatShortScore(score),
            className: `games-result-score games-result-score-${tier}`,
        };
    };

    return (
        <div className="games-page">
            <Header />

            <main className="games-content">
                <section className="games-hero">
                    <h1>Your Games</h1>
                    <p>See your past matches and key stats from each game.</p>
                </section>

                <section className="games-controls">
                    <label htmlFor="games-mode-filter">Mode</label>
                    <select
                        id="games-mode-filter"
                        value={modeFilter}
                        onChange={(event) => setModeFilter(event.target.value)}
                    >
                        <option value="all">All</option>
                        <option value="singleplayer">Singleplayer</option>
                        <option value="multiplayer">Multiplayer</option>
                    </select>

                    <label htmlFor="games-result-filter">Result</label>
                    <select
                        id="games-result-filter"
                        value={resultFilter}
                        onChange={(event) => setResultFilter(event.target.value)}
                    >
                        <option value="all">All</option>
                        <option value="win">Win</option>
                        <option value="loss">Loss</option>
                    </select>

                    <label htmlFor="games-sort-filter">Sort</label>
                    <select
                        id="games-sort-filter"
                        value={sortOrder}
                        onChange={(event) => setSortOrder(event.target.value)}
                    >
                        <option value="newest">Newest first</option>
                        <option value="oldest">Oldest first</option>
                    </select>
                </section>

                {loading ? <p className="games-empty">Loading games...</p> : null}
                {error ? <p className="games-error">{error}</p> : null}

                {!loading && !error && visibleGames.length === 0 ? (
                    <p className="games-empty">No games found for this filter yet.</p>
                ) : null}

                {!loading && !error && visibleGames.length > 0 ? (
                    <section className="games-list">
                        {visibleGames.map((game) => {
                            const isStreak = game.mode === "country_streak";
                            return (
                                <article
                                    className="games-card games-card-clickable"
                                    key={`game-${game.game_id}`}
                                    onClick={() => openGameDetails(game)}
                                >
                                    <div className="games-card-head">
                                        <h3>{isStreak ? "🏳️ Country Streak" : (game.map_name || `Map #${game.map_id}`)}</h3>
                                        {isStreak ? (
                                            <span className="games-result games-result-score games-result-score-good">
                                                Streak {Number(game.score) || 0}
                                            </span>
                                        ) : game.mode === "singleplayer" ? (() => {
                                            const badge = singleplayerBadge(game);
                                            return (
                                                <span className={`games-result ${badge.className}`}>
                                                    {badge.label}
                                                </span>
                                            );
                                        })() : (
                                            <span className={`games-result games-result-${String(game.result || "unknown")}`}>
                                                {renderResultLabel(game)}
                                            </span>
                                        )}
                                    </div>

                                    <p className="games-meta-line">
                                        {game.mode} · {game.status === "abandoned" ? "Not finished" : game.status}
                                    </p>

                                    <div className="games-stats-grid">
                                        {isStreak ? (
                                            <p><strong>Streak:</strong> {Number(game.score) || 0}</p>
                                        ) : (
                                            <p><strong>Score:</strong> {Number(game.score || 0).toLocaleString()}</p>
                                        )}
                                        <p><strong>Rounds:</strong> {Number(game.total_rounds || 0)}</p>
                                        {game.mode === "multiplayer" && game.opponent_name ? (
                                            <p><strong>Opponent:</strong> {game.opponent_name}</p>
                                        ) : null}
                                        <p><strong>Played:</strong> {game.created_at ? new Date(game.created_at).toLocaleString() : "-"}</p>
                                    </div>
                                </article>
                            );
                        })}
                    </section>
                ) : null}

                {openGame ? (
                    <GameDetailsModal
                        game={openGame}
                        positions={openPositions}
                        loading={openLoading}
                        error={openError}
                        onClose={() => setOpenGame(null)}
                    />
                ) : null}
            </main>
        </div>
    );
};

const GameDetailsModal = ({ game, positions, loading, error, onClose }) => {
    const isStreak = game.mode === "country_streak";
    const streetViewUrl = (lat, lng, panoId) => {
        if (panoId) {
            return `https://www.google.com/maps/@?api=1&map_action=pano&pano=${encodeURIComponent(panoId)}`;
        }
        return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
    };
    const mapsUrl = (lat, lng) =>
        `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

    return (
        <div className="games-modal-backdrop" onClick={onClose}>
            <div className="games-modal" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="games-modal-close" onClick={onClose} aria-label="Close">×</button>
                <h2>{isStreak ? "🏳️ Country Streak" : (game.map_name || `Map #${game.map_id}`)}</h2>
                <p className="games-modal-meta">
                    {isStreak
                        ? <>Streak <strong>{Number(game.score) || 0}</strong> · {game.total_rounds} round{game.total_rounds === 1 ? "" : "s"}</>
                        : <>Score <strong>{Number(game.score || 0).toLocaleString()}</strong> · {game.total_rounds} round{game.total_rounds === 1 ? "" : "s"}</>}
                    {" · "}{game.created_at ? new Date(game.created_at).toLocaleString() : ""}
                </p>

                {loading ? <p className="games-empty">Loading locations…</p> : null}
                {error ? <p className="games-error">{error}</p> : null}

                {!loading && !error && positions.length === 0 ? (
                    <p className="games-empty">No locations recorded.</p>
                ) : null}

                {!loading && positions.length > 0 ? (
                    <ul className="games-positions">
                        {positions.map((p, i) => {
                            const lat = Number(p.lat ?? p.latitude);
                            const lng = Number(p.lng ?? p.longitude);
                            const panoId = p.panorama_id || p.pano_id || null;
                            return (
                                <li key={p.map_position_id || i} className="games-position">
                                    <div className="games-position-info">
                                        <span className="games-position-index">#{i + 1}</span>
                                        <div>
                                            <p className="games-position-note">{p.note || "—"}</p>
                                            <p className="games-position-coords">
                                                {Number.isFinite(lat) ? lat.toFixed(4) : "?"}, {Number.isFinite(lng) ? lng.toFixed(4) : "?"}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="games-position-actions">
                                        <a
                                            href={streetViewUrl(lat, lng, panoId)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="games-position-link"
                                        >
                                            Street View
                                        </a>
                                        <a
                                            href={mapsUrl(lat, lng)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="games-position-link games-position-link-secondary"
                                        >
                                            Map
                                        </a>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                ) : null}
            </div>
        </div>
    );
};

export default GamesPage;
