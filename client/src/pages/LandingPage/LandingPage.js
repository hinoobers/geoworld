import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "../../components/Header/Header";
import { useAuth } from "../../context/AuthContext";
import "./LandingPage.css";

const LANDING_REDIRECT_KEY = "geoworld-landing-redirected-at";
const REDIRECT_GRACE_MS = 10_000;

const STATS_API_URL = (process.env.REACT_APP_API_URL || "http://localhost:3000/api") + "/stats";

const LandingPage = () => {
    let navigate = useNavigate();
    const { isLoggedIn } = useAuth();
    const [stats, setStats] = useState(null);

    useEffect(() => {
        if (!isLoggedIn) return;

        const lastRedirect = Number(sessionStorage.getItem(LANDING_REDIRECT_KEY)) || 0;
        if (Date.now() - lastRedirect < REDIRECT_GRACE_MS) return;

        sessionStorage.setItem(LANDING_REDIRECT_KEY, String(Date.now()));
        navigate("/home", { replace: true });
    }, [isLoggedIn, navigate]);

    useEffect(() => {
        let cancelled = false;
        fetch(STATS_API_URL)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (!cancelled && data) setStats(data);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div className="page">
            <Header />

            <div className="content">
                <div className="landing-page">
                    <h1>GeoWorld</h1>
                    <p>Where guess meets location</p>
                    <div className="buttons">
                        <button onClick={() => navigate("/login")}>Log in</button>
                        <button onClick={() => navigate("/signup")}>Create Account</button>
                        <button onClick={() => navigate("/demo")}>Play Demo</button>
                    </div>
                </div>

                <div className="landing-stats">
                    <div className="landing-stat">
                        <span className="landing-stat-value">
                            {stats ? stats.users.toLocaleString() : "—"}
                        </span>
                        <span className="landing-stat-label">Users</span>
                    </div>
                    <div className="landing-stat">
                        <span className="landing-stat-value">
                            {stats ? stats.games.toLocaleString() : "—"}
                        </span>
                        <span className="landing-stat-label">Games Played</span>
                    </div>
                    <div className="landing-stat">
                        <span className="landing-stat-value">
                            {stats ? stats.maps.toLocaleString() : "—"}
                        </span>
                        <span className="landing-stat-label">Maps</span>
                    </div>
                </div>
            </div>

            <footer className="landing-footer">
                <Link to="/privacy">Privacy Policy</Link>
                <span>·</span>
                <Link to="/terms">Terms of Service</Link>
            </footer>
        </div>
    );
};

export default LandingPage;

