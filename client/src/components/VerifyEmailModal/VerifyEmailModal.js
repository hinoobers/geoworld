import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000/api";

export const EMAIL_NOT_VERIFIED_EVENT = "geoworld:email-not-verified";

const VerifyEmailModal = () => {
    const { token } = useAuth();
    const [open, setOpen] = useState(false);
    const [sending, setSending] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        const onEvent = () => {
            setMessage("");
            setError("");
            setOpen(true);
        };
        window.addEventListener(EMAIL_NOT_VERIFIED_EVENT, onEvent);
        return () => window.removeEventListener(EMAIL_NOT_VERIFIED_EVENT, onEvent);
    }, []);

    if (!open) return null;

    const handleResend = async () => {
        if (!token) {
            setError("You must be logged in to resend.");
            return;
        }
        setSending(true);
        setMessage("");
        setError("");
        try {
            const res = await fetch(`${API_BASE_URL}/users/resend-verification`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || "Failed to resend");
            setMessage("Verification link sent. Check your inbox.");
        } catch (e) {
            setError(e.message || "Failed to resend");
        } finally {
            setSending(false);
        }
    };

    const primaryBtnStyle = {
        border: "none",
        borderRadius: 10,
        padding: "10px 16px",
        fontWeight: 700,
        cursor: sending ? "not-allowed" : "pointer",
        background: "linear-gradient(90deg, #2a9d8f 0%, #3a86ff 100%)",
        color: "#ffffff",
        opacity: sending ? 0.7 : 1,
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        boxShadow: "0 4px 14px rgba(58, 134, 255, 0.35)",
    };
    const secondaryBtnStyle = {
        border: "1px solid rgba(141, 180, 216, 0.45)",
        borderRadius: 10,
        padding: "10px 16px",
        fontWeight: 600,
        cursor: sending ? "not-allowed" : "pointer",
        background: "transparent",
        color: "#f5f9ff",
        opacity: sending ? 0.7 : 1,
        transition: "background 0.15s ease",
    };

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(2, 8, 14, 0.65)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
                padding: 16,
            }}
            onClick={() => setOpen(false)}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: "rgba(8, 18, 30, 0.96)",
                    border: "1px solid rgba(141, 180, 216, 0.35)",
                    color: "#f5f9ff",
                    padding: "24px 28px",
                    borderRadius: 16,
                    maxWidth: 440,
                    width: "100%",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
                }}
            >
                <h2 style={{ marginTop: 0, marginBottom: 10 }}>Verify your email</h2>
                <p style={{ margin: "7px 0", lineHeight: 1.5 }}>
                    Please verify your email address before playing. Check your inbox for the verification link.
                </p>
                {message ? <p style={{ color: "#9af0a8", margin: "7px 0" }}>{message}</p> : null}
                {error ? <p style={{ color: "#ff9aa2", margin: "7px 0" }}>{error}</p> : null}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
                    <button type="button" onClick={() => setOpen(false)} disabled={sending} style={secondaryBtnStyle}>
                        Close
                    </button>
                    <button type="button" onClick={handleResend} disabled={sending} style={primaryBtnStyle}>
                        {sending ? "Sending..." : "Resend verification link"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VerifyEmailModal;
