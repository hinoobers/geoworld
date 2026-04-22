import { useNavigate } from "react-router-dom";
import "./Header.css";
import { useAuth } from "../../context/AuthContext";

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
                if(isLoggedIn) {
                    navigate("/home");
                } else {
                    navigate("/");
                }
            }}>GeoWorld</h1>
            <div className="geo-header-actions">
                {isLoggedIn ? (
                    <>
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