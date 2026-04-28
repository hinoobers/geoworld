import { useEffect, useState } from "react";
import Header from "../../components/Header/Header";
import { useAuth } from "../../context/AuthContext";
import "./LeaderboardPage.css";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000/api";

const TABS = [
    { id: "global", label: "Global Rating" },
    { id: "country-streak", label: "Country Streak" },
];

const LeaderboardPage = () => {
    const { token, user } = useAuth();
    const [tab, setTab] = useState("global");
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                setError("");
                setEntries([]);
                const path = tab === "country-streak"
                    ? "/games/country-streak/leaderboard"
                    : "/users/leaderboard";
                const res = await fetch(`${API_BASE_URL}${path}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const body = await res.json().catch(() => []);
                if (!res.ok) throw new Error(body?.error || "Failed to load leaderboard");
                if (!cancelled) setEntries(Array.isArray(body) ? body : []);
            } catch (err) {
                if (!cancelled) setError(err.message || "Failed to load");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [token, tab]);

    const isStreak = tab === "country-streak";

    return (
        <div className="page">
            <Header />
            <main className="lb-page">
                <section className="lb-hero">
                    <h1>{isStreak ? "Country Streak Leaderboard" : "Global Leaderboard"}</h1>
                    <p>
                        {isStreak
                            ? "Top country-streak runs."
                            : "Play and guess accurately to level up your rating and climb the ranks!"}
                    </p>
                </section>

                <div className="lb-tabs">
                    {TABS.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            className={`lb-tab ${tab === t.id ? "is-active" : ""}`}
                            onClick={() => { setEntries([]); setTab(t.id); }}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {error ? <p className="lb-error">{error}</p> : null}
                {loading ? <p className="lb-empty">Loading…</p> : null}

                {!loading && !error && entries.length === 0 ? (
                    <p className="lb-empty">No completed games yet.</p>
                ) : null}

                {!loading && entries.length > 0 ? (
                    <div className="lb-table-wrap">
                        <table className="lb-table">
                            <thead>
                                {isStreak ? (
                                    <tr>
                                        <th>#</th>
                                        <th>Player</th>
                                        <th>Best Streak</th>
                                    </tr>
                                ) : (
                                    <tr>
                                        <th>#</th>
                                        <th>Player</th>
                                        <th>Rating</th>
                                        <th>Accuracy</th>
                                        <th>Games</th>
                                    </tr>
                                )}
                            </thead>
                            <tbody>
                                {entries
                                    .filter((entry) => isStreak
                                        ? entry.best_streak !== undefined
                                        : entry.rating !== undefined)
                                    .map((entry, i) => (
                                    <tr
                                        key={entry.user_id}
                                        className={Number(entry.user_id) === Number(user?.id) ? "lb-me" : ""}
                                    >
                                        <td>{i + 1}</td>
                                        <td>{entry.username}</td>
                                        {isStreak ? (
                                            <td>{entry.best_streak}</td>
                                        ) : (
                                            <>
                                                <td>{Number(entry.rating || 0).toFixed(1)}%</td>
                                                <td>{Number(entry.accuracy || 0).toFixed(1)}%</td>
                                                <td>{entry.games_played}</td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : null}
            </main>
        </div>
    );
};

export default LeaderboardPage;
