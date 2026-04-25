import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "../../../components/Header/Header";
import { useAuth } from "../../../context/AuthContext";
import "./Login.css";

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
                </div>
            </div>
        </div>
    );
}

export default Login;