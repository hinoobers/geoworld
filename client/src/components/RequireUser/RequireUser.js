import { Navigate, useLocation } from "react-router-dom";
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

const RequireUser = ({ children }) => {
    const { isLoggedIn } = useAuth();
    const location = useLocation();

    if (isLoggedIn) return children;

    if (hasGuestIdentity()) {
        return <Navigate to="/" replace />;
    }

    const redirectTarget = `${location.pathname}${location.search}` || "/home";
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirectTarget)}`} replace />;
};

export default RequireUser;
