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

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
            }}
            onClick={() => setOpen(false)}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: "#1f2233",
                    color: "#f5f6ff",
                    padding: "24px 28px",
                    borderRadius: 10,
                    maxWidth: 440,
                    width: "90%",
                    boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
                }}
            >
                <h2 style={{ marginTop: 0 }}>Verify your email</h2>
                <p>Please verify your email address before playing. Check your inbox for the verification link.</p>
                {message ? <p style={{ color: "#9af0a8" }}>{message}</p> : null}
                {error ? <p style={{ color: "#ff9aa2" }}>{error}</p> : null}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
                    <button type="button" onClick={() => setOpen(false)} disabled={sending}>
                        Close
                    </button>
                    <button type="button" onClick={handleResend} disabled={sending}>
                        {sending ? "Sending..." : "Resend verification link"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VerifyEmailModal;
