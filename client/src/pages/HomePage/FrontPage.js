// Front page, when user is already logged in

import { useEffect, useState } from "react";
import Header from "../../components/Header/Header";
import PlayMapModal from "../../components/PlayMapModal/PlayMapModal";
import EditMapModal from "../../components/EditMapModal/EditMapModal";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import "./FrontPage.css";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000/api";

const FrontPage = () => {
    const { user, token } = useAuth();
    const navigate = useNavigate();
    const username = user?.username || user?.email?.split("@")[0] || "Explorer";
    const [allMaps, setAllMaps] = useState([]);
    const [myMaps, setMyMaps] = useState([]);
    const [mapsLoading, setMapsLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [statsLoading, setStatsLoading] = useState(true);
    const [dailyError, setDailyError] = useState("");
    const [dailyLoading, setDailyLoading] = useState(false);
    const [dailyInfo, setDailyInfo] = useState(null);
    const [selectedMap, setSelectedMap] = useState(null);
    const [editingMap, setEditingMap] = useState(null);
    const [myMapsPage, setMyMapsPage] = useState(1);
    const MY_MAPS_PER_PAGE = 5;

    useEffect(() => {
        let isCancelled = false;

        const loadMaps = async () => {
            if (!token || !user?.id) {
                if (!isCancelled) {
                    setMyMaps([]);
                    setMapsLoading(false);
                }
                return;
            }

            try {
                setMapsLoading(true);
                const response = await fetch(`${API_BASE_URL}/maps/list`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                const responseBody = await response.json().catch(() => []);
                if (!response.ok) {
                    throw new Error(responseBody?.error || "Failed to load maps");
                }

                const currentUserId = String(user.id);
                const visibleMaps = Array.isArray(responseBody)
                    ? responseBody.filter((map) => String(map.user_id ?? map.created_by ?? "") === currentUserId)
                    : [];
                const popularMaps = Array.isArray(responseBody)
                    ? responseBody
                        .filter((map) => Boolean(map.is_public) || Boolean(map.is_forced_popular))
                        .sort((a, b) => {
                            const forcedDiff = Number(b.is_forced_popular || 0) - Number(a.is_forced_popular || 0);
                            if (forcedDiff !== 0) return forcedDiff;
                            return Number(b.plays_count || 0) - Number(a.plays_count || 0);
                        })
                    : [];

                if (!isCancelled) {
                    setAllMaps(popularMaps);
                    setMyMaps(visibleMaps);
                }
            } catch {
                if (!isCancelled) {
                    setAllMaps([]);
                    setMyMaps([]);
                }
            } finally {
                if (!isCancelled) {
                    setMapsLoading(false);
                }
            }
        };

        const loadStats = async () => {
            if (!token) {
                if (!isCancelled) {
                    setStats(null);
                    setStatsLoading(false);
                }
                return;
            }

            try {
                setStatsLoading(true);
                const response = await fetch(`${API_BASE_URL}/users/me/stats`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                const responseBody = await response.json().catch(() => null);
                if (!response.ok) {
                    throw new Error(responseBody?.error || "Failed to load stats");
                }

                if (!isCancelled) {
                    setStats(responseBody);
                }
            } catch {
                if (!isCancelled) {
                    setStats(null);
                }
            } finally {
                if (!isCancelled) {
                    setStatsLoading(false);
                }
            }
        };

        const loadDailyInfo = async () => {
            if (!token) {
                if (!isCancelled) setDailyInfo(null);
                return;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/games/daily-challenge`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const responseBody = await response.json().catch(() => null);
                if (!response.ok) throw new Error(responseBody?.error || "Failed to load daily");

                if (!isCancelled) setDailyInfo(responseBody);
            } catch {
                if (!isCancelled) setDailyInfo(null);
            }
        };

        loadMaps();
        loadStats();
        loadDailyInfo();

        return () => {
            isCancelled = true;
        };
    }, [token, user?.id]);

    const handleDailyButton = async () => {
        if (!token || dailyLoading) return;

        if (dailyInfo?.already_played) {
            navigate("/daily-results");
            return;
        }

        setDailyError("");
        setDailyLoading(true);

        try {
            const response = await fetch(`${API_BASE_URL}/games/daily-challenge`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const responseBody = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(responseBody?.error || "Failed to load daily challenge");
            }

            const createRes = await fetch(`${API_BASE_URL}/games/create-game`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    map_id: Number(responseBody.map_id),
                    mode: "singleplayer",
                    allow_move: false,
                    allow_zoom: true,
                    allow_look: true,
                }),
            });
            const createBody = await createRes.json().catch(() => null);
            if (!createRes.ok) throw new Error(createBody?.error || "Failed to start daily");
            navigate(`/play?game=${encodeURIComponent(createBody.game_id)}`);
        } catch (error) {
            setDailyError(error.message || "Failed to start daily challenge");
        } finally {
            setDailyLoading(false);
        }
    };

    return (
        <div className="front-page">
            <Header />

            <main className="front-content">
                <section className="front-hero">
                    <h1>Welcome back, {username}.</h1>
                    <p>
                        Ready for your next challenge? Pick a map, keep your streak alive,
                        and climb your ranking.
                    </p>
                    <div className="hero-actions">
                        <button
                            type="button"
                            className="primary-action"
                            onClick={handleDailyButton}
                            disabled={dailyLoading}
                        >
                            {dailyLoading
                                ? "Loading..."
                                : dailyInfo?.already_played
                                    ? "Today's Results"
                                    : "Play Daily Challenge"}
                        </button>
                        <button type="button" className="ghost-action" onClick={() => navigate("/community")}>Browse Community Maps</button>
                    </div>
                    {dailyError ? <p className="daily-message daily-message-error">{dailyError}</p> : null}
                </section>

                <section className="stats-grid">
                    <article className="stat-card">
                        <span>Win Streak</span>
                        <h2>{statsLoading ? "-" : stats?.win_streak ?? 0}</h2>
                        <p>multiplayer wins in a row</p>
                    </article>
                    <article className="stat-card">
                        <span>Games Played</span>
                        <h2>{statsLoading ? "-" : stats?.games_played_this_week ?? 0}</h2>
                        <p>this week</p>
                    </article>
                    <article className="stat-card">
                        <span>Accuracy</span>
                        <h2>{statsLoading ? "-" : `${stats?.accuracy ?? 0}%`}</h2>
                        <p>average score</p>
                    </article>
                </section>

                <section className="gamemodes-section">
                    <div className="panel-head">
                        <h3>Gamemodes</h3>
                    </div>
                    <div className="gamemodes-grid">
                        <article
                            className="gamemode-card gamemode-streak"
                            onClick={() => navigate("/country-streak")}
                        >
                            <span className="gamemode-icon">🏳️</span>
                            <h4>Country Streak</h4>
                            <p>Guess the country. One wrong guess ends your streak.</p>
                        </article>
                    </div>
                </section>

                <section className="map-sections">
                    <div className="map-panel">
                        <div className="panel-head">
                            <h3>Popular Maps</h3>
                            <button type="button" onClick={() => navigate("/community")}>View all</button>
                        </div>
                        <div className="map-list">
                            <article
                                className="map-card map-card-worldwide map-card-clickable"
                                key="popular-map-worldwide"
                                onClick={() => setSelectedMap({
                                    map_id: "worldwide",
                                    name: "Worldwide",
                                    description: "5 random Street View locations from around the world.",
                                    is_worldwide: true,
                                })}
                            >
                                <h4>🌍 Worldwide</h4>
                                <p>Random Street View, anywhere</p>
                            </article>
                            {allMaps.slice(0, 4).map((map, index) => (
                                <article
                                    className={`map-card ${index % 2 === 0 ? "map-card-a" : "map-card-b"} map-card-clickable`}
                                    key={`popular-map-${map.map_id}`}
                                    onClick={() => setSelectedMap(map)}
                                >
                                    <h4>{map.name || "Untitled map"}</h4>
                                    <p>{Number(map.plays_count || 0)} plays</p>
                                </article>
                            ))}
                            {!mapsLoading && allMaps.length === 0 ? (
                                <article className="map-card map-card-empty">
                                    <h4>No maps available</h4>
                                    <p>Create a map to get started.</p>
                                </article>
                            ) : null}
                            {mapsLoading ? (
                                <article className="map-card map-card-empty">
                                    <h4>Loading popular maps</h4>
                                    <p>Please wait...</p>
                                </article>
                            ) : null}
                        </div>
                    </div>

                    <div className="map-panel">
                        <div className="panel-head">
                            <h3>Your Maps</h3>
                            <button type="button" onClick={() => navigate("/maps/create")}>Create new map</button>
                        </div>
                        <div className="map-list">
                            {myMaps
                                .slice((myMapsPage - 1) * MY_MAPS_PER_PAGE, myMapsPage * MY_MAPS_PER_PAGE)
                                .map((map) => (
                                <article
                                    className="map-card map-card-c map-card-clickable"
                                    key={`my-map-${map.map_id}`}
                                    onClick={() => setSelectedMap(map)}
                                >
                                    <button
                                        type="button"
                                        className={`visibility-toggle ${map.is_public ? "is-public" : "is-private"}`}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setEditingMap(map);
                                        }}
                                    >
                                        Edit · {map.is_public ? "Public" : "Private"}
                                    </button>
                                    <h4>{map.name || "Untitled map"}</h4>
                                    <p>{Number(map.positions_count || 0)} locations</p>
                                </article>
                            ))}
                            {!mapsLoading && myMaps.length === 0 ? (
                                <article className="map-card map-card-empty">
                                    <h4>No maps yet</h4>
                                    <p>Create your first map to see it here.</p>
                                </article>
                            ) : null}
                            {mapsLoading ? (
                                <article className="map-card map-card-empty">
                                    <h4>Loading your maps</h4>
                                    <p>Please wait...</p>
                                </article>
                            ) : null}
                        </div>

                        {myMaps.length > MY_MAPS_PER_PAGE ? (
                            <div className="map-panel-pagination">
                                <button
                                    type="button"
                                    onClick={() => setMyMapsPage((p) => Math.max(1, p - 1))}
                                    disabled={myMapsPage <= 1}
                                >
                                    Prev
                                </button>
                                <span>
                                    Page {myMapsPage} / {Math.max(1, Math.ceil(myMaps.length / MY_MAPS_PER_PAGE))}
                                </span>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setMyMapsPage((p) =>
                                            Math.min(Math.ceil(myMaps.length / MY_MAPS_PER_PAGE), p + 1)
                                        )
                                    }
                                    disabled={myMapsPage >= Math.ceil(myMaps.length / MY_MAPS_PER_PAGE)}
                                >
                                    Next
                                </button>
                            </div>
                        ) : null}
                    </div>
                </section>
            </main>

            {selectedMap ? (
                <PlayMapModal map={selectedMap} onClose={() => setSelectedMap(null)} />
            ) : null}

            {editingMap ? (
                <EditMapModal
                    map={editingMap}
                    onClose={() => setEditingMap(null)}
                    onDeleted={(mapId) => {
                        setMyMaps((list) => list.filter((m) => m.map_id !== mapId));
                        setAllMaps((list) => list.filter((m) => m.map_id !== mapId));
                    }}
                    onSaved={(updated) => {
                        setMyMaps((list) =>
                            list.map((m) => (m.map_id === updated.map_id ? { ...m, ...updated } : m))
                        );
                        setAllMaps((list) => {
                            const without = list.filter((m) => m.map_id !== updated.map_id);
                            if (!updated.is_public) return without;
                            return [...without, updated].sort(
                                (a, b) => Number(b.plays_count || 0) - Number(a.plays_count || 0)
                            );
                        });
                    }}
                />
            ) : null}
        </div>
    );
}

export default FrontPage;