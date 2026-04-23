import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import Header from "../../components/Header/Header";
import { useAuth } from "../../context/AuthContext";
import "./AdminPage.css";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000/api";

const AdminPage = () => {
    const { token, isLoggedIn, isAdmin, user } = useAuth();

    const [overview, setOverview] = useState(null);
    const [users, setUsers] = useState([]);
    const [maps, setMaps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [actionError, setActionError] = useState("");

    const authedFetch = useCallback(
        (path, options = {}) =>
            fetch(`${API_BASE_URL}/admin${path}`, {
                ...options,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                    ...(options.headers || {}),
                },
            }),
        [token]
    );

    const loadAll = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const [oRes, uRes, mRes] = await Promise.all([
                authedFetch("/overview"),
                authedFetch("/users"),
                authedFetch("/maps"),
            ]);
            if (!oRes.ok || !uRes.ok || !mRes.ok) {
                throw new Error("Failed to load admin data");
            }
            setOverview(await oRes.json());
            setUsers(await uRes.json());
            setMaps(await mRes.json());
        } catch (err) {
            setError(err.message || "Failed to load");
        } finally {
            setLoading(false);
        }
    }, [authedFetch]);

    useEffect(() => {
        if (isLoggedIn && isAdmin) loadAll();
    }, [isLoggedIn, isAdmin, loadAll]);

    if (!isLoggedIn) return <Navigate to="/login" replace />;
    if (!isAdmin) return <Navigate to="/home" replace />;

    const handleRoleChange = async (id, nextRole) => {
        setActionError("");
        const res = await authedFetch(`/users/${id}/role`, {
            method: "PATCH",
            body: JSON.stringify({ role: nextRole }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            setActionError(body?.error || "Failed to update role");
            return;
        }
        setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role: nextRole } : u)));
    };

    const handleDeleteUser = async (id, username) => {
        if (!window.confirm(`Delete user "${username}"? This cannot be undone.`)) return;
        setActionError("");
        const res = await authedFetch(`/users/${id}`, { method: "DELETE" });
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            setActionError(body?.error || "Failed to delete user");
            return;
        }
        setUsers((prev) => prev.filter((u) => u.id !== id));
        loadAll();
    };

    const handleDeleteMap = async (id, name) => {
        if (!window.confirm(`Delete map "${name}"? This cannot be undone.`)) return;
        setActionError("");
        const res = await authedFetch(`/maps/${id}`, { method: "DELETE" });
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            setActionError(body?.error || "Failed to delete map");
            return;
        }
        setMaps((prev) => prev.filter((m) => m.id !== id));
        loadAll();
    };

    return (
        <div className="page">
            <Header />
            <div className="admin-page">
                <h1>Admin Panel</h1>

                {error && <div className="admin-error">{error}</div>}
                {actionError && <div className="admin-error">{actionError}</div>}

                {loading ? (
                    <p>Loading…</p>
                ) : (
                    <>
                        <section className="admin-section">
                            <h2>Overview</h2>
                            {overview && (
                                <div className="admin-overview">
                                    <div className="admin-stat">
                                        <span className="admin-stat-value">{overview.users}</span>
                                        <span className="admin-stat-label">Users</span>
                                    </div>
                                    <div className="admin-stat">
                                        <span className="admin-stat-value">{overview.admins}</span>
                                        <span className="admin-stat-label">Admins</span>
                                    </div>
                                    <div className="admin-stat">
                                        <span className="admin-stat-value">{overview.games}</span>
                                        <span className="admin-stat-label">Games</span>
                                    </div>
                                    <div className="admin-stat">
                                        <span className="admin-stat-value">{overview.maps}</span>
                                        <span className="admin-stat-label">Maps</span>
                                    </div>
                                </div>
                            )}
                        </section>

                        <section className="admin-section">
                            <h2>Users ({users.length})</h2>
                            <div className="admin-table-wrap">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Username</th>
                                            <th>Email</th>
                                            <th>Role</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.map((u) => {
                                            const isSelf = Number(u.id) === Number(user?.id);
                                            return (
                                                <tr key={u.id}>
                                                    <td>{u.id}</td>
                                                    <td>{u.username}</td>
                                                    <td>{u.email}</td>
                                                    <td>
                                                        <span className={`admin-role admin-role-${u.role}`}>
                                                            {u.role}
                                                        </span>
                                                    </td>
                                                    <td className="admin-actions">
                                                        {u.role === "admin" ? (
                                                            <button
                                                                type="button"
                                                                disabled={isSelf}
                                                                onClick={() => handleRoleChange(u.id, "user")}
                                                            >
                                                                Demote
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRoleChange(u.id, "admin")}
                                                            >
                                                                Promote
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            className="admin-danger"
                                                            disabled={isSelf}
                                                            onClick={() => handleDeleteUser(u.id, u.username)}
                                                        >
                                                            Delete
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <section className="admin-section">
                            <h2>Maps ({maps.length})</h2>
                            <div className="admin-table-wrap">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Name</th>
                                            <th>Creator</th>
                                            <th>Daily</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {maps.map((m) => (
                                            <tr key={m.id}>
                                                <td>{m.id}</td>
                                                <td>{m.name}</td>
                                                <td>{m.creator_username || `#${m.created_by ?? "?"}`}</td>
                                                <td>{m.is_daily ? "Yes" : ""}</td>
                                                <td className="admin-actions">
                                                    <button
                                                        type="button"
                                                        className="admin-danger"
                                                        onClick={() => handleDeleteMap(m.id, m.name)}
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </>
                )}
            </div>
        </div>
    );
};

export default AdminPage;
