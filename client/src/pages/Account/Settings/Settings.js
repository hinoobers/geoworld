import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "../../../components/Header/Header";
import { useAuth } from "../../../context/AuthContext";
import "./Settings.css";

function safeRedirectTarget(raw) {
    if (!raw || typeof raw !== "string") return "/home";
    if (!raw.startsWith("/") || raw.startsWith("//")) return "/home";
    return raw;
}

const Settings = () => {
    const [password, setPassword] = useState("");
    const [currentPassword, setCurrentPassword] = useState("");
    const [error, setError] = useState("");
    const { user, changePassword } = useAuth();
    return (
        <div className="page">
            <Header />

            <div className="content">
                <div className="sett-page">
                    <h1>Settings</h1>
                    <p>Manage your account settings</p>

                    <form className="settings-form" onSubmit={handleSubmit}>
                        <label htmlFor="username">Username</label>
                        <input
                            type="text"
                            id="username"
                            placeholder="Username"
                            value={username}
                            disabled={true}
                            onChange={(event) => setUsername(event.target.value)}
                        />

                        <div className="password-section">
                            <label htmlFor="current-password">Current password</label>
                            <input
                                type="password"
                                id="current-password"
                                placeholder="Current password"
                                value={currentPassword}
                                onChange={(event) => setCurrentPassword(event.target.value)}
                            />

                            <label htmlFor="password">Password</label>
                            <input
                                type="password"
                                id="password"
                                placeholder="Password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                            />

                            <button type="submit">Change Password</button>
                        </div>


                        {error ? <p className="form-error">{error}</p> : null}
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Settings;