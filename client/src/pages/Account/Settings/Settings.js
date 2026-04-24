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
    const { token, logout } = useAuth();
    const navigate = useNavigate();

    const handlePasswordChange = async (event) => {
        const response = await fetch(process.env.REACT_APP_API_URL + "/users/change-password", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ current_password: currentPassword, new_password: password }),
        });
        const result = await response.json();
        if (result?.error) {
            setError(result.error);
        }
        if (result?.message) {
            setError(result.message);
        }

        if(response.ok) {
            setTimeout(() => {
                const message = encodeURIComponent("Password changed successfully. Please log in again.");
                navigate(`/login?message=${message}`);
            }, 1000);
            setTimeout(() => {
                //logout();
            }, 1250);
        }
    };

    const handleUsernameChange = async (event) => {    
        setError("Coming soon")
    };
    return (
        <div className="page">
            <Header />

            <div className="content">
                <div className="settings-page">
                    <h1>Settings</h1>
                    <p>Manage your account settings</p>

                    <div className="settings-form">
                        <label htmlFor="username">Username</label>
                        <input
                            type="text"
                            id="username"
                            placeholder="Username"
                            disabled={true}
                        />

                        <button type="button" onClick={handleUsernameChange}>
                            Change Username
                        </button>

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

                            <button type="button" onClick={handlePasswordChange}>
                                Change Password
                            </button>
                        </div>


                        {error ? <p className="form-error">{error}</p> : null}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;