import { useEffect, useState } from "react";
import Header from "../../components/Header/Header";
import { useAuth } from "../../context/AuthContext";
import "./LeaderboardPage.css";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000/api";

const LeaderboardPage = () => {
    const { token, user } = useAuth();
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const res = await fetch(`${API_BASE_URL}/users/leaderboard`, {
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
    }, [token]);

    return (
        <div className="page">
            <Header />
            <main className="lb-page">
                <section className="lb-hero">
                    <h1>Global Leaderboard</h1>
                    <p>
                        Ranked by adjusted accuracy — your score-per-round is smoothed with 20 dummy empty
                        rounds so a handful of perfect games can't outrank someone with a long proven history.
                    </p>
                </section>

                {error ? <p className="lb-error">{error}</p> : null}
                {loading ? <p className="lb-empty">Loading…</p> : null}

                {!loading && !error && entries.length === 0 ? (
                    <p className="lb-empty">No completed games yet.</p>
                ) : null}

                {!loading && entries.length > 0 ? (
                    <div className="lb-table-wrap">
                        <table className="lb-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Player</th>
                                    <th>Rating</th>
                                    <th>Accuracy</th>
                                    <th>Games</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map((entry, i) => (
                                    <tr
                                        key={entry.user_id}
                                        className={Number(entry.user_id) === Number(user?.id) ? "lb-me" : ""}
                                    >
                                        <td>{i + 1}</td>
                                        <td>{entry.username}</td>
                                        <td>{entry.rating.toFixed(1)}%</td>
                                        <td>{entry.accuracy.toFixed(1)}%</td>
                                        <td>{entry.games_played}</td>
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
