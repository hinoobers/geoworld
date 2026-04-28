import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "../../../components/Header/Header";
import { useAuth } from "../../../context/AuthContext";
import "./Login.css";

function GoogleIcon() {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
    );
}

function DiscordIcon() {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515a.074.074 0 00-.079.037c-.211.375-.445.864-.607 1.25a18.27 18.27 0 00-5.487 0c-.162-.386-.395-.875-.607-1.25a.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03a.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.042-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128c.125-.093.25-.19.371-.287a.075.075 0 01.078-.01c3.928 1.793 8.18 1.793 12.062 0a.075.075 0 01.079.009c.12.098.246.195.371.288a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.076.076 0 00-.041.107c.352.699.764 1.365 1.225 1.994a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.057c.5-4.506-.838-8.962-3.551-12.662a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-.965-2.157-2.156c0-1.193.93-2.157 2.157-2.157c1.226 0 2.157.964 2.157 2.157c0 1.19-.93 2.155-2.157 2.155zm7.975 0c-1.183 0-2.157-.965-2.157-2.156c0-1.193.93-2.157 2.157-2.157c1.226 0 2.157.964 2.157 2.157c0 1.19-.931 2.155-2.157 2.155z" fill="white"/>
        </svg>
    );
}

function safeRedirectTarget(raw) {
    if (!raw || typeof raw !== "string") return "/home";
    if (!raw.startsWith("/") || raw.startsWith("//")) return "/home";
    return raw;
}

const Login = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { login } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const redirectTo = safeRedirectTarget(searchParams.get("redirect"));
    const message = searchParams.get("message");

    useEffect(() => {
        const flash = sessionStorage.getItem("geoworld-auth-flash");
        if (flash) {
            setError(flash);
            sessionStorage.removeItem("geoworld-auth-flash");
            return;
        }
        if (message) {
            setError(message);
        }
    }, [message]);

    const handleSubmit = async (event) => {
        event.preventDefault();

        setError("");

        try {
            await login({ email, password });
            navigate(redirectTo);
        } catch (error) {
            setError(error.message);
        }
    };

    const handleReset = async () => {
        if(email.trim() === "") {
            setError("Please enter your email to reset your password.");
            return;
        }

        // send password reset request to server
        const apiUrl = (process.env.REACT_APP_API_URL + "/users/reset-password");
        fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email })
        })
        .then((response) => response.json())
        .then((data) => {
            if (data.message) {
                setError(data.message);
            } else {
                setError("If an account with that email exists, a password reset link has been sent.");
            }
        })
        .catch((error) => {
            console.error("Failed to send password reset request", error);
            setError("Failed to send password reset request. Please try again.");
        });
    };

    return (
        <div className="page">
            <Header />

            <div className="content">
                <div className="login-page">
                    <h1>Log in</h1>
                    <p>Welcome back to GeoWorld</p>

                    <form className="login-form" onSubmit={handleSubmit}>
                        <label htmlFor="email">Email</label>
                        <input
                            type="email"
                            id="email"
                            placeholder="Email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                        />

                        <label htmlFor="password">Password</label>
                        <input
                            type="password"
                            id="password"
                            placeholder="Password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                        />

                        {error ? <p className="form-error">{error}</p> : null}

                        <a onClick={(event) => handleReset()} className="forgot-password-link">
                            Forgot password?
                        </a>

                        <button type="submit">Log in</button>
                    </form>

                    <div className="oauth-divider"><span>or</span></div>
                    <div className="oauth-buttons">
                        <a className="oauth-btn oauth-btn-google" href={`${process.env.REACT_APP_API_URL}/auth/google`}>
                            <span className="oauth-icon"><GoogleIcon /></span>
                            <span className="oauth-text">Continue with Google</span>
                        </a>
                        <a className="oauth-btn oauth-btn-discord" href={`${process.env.REACT_APP_API_URL}/auth/discord`}>
                            <span className="oauth-icon"><DiscordIcon /></span>
                            <span className="oauth-text">Continue with Discord</span>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Login;