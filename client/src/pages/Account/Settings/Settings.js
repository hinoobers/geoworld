import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../../../components/Header/Header";
import { useAuth } from "../../../context/AuthContext";
import "./Settings.css";

const ACCEPTED_PFP_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_PFP_BYTES = 5 * 1024 * 1024;

function getPfpBaseUrl() {
    const explicit = process.env.REACT_APP_SOCKET_URL;
    if (explicit) return explicit.replace(/\/$/, "");
    const api = process.env.REACT_APP_API_URL || "";
    return api.replace(/\/api\/?$/, "");
}

const Settings = () => {
    const { token, user, login, logout } = useAuth();
    const navigate = useNavigate();
    const pfpInputRef = useRef(null);

    const isOAuthAccount = user?.account_type === "discord" || user?.account_type === "google";

    const [username, setUsername] = useState(user?.username || "");
    const [usernameMessage, setUsernameMessage] = useState(null);
    const [usernameSubmitting, setUsernameSubmitting] = useState(false);

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [passwordMessage, setPasswordMessage] = useState(null);
    const [passwordSubmitting, setPasswordSubmitting] = useState(false);

    const [profilePfp, setProfilePfp] = useState(null);
    const [pfpMessage, setPfpMessage] = useState(null);
    const [pfpSubmitting, setPfpSubmitting] = useState(false);

    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deletePassword, setDeletePassword] = useState("");
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [deleteMessage, setDeleteMessage] = useState(null);
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);

    const closeDeleteModal = () => {
        if (deleteSubmitting) return;
        setDeleteOpen(false);
        setDeletePassword("");
        setDeleteConfirmText("");
        setDeleteMessage(null);
    };

    const handleDeleteAccount = async (event) => {
        event.preventDefault();
        if (deleteSubmitting) return;
        setDeleteMessage(null);

        if (deleteConfirmText.trim() !== "DELETE") {
            setDeleteMessage({ kind: "error", text: 'Please type "DELETE" to confirm.' });
            return;
        }
        if (!isOAuthAccount && !deletePassword) {
            setDeleteMessage({ kind: "error", text: "Please enter your current password." });
            return;
        }

        setDeleteSubmitting(true);
        let response;
        try {
            response = await fetch(process.env.REACT_APP_API_URL + "/users/me", {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(
                    isOAuthAccount ? {} : { current_password: deletePassword }
                ),
            });
        } catch (err) {
            setDeleteSubmitting(false);
            setDeleteMessage({ kind: "error", text: "Failed to delete account. Please try again." });
            return;
        }

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            setDeleteSubmitting(false);
            setDeleteMessage({ kind: "error", text: result?.error || "Failed to delete account." });
            return;
        }

        sessionStorage.setItem("geoworld-auth-flash", "Your account has been deleted.");
        logout();
        navigate("/");
    };

    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(process.env.REACT_APP_API_URL + "/users/me", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const body = await res.json().catch(() => ({}));
                if (!cancelled && res.ok) {
                    setProfilePfp(body?.profile_pfp || null);
                }
            } catch {
                /* ignore */
            }
        })();
        return () => { cancelled = true; };
    }, [token]);

    const pfpUrl = profilePfp ? `${getPfpBaseUrl()}/pfps/${profilePfp}` : null;

    const handlePfpFile = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        setPfpMessage(null);

        if (!ACCEPTED_PFP_TYPES.includes(file.type)) {
            setPfpMessage({ kind: "error", text: "Use a JPEG, PNG, WebP, or GIF image." });
            return;
        }
        if (file.size > MAX_PFP_BYTES) {
            setPfpMessage({ kind: "error", text: "Image must be under 5 MB." });
            return;
        }

        setPfpSubmitting(true);
        let response;
        try {
            response = await fetch(process.env.REACT_APP_API_URL + "/users/me/profile-picture", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": file.type,
                },
                body: file,
            });
        } catch (err) {
            setPfpSubmitting(false);
            setPfpMessage({ kind: "error", text: "Upload failed. Please try again." });
            return;
        }

        const result = await response.json().catch(() => ({}));
        setPfpSubmitting(false);

        if (!response.ok) {
            setPfpMessage({ kind: "error", text: result?.error || "Upload failed." });
            return;
        }

        setProfilePfp(result?.profile_pfp || null);
        setPfpMessage({ kind: "success", text: "Profile picture updated." });
    };

    const handlePfpRemove = async () => {
        if (pfpSubmitting || !profilePfp) return;
        setPfpMessage(null);
        setPfpSubmitting(true);
        let response;
        try {
            response = await fetch(process.env.REACT_APP_API_URL + "/users/me/profile-picture", {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
        } catch (err) {
            setPfpSubmitting(false);
            setPfpMessage({ kind: "error", text: "Failed to remove. Please try again." });
            return;
        }

        const result = await response.json().catch(() => ({}));
        setPfpSubmitting(false);

        if (!response.ok) {
            setPfpMessage({ kind: "error", text: result?.error || "Failed to remove." });
            return;
        }

        setProfilePfp(null);
        setPfpMessage({ kind: "success", text: "Profile picture removed." });
    };

    const handleUsernameChange = async (event) => {
        event.preventDefault();
        if (usernameSubmitting) return;
        setUsernameMessage(null);

        const trimmed = username.trim();
        if (!trimmed) {
            setUsernameMessage({ kind: "error", text: "Username cannot be empty." });
            return;
        }
        if (trimmed === user?.username) {
            setUsernameMessage({ kind: "error", text: "That is already your username." });
            return;
        }

        setUsernameSubmitting(true);
        let response;
        try {
            response = await fetch(process.env.REACT_APP_API_URL + "/users/change-username", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ username: trimmed }),
            });
        } catch (err) {
            setUsernameSubmitting(false);
            setUsernameMessage({ kind: "error", text: "Failed to change username. Please try again." });
            return;
        }

        const result = await response.json().catch(() => ({}));
        setUsernameSubmitting(false);

        if (!response.ok) {
            setUsernameMessage({
                kind: "error",
                text: result?.error || "Failed to change username.",
            });
            return;
        }

        if (result?.token) {
            try {
                await login({ token: result.token });
            } catch {
                /* ignore — user can re-login if needed */
            }
        }

        setUsernameMessage({ kind: "success", text: "Username changed successfully." });
    };

    const handlePasswordChange = async (event) => {
        event.preventDefault();
        if (passwordSubmitting) return;
        setPasswordMessage(null);

        if (!currentPassword || !newPassword) {
            setPasswordMessage({ kind: "error", text: "Please fill in both password fields." });
            return;
        }
        if (newPassword.length < 6) {
            setPasswordMessage({ kind: "error", text: "New password must be at least 6 characters." });
            return;
        }

        setPasswordSubmitting(true);
        let response;
        try {
            response = await fetch(process.env.REACT_APP_API_URL + "/users/change-password", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
            });
        } catch (err) {
            setPasswordSubmitting(false);
            setPasswordMessage({ kind: "error", text: "Failed to change password. Please try again." });
            return;
        }

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            setPasswordSubmitting(false);
            setPasswordMessage({
                kind: "error",
                text: result?.error || result?.message || "Failed to change password.",
            });
            return;
        }

        setPasswordMessage({
            kind: "success",
            text: "Password changed successfully. Logging you out...",
        });
        setCurrentPassword("");
        setNewPassword("");

        setTimeout(() => {
            sessionStorage.setItem(
                "geoworld-auth-flash",
                "Password changed successfully. Please log in again."
            );
            logout();
        }, 1000);
    };

    return (
        <div className="settings-page">
            <Header />

            <div className="settings-content">
                <div className="settings-hero">
                    <h1>Account settings</h1>
                    <p>Manage your GeoWorld account.</p>
                </div>

                <div className="settings-grid">
                    <div className="settings-card">
                        <div className="settings-card-head">
                            <h3>Profile picture</h3>
                        </div>
                        <p className="settings-card-hint">
                            JPEG, PNG, WebP, or GIF. Up to 5 MB.
                        </p>

                        <div className="settings-pfp-row">
                            <div className="settings-pfp-preview">
                                {pfpUrl ? (
                                    <img src={pfpUrl} alt="Profile" />
                                ) : (
                                    <span className="settings-pfp-placeholder">
                                        {(user?.username?.[0] || "?").toUpperCase()}
                                    </span>
                                )}
                            </div>

                            <div className="settings-pfp-actions">
                                <input
                                    ref={pfpInputRef}
                                    type="file"
                                    accept={ACCEPTED_PFP_TYPES.join(",")}
                                    style={{ display: "none" }}
                                    onChange={handlePfpFile}
                                />
                                <button
                                    type="button"
                                    className="settings-primary"
                                    onClick={() => pfpInputRef.current?.click()}
                                    disabled={pfpSubmitting}
                                >
                                    {pfpSubmitting ? "Uploading..." : profilePfp ? "Change picture" : "Upload picture"}
                                </button>
                                {profilePfp ? (
                                    <button
                                        type="button"
                                        className="settings-ghost"
                                        onClick={handlePfpRemove}
                                        disabled={pfpSubmitting}
                                    >
                                        Remove
                                    </button>
                                ) : null}
                            </div>
                        </div>

                        {pfpMessage ? (
                            <p className={`settings-message settings-message-${pfpMessage.kind}`}>
                                {pfpMessage.text}
                            </p>
                        ) : null}
                    </div>

                    <form className="settings-card" onSubmit={handleUsernameChange}>
                        <div className="settings-card-head">
                            <h3>Username</h3>
                            <span className="settings-card-current">
                                Current: <strong>{user?.username || "—"}</strong>
                            </span>
                        </div>
                        <p className="settings-card-hint">
                            2–24 characters. Letters, numbers, and _.- only.
                        </p>

                        <label htmlFor="username">New username</label>
                        <input
                            type="text"
                            id="username"
                            placeholder="Username"
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            maxLength={24}
                        />

                        {usernameMessage ? (
                            <p className={`settings-message settings-message-${usernameMessage.kind}`}>
                                {usernameMessage.text}
                            </p>
                        ) : null}

                        <button
                            type="submit"
                            className="settings-primary"
                            disabled={usernameSubmitting}
                        >
                            {usernameSubmitting ? "Saving..." : "Change username"}
                        </button>
                    </form>

                    <form className="settings-card" onSubmit={handlePasswordChange}>
                        <div className="settings-card-head">
                            <h3>Password</h3>
                        </div>
                        {isOAuthAccount && (
                            <div className="settings-card-oauth-overlay">
                                <span className="settings-oauth-message">
                                    Password changes are not available for {user?.account_type} accounts.
                                </span>
                            </div>
                        )}
                        <p className="settings-card-hint">
                            You'll be logged out after a successful change.
                        </p>

                        <label htmlFor="current-password">Current password</label>
                        <input
                            type="password"
                            id="current-password"
                            placeholder="Current password"
                            value={currentPassword}
                            onChange={(event) => setCurrentPassword(event.target.value)}
                            autoComplete="current-password"
                            disabled={isOAuthAccount}
                        />

                        <label htmlFor="new-password">New password</label>
                        <input
                            type="password"
                            id="new-password"
                            placeholder="New password"
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                            autoComplete="new-password"
                            disabled={isOAuthAccount}
                        />

                        {passwordMessage ? (
                            <p className={`settings-message settings-message-${passwordMessage.kind}`}>
                                {passwordMessage.text}
                            </p>
                        ) : null}

                        <button
                            type="submit"
                            className="settings-primary"
                            disabled={passwordSubmitting || isOAuthAccount}
                        >
                            {passwordSubmitting ? "Saving..." : "Change password"}
                        </button>
                    </form>

                    <div className="settings-card">
                        <div className="settings-card-head">
                            <h3>Account</h3>
                        </div>
                        <p className="settings-card-hint">
                            Signed in as <strong>{user?.email || "—"}</strong>
                        </p>
                        <button
                            type="button"
                            className="settings-ghost"
                            onClick={() => {
                                logout();
                                navigate("/");
                            }}
                        >
                            Log out
                        </button>
                    </div>

                    <div className="settings-card settings-card-danger">
                        <div className="settings-card-head">
                            <h3>Delete account</h3>
                        </div>
                        <p className="settings-card-hint">
                            Permanently delete your account. All maps you created and their
                            positions will also be deleted. This cannot be undone.
                        </p>
                        <button
                            type="button"
                            className="settings-danger"
                            onClick={() => setDeleteOpen(true)}
                        >
                            Delete my account
                        </button>
                    </div>
                </div>
            </div>

            {deleteOpen ? (
                <div
                    className="settings-modal-backdrop"
                    onClick={closeDeleteModal}
                    role="presentation"
                >
                    <form
                        className="settings-modal"
                        onClick={(e) => e.stopPropagation()}
                        onSubmit={handleDeleteAccount}
                    >
                        <h2>Delete your account?</h2>
                        <p className="settings-modal-warning">
                            This will <strong>permanently</strong> delete your account and
                            <strong> every map you've created</strong>, including all of their
                            positions. Players who saved your maps will lose access. This action
                            cannot be undone.
                        </p>

                        {!isOAuthAccount && (
                            <>
                                <label htmlFor="delete-current-password">Current password</label>
                                <input
                                    type="password"
                                    id="delete-current-password"
                                    placeholder="Current password"
                                    value={deletePassword}
                                    onChange={(e) => setDeletePassword(e.target.value)}
                                    autoComplete="current-password"
                                />
                            </>
                        )}

                        <label htmlFor="delete-confirm">Type DELETE to confirm</label>
                        <input
                            type="text"
                            id="delete-confirm"
                            placeholder="DELETE"
                            value={deleteConfirmText}
                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                            autoComplete="off"
                        />

                        {deleteMessage ? (
                            <p className={`settings-message settings-message-${deleteMessage.kind}`}>
                                {deleteMessage.text}
                            </p>
                        ) : null}

                        <div className="settings-modal-actions">
                            <button
                                type="button"
                                className="settings-ghost"
                                onClick={closeDeleteModal}
                                disabled={deleteSubmitting}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="settings-danger"
                                disabled={deleteSubmitting}
                            >
                                {deleteSubmitting ? "Deleting..." : "Permanently delete"}
                            </button>
                        </div>
                    </form>
                </div>
            ) : null}
        </div>
    );
};

export default Settings;
