import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../../components/Header/Header";
import PlayMapModal from "../../components/PlayMapModal/PlayMapModal";
import { useAuth } from "../../context/AuthContext";
import "./CommunityMapsPage.css";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000/api/maps";

const CommunityMapsPage = () => {
    const navigate = useNavigate();
    const { token, isLoggedIn } = useAuth();

    const [maps, setMaps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState("plays");
    const [selectedMap, setSelectedMap] = useState(null);

    useEffect(() => {
        if (!isLoggedIn) {
            navigate("/login");
        }
    }, [isLoggedIn, navigate]);

    useEffect(() => {
        let isCancelled = false;

        const loadMaps = async () => {
            if (!token) return;

            try {
                setLoading(true);
                setLoadError("");
                const response = await fetch(`${API_BASE_URL}/maps/list`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                const responseBody = await response.json().catch(() => []);
                if (!response.ok) {
                    throw new Error(responseBody?.error || "Failed to load community maps");
                }

                if (!isCancelled) {
                    const publicMaps = Array.isArray(responseBody)
                        ? responseBody.filter((map) => Boolean(map.is_public))
                        : [];
                    setMaps(publicMaps);
                }
            } catch (error) {
                if (!isCancelled) {
                    setMaps([]);
                    setLoadError(error.message || "Failed to load community maps");
                }
            } finally {
                if (!isCancelled) {
                    setLoading(false);
                }
            }
        };

        loadMaps();

        return () => {
            isCancelled = true;
        };
    }, [token]);

    const visibleMaps = useMemo(() => {
        const query = search.trim().toLowerCase();
        const filtered = query
            ? maps.filter((map) => {
                const name = String(map.name || "").toLowerCase();
                const description = String(map.description || "").toLowerCase();
                return name.includes(query) || description.includes(query);
            })
            : maps;

        const sorted = [...filtered];
        if (sort === "plays") {
            sorted.sort((a, b) => Number(b.plays_count || 0) - Number(a.plays_count || 0));
        } else if (sort === "name") {
            sorted.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
        } else if (sort === "positions") {
            sorted.sort((a, b) => Number(b.positions_count || 0) - Number(a.positions_count || 0));
        }

        return sorted;
    }, [maps, search, sort]);

    return (
        <div className="community-maps-page">
            <Header />

            <main className="community-content">
                <section className="community-hero">
                    <h1>Community Maps</h1>
                    <p>Browse every public map and jump into one you like.</p>
                </section>

                <section className="community-controls">
                    <input
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search maps"
                        className="community-search"
                    />
                    <select
                        value={sort}
                        onChange={(event) => setSort(event.target.value)}
                        className="community-sort"
                    >
                        <option value="plays">Most played</option>
                        <option value="name">Name</option>
                        <option value="positions">Most locations</option>
                    </select>
                </section>

                {loadError ? <p className="community-error">{loadError}</p> : null}

                <section className="community-list">
                    {loading ? (
                        <article className="community-card community-card-empty">
                            <h3>Loading community maps</h3>
                            <p>Please wait...</p>
                        </article>
                    ) : null}

                    {!loading && visibleMaps.length === 0 ? (
                        <article className="community-card community-card-empty">
                            <h3>No public maps yet</h3>
                            <p>
                                {search.trim()
                                    ? "No maps match your search."
                                    : "Be the first to publish one from your Home page."}
                            </p>
                        </article>
                    ) : null}

                    {!loading
                        ? visibleMaps.map((map) => (
                            <article
                                key={`community-map-${map.map_id}`}
                                className="community-card"
                                onClick={() => setSelectedMap(map)}
                            >
                                <div className="community-card-head">
                                    <h3>{map.name || "Untitled map"}</h3>
                                    <span className="community-badge">{Number(map.plays_count || 0)} plays</span>
                                </div>
                                {map.description ? (
                                    <p className="community-description">{map.description}</p>
                                ) : (
                                    <p className="community-description community-description-muted">No description provided.</p>
                                )}
                                <div className="community-card-foot">
                                    <span>{Number(map.positions_count || 0)} locations</span>
                                    <button
                                        type="button"
                                        className="community-play"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setSelectedMap(map);
                                        }}
                                    >
                                        Play
                                    </button>
                                </div>
                            </article>
                        ))
                        : null}
                </section>
            </main>

            {selectedMap ? (
                <PlayMapModal map={selectedMap} onClose={() => setSelectedMap(null)} />
            ) : null}
        </div>
    );
};

export default CommunityMapsPage;
