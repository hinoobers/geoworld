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
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

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

    const mapsForUser = (userId) =>
        maps.filter((m) => Number(m.created_by) === Number(userId));

    const handleToggleRestricted = async (id, next) => {
        setActionError("");
        const res = await authedFetch(`/users/${id}/restrict`, {
            method: "PATCH",
            body: JSON.stringify({ is_restricted: next }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            setActionError(body?.error || "Failed to update user");
            return;
        }
        setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, is_restricted: next ? 1 : 0 } : u)));
    };

    const openDeleteUser = (userRow) => {
        setActionError("");
        setDeleteTarget(userRow);
    };

    const confirmDeleteUser = async (mapsAction) => {
        if (!deleteTarget) return;
        setDeleting(true);
        setActionError("");
        const res = await authedFetch(`/users/${deleteTarget.id}`, {
            method: "DELETE",
            body: JSON.stringify({ maps_action: mapsAction }),
        });
        setDeleting(false);
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            setActionError(body?.error || "Failed to delete user");
            return;
        }
        setDeleteTarget(null);
        setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
        loadAll();
    };

    const handleTogglePublic = async (id, next) => {
        setActionError("");
        const res = await authedFetch(`/maps/${id}/public`, {
            method: "PATCH",
            body: JSON.stringify({ is_public: next }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            setActionError(body?.error || "Failed to update map");
            return;
        }
        setMaps((prev) => prev.map((m) => (m.id === id ? { ...m, is_public: next ? 1 : 0 } : m)));
    };

    const handleToggleForcedPopular = async (id, next) => {
        setActionError("");
        const res = await authedFetch(`/maps/${id}/forced-popular`, {
            method: "PATCH",
            body: JSON.stringify({ is_forced_popular: next }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            setActionError(body?.error || "Failed to update map");
            return;
        }
        setMaps((prev) => prev.map((m) => (m.id === id ? { ...m, is_forced_popular: next ? 1 : 0 } : m)));
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
                                            <th>Restricted</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.map((u) => {
                                            const isSelf = Number(u.id) === Number(user?.id);
                                            const isAdminRow = u.role === "admin";
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
                                                    <td>
                                                        <label className="admin-switch">
                                                            <input
                                                                type="checkbox"
                                                                checked={Boolean(u.is_restricted)}
                                                                disabled={isAdminRow || isSelf}
                                                                onChange={(e) =>
                                                                    handleToggleRestricted(u.id, e.target.checked)
                                                                }
                                                            />
                                                            {u.is_restricted ? "Restricted" : "Active"}
                                                        </label>
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
                                                            onClick={() => openDeleteUser(u)}
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
                                            <th>Public</th>
                                            <th>Forced popular</th>
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
                                                <td>
                                                    <label className="admin-switch">
                                                        <input
                                                            type="checkbox"
                                                            checked={Boolean(m.is_public)}
                                                            onChange={(e) =>
                                                                handleTogglePublic(m.id, e.target.checked)
                                                            }
                                                        />
                                                        {m.is_public ? "Public" : "Private"}
                                                    </label>
                                                </td>
                                                <td>
                                                    <label className="admin-switch">
                                                        <input
                                                            type="checkbox"
                                                            checked={Boolean(m.is_forced_popular)}
                                                            onChange={(e) =>
                                                                handleToggleForcedPopular(m.id, e.target.checked)
                                                            }
                                                        />
                                                        {m.is_forced_popular ? "On" : "Off"}
                                                    </label>
                                                </td>
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

            {deleteTarget ? (
                <DeleteUserModal
                    target={deleteTarget}
                    mapCount={mapsForUser(deleteTarget.id).length}
                    deleting={deleting}
                    onCancel={() => !deleting && setDeleteTarget(null)}
                    onConfirm={confirmDeleteUser}
                />
            ) : null}
        </div>
    );
};

const DeleteUserModal = ({ target, mapCount, deleting, onCancel, onConfirm }) => (
    <div className="admin-modal-backdrop" onClick={onCancel}>
        <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="admin-modal-close" onClick={onCancel} aria-label="Close">×</button>
            <h2>Delete {target.username}?</h2>
            {mapCount > 0 ? (
                <>
                    <p className="admin-modal-description">
                        This user has <strong>{mapCount}</strong> map{mapCount === 1 ? "" : "s"}. Choose what happens to them.
                    </p>
                    <div className="admin-modal-actions">
                        <button
                            type="button"
                            className="admin-modal-primary"
                            onClick={() => onConfirm("transfer")}
                            disabled={deleting}
                        >
                            Transfer maps to me
                        </button>
                        <button
                            type="button"
                            className="admin-modal-danger"
                            onClick={() => onConfirm("delete")}
                            disabled={deleting}
                        >
                            Delete maps too
                        </button>
                        <button
                            type="button"
                            className="admin-modal-secondary"
                            onClick={onCancel}
                            disabled={deleting}
                        >
                            Cancel
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <p className="admin-modal-description">This cannot be undone.</p>
                    <div className="admin-modal-actions">
                        <button
                            type="button"
                            className="admin-modal-danger"
                            onClick={() => onConfirm("delete")}
                            disabled={deleting}
                        >
                            {deleting ? "Deleting…" : "Delete user"}
                        </button>
                        <button
                            type="button"
                            className="admin-modal-secondary"
                            onClick={onCancel}
                            disabled={deleting}
                        >
                            Cancel
                        </button>
                    </div>
                </>
            )}
        </div>
    </div>
);

export default AdminPage;
