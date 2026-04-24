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
                        {visibleGames.map((game) => (
                            <article className="games-card" key={`game-${game.game_id}`}>
                                <div className="games-card-head">
                                    <h3>{game.map_name || `Map #${game.map_id}`}</h3>
                                    <span className={`games-result games-result-${String(game.result || "unknown")}`}>
                                        {renderResultLabel(game)}
                                    </span>
                                </div>

                                <p className="games-meta-line">
                                    {game.mode} · {game.status === "abandoned" ? "Not finished" : game.status}
                                </p>

                                <div className="games-stats-grid">
                                    <p><strong>Score:</strong> {Number(game.score || 0).toLocaleString()}</p>
                                    <p><strong>Rounds:</strong> {Number(game.total_rounds || 0)}</p>
                                    {game.mode === "multiplayer" && game.opponent_name ? (
                                        <p><strong>Opponent:</strong> {game.opponent_name}</p>
                                    ) : null}
                                    <p><strong>Played:</strong> {game.created_at ? new Date(game.created_at).toLocaleString() : "-"}</p>
                                </div>
                            </article>
                        ))}
                    </section>
                ) : null}
            </main>
        </div>
    );
};

export default GamesPage;
