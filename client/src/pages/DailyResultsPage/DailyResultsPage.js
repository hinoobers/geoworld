import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../../components/Header/Header";
import { useAuth } from "../../context/AuthContext";
import "./DailyResultsPage.css";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000/api";

const DailyResultsPage = () => {
    const navigate = useNavigate();
    const { token, isLoggedIn } = useAuth();

    const [leaderboard, setLeaderboard] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!isLoggedIn) {
            navigate("/login");
        }
    }, [isLoggedIn, navigate]);

    useEffect(() => {
        if (!token) return;

        let isCancelled = false;

        const loadLeaderboard = async () => {
            try {
                setLoading(true);
                setError("");
                const response = await fetch(`${API_BASE_URL}/games/daily-leaderboard`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const responseBody = await response.json().catch(() => null);

                if (response.status === 403) {
                    if (!isCancelled) {
                        setError("Play today's daily challenge first to view results.");
                    }
                    return;
                }

                if (!response.ok) {
                    throw new Error(responseBody?.error || "Failed to load leaderboard");
                }

                if (!isCancelled) setLeaderboard(responseBody);
            } catch (nextError) {
                if (!isCancelled) setError(nextError.message || "Failed to load leaderboard");
            } finally {
                if (!isCancelled) setLoading(false);
            }
        };

        loadLeaderboard();

        return () => {
            isCancelled = true;
        };
    }, [token]);

    return (
        <div className="daily-results-page">
            <Header />

            <main className="daily-results-content">
                <section className="daily-results-hero">
                    <h1>Daily Challenge Results</h1>
                    {leaderboard?.map_name ? (
                        <p>Today's map: <strong>{leaderboard.map_name}</strong></p>
                    ) : (
                        <p>See how your score stacks up against everyone else today.</p>
                    )}
                    <div className="daily-results-actions">
                        <button type="button" onClick={() => navigate("/home")}>Back to Home</button>
                        {leaderboard?.map_id ? (
                            <button
                                type="button"
                                className="daily-results-play"
                                onClick={() => navigate(`/play?map=${encodeURIComponent(String(leaderboard.map_id))}`)}
                            >
                                Play this map again
                            </button>
                        ) : null}
                    </div>
                </section>

                {loading ? <p className="daily-results-empty">Loading leaderboard...</p> : null}
                {error ? <p className="daily-results-error">{error}</p> : null}

                {!loading && !error && leaderboard ? (
                    (leaderboard.entries?.length ?? 0) === 0 ? (
                        <p className="daily-results-empty">
                            No one has completed today's daily yet. Finish your round to land on the board!
                        </p>
                    ) : (
                        <ol className="leaderboard-list">
                            {leaderboard.entries.map((entry, index) => (
                                <li
                                    key={`leaderboard-${entry.user_id}`}
                                    className={`leaderboard-row ${entry.is_me ? "leaderboard-row-me" : ""}`}
                                >
                                    <span className="leaderboard-rank">#{index + 1}</span>
                                    <span className="leaderboard-name">
                                        {entry.username}{entry.is_me ? " (you)" : ""}
                                    </span>
                                    <span className="leaderboard-score">{entry.score.toLocaleString()} pts</span>
                                </li>
                            ))}
                        </ol>
                    )
                ) : null}
            </main>
        </div>
    );
};

export default DailyResultsPage;
