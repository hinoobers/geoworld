import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Header from "../../../components/Header/Header";
import { useAuth } from "../../../context/AuthContext";
import "./Signup.css";

function safeRedirectTarget(raw) {
    if (!raw || typeof raw !== "string") return "/home";
    if (!raw.startsWith("/") || raw.startsWith("//")) return "/home";
    return raw;
}

const Signup = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { register } = useAuth();
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [errorCode, setErrorCode] = useState("");

    const redirectTo = safeRedirectTarget(searchParams.get("redirect"));

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        setError("");
        setErrorCode("");

        try {
            await register({ username, email, password });
            navigate(redirectTo);
        } catch (error) {
            setError(error.message);
            setErrorCode(error.code || "");
        }
    };

    return (
        <div className="page">
            <Header />

            <div className="content">
                <div className="signup-page">
                    <h1>Create Account</h1>
                    <p>Join GeoWorld and start exploring</p>

                    <form className="signup-form" onSubmit={handleSubmit}>
                        <label htmlFor="username">Username</label>
                        <input
                            type="text"
                            id="username"
                            placeholder="Username"
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                        />

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

                        <label htmlFor="confirm-password">Confirm Password</label>
                        <input
                            type="password"
                            id="confirm-password"
                            placeholder="Confirm Password"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                        />

                        {error ? (
                            <p className="form-error">
                                {error}
                                {errorCode === "disposable_email" ? (
                                    <>
                                        {" "}
                                        <Link to="/faq?q=verify-email">Why?</Link>
                                    </>
                                ) : null}
                            </p>
                        ) : null}

                        <button type="submit">Create Account</button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Signup;