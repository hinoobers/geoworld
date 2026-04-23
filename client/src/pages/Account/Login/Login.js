import { useState } from "react";
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

                        <button type="submit">Log in</button>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default Login;