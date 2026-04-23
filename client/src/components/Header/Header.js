import { useNavigate } from "react-router-dom";
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
    const { isLoggedIn, user, logout } = useAuth();

    const handleAuthAction = () => {
        if (isLoggedIn) {
            logout();
            navigate("/");
            return;
        }

        navigate("/login");
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
                        <div className="geo-header-section" onClick={() => navigate("/community")}>Maps</div>
                        <div className="geo-header-section" onClick={() => navigate("/games")}>Games</div>
                        <button type="button" onClick={handleAuthAction}>
                            Log out
                        </button>
                    </>
                ) : (
                    <button type="button" onClick={handleAuthAction}>
                        Log in
                    </button>
                )}
            </div>
        </div>
    );
};

export default Header;