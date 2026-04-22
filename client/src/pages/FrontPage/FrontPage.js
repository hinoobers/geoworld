// Front page, when user is already logged in

import Header from "../../components/Header/Header";
import { useAuth } from "../../context/AuthContext";
import "./FrontPage.css";

const FrontPage = () => {
    const { user } = useAuth();
    const username = user?.username || user?.email?.split("@")[0] || "Explorer";

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
                        <button type="button" className="primary-action">Play Daily Challenge</button>
                        <button type="button" className="ghost-action">Browse Community Maps</button>
                    </div>
                </section>

                <section className="stats-grid">
                    <article className="stat-card">
                        <span>Win Streak</span>
                        <h2>5</h2>
                        <p>games in a row</p>
                    </article>
                    <article className="stat-card">
                        <span>Games Played</span>
                        <h2>10</h2>
                        <p>this week</p>
                    </article>
                    <article className="stat-card">
                        <span>Accuracy</span>
                        <h2>80%</h2>
                        <p>average distance score</p>
                    </article>
                </section>

                <section className="map-sections">
                    <div className="map-panel">
                        <div className="panel-head">
                            <h3>Popular Maps</h3>
                            <button type="button">View all</button>
                        </div>
                        <div className="map-list">
                            <article className="map-card map-card-a">
                                <h4>Capital Sprint</h4>
                                <p>15,200 plays</p>
                            </article>
                            <article className="map-card map-card-b">
                                <h4>Hidden Europe</h4>
                                <p>8,730 plays</p>
                            </article>
                        </div>
                    </div>

                    <div className="map-panel">
                        <div className="panel-head">
                            <h3>Your Maps</h3>
                            <button type="button">Create new map</button>
                        </div>
                        <div className="map-list">
                            <article className="map-card map-card-c">
                                <h4>Street Corners</h4>
                                <p>Draft · 12 locations</p>
                            </article>
                            <article className="map-card map-card-d">
                                <h4>Food Districts</h4>
                                <p>Published · 29 locations</p>
                            </article>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}

export default FrontPage;