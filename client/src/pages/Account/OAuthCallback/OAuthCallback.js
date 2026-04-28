import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";

const OAuthCallback = () => {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const { setToken } = useAuth();

    useEffect(() => {
        const token = params.get("token");
        if (!token) {
            navigate("/login?message=" + encodeURIComponent("OAuth login failed"), { replace: true });
            return;
        }
        setToken(token);
        navigate("/home", { replace: true });
    }, [params, setToken, navigate]);

    return (
        <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", color: "#f5f6ff" }}>
            <p>Signing you in…</p>
        </div>
    );
};

export default OAuthCallback;
