import { useLocation, useNavigate } from "react-router-dom";
import "./Header.css";
import { useAuth } from "../../context/AuthContext";

const GUEST_STORAGE_KEY = "geoworld-guest";

function hasGuestIdentity() {
    try {
        const raw = localStorage.getItem(GUEST_STORAGE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return Boolean(parsed?.token);
    } catch {
        return false;
    }
}

const Header = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { isLoggedIn, user, logout, isAdmin } = useAuth();

    const onLoginPage = location.pathname.startsWith("/login");
    const guestLabel = onLoginPage ? "Sign up" : "Log in";
    const guestTarget = onLoginPage ? "/signup" : "/login";

    const handleAuthAction = () => {
        if (isLoggedIn) {
            logout();
            navigate("/");
            return;
        }
        navigate(guestTarget);
    };

    return (
        <div className="geo-header">
            <h1 onClick={() => {
                if (isLoggedIn) {
                    navigate("/home");
                } else if (hasGuestIdentity()) {
                    navigate("/");
                } else {
                    navigate("/");
                }
            }}>GeoWorld</h1>
            <div className="geo-header-actions">
                {isLoggedIn ? (
                    <>
                        <div className="geo-header-section" onClick={() => navigate("/leaderboard")}>Leaderboard</div>
                        <div className="geo-header-section" onClick={() => navigate("/community")}>Maps</div>
                        <div className="geo-header-section" onClick={() => navigate("/games")}>Games</div>
                        <div className="geo-header-section" onClick={() => navigate("/account-settings")}>Account</div>
                        <div className="geo-header-section" onClick={() => navigate("/faq")}>FAQ</div>
                        {isAdmin && (
                            <div className="geo-header-section" onClick={() => navigate("/admin")}>Admin</div>
                        )}
                        <button type="button" onClick={handleAuthAction}>
                            Log out
                        </button>
                    </>
                ) : (
                    <>
                        <div className="geo-header-section" onClick={() => navigate("/faq")}>FAQ</div>
                        <button type="button" onClick={handleAuthAction}>
                            {guestLabel}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default Header;