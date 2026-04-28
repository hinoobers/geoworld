import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Header from "../../../components/Header/Header";
import { useAuth } from "../../../context/AuthContext";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000/api";

const VerifyEmail = () => {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { setToken } = useAuth();
    const [status, setStatus] = useState("loading");
    const [error, setError] = useState("");

    useEffect(() => {
        const token = params.get("token");
        if (!token) {
            setStatus("error");
            setError("Missing verification token");
            return;
        }
        (async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/users/verify-email`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token }),
                });
                const body = await res.json().catch(() => null);
                if (!res.ok) throw new Error(body?.error || "Verification failed");
                if (body?.token) setToken(body.token);
                setStatus("ok");
                setTimeout(() => navigate("/home", { replace: true }), 1500);
            } catch (err) {
                setStatus("error");
                setError(err.message || "Verification failed");
            }
        })();
    }, [params, setToken, navigate]);

    return (
        <div className="page">
            <Header />
            <div className="content">
                <div style={{ maxWidth: 480, margin: "60px auto", textAlign: "center", color: "#f5f6ff" }}>
                    <h1>Email verification</h1>
                    {status === "loading" ? <p>Verifying…</p> : null}
                    {status === "ok" ? <p>✅ Email verified! Redirecting…</p> : null}
                    {status === "error" ? (
                        <>
                            <p style={{ color: "#ff9aa2" }}>❌ {error}</p>
                            <p><Link to="/login">Back to login</Link></p>
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

export default VerifyEmail;
