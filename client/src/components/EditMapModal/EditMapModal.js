import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import "./EditMapModal.css";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000/api";

function positionFromRow(row) {
    return {
        id: Number(row?.map_position_id ?? row?.id) || null,
        lat: String(row?.lat ?? row?.latitude ?? ""),
        lng: String(row?.lng ?? row?.longitude ?? ""),
        yaw: String(row?.yaw ?? row?.rotation ?? 0),
        pitch: String(row?.pitch ?? 0),
        zoom: String(row?.zoom ?? 1),
    };
}

function emptyPosition() {
    return { id: null, lat: "", lng: "", yaw: "0", pitch: "0", zoom: "1" };
}

const EditMapModal = ({ map, onClose, onSaved }) => {
    const { token } = useAuth();
    const [name, setName] = useState(map?.name || "");
    const [description, setDescription] = useState(map?.description || "");
    const [isPublic, setIsPublic] = useState(Boolean(map?.is_public));
    const [positions, setPositions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!map?.map_id || !token) return;
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const res = await fetch(`${API_BASE_URL}/maps/${map.map_id}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const body = await res.json().catch(() => null);
                if (!res.ok) throw new Error(body?.error || "Failed to load map");
                if (cancelled) return;
                const rows = Array.isArray(body?.map_positions) ? body.map_positions : [];
                setPositions(rows.length > 0 ? rows.map(positionFromRow) : [emptyPosition()]);
            } catch (err) {
                if (!cancelled) setError(err.message || "Failed to load map");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [map?.map_id, token]);

    const updatePosition = (index, field, value) => {
        setPositions((list) =>
            list.map((p, i) => (i === index ? { ...p, [field]: value } : p))
        );
    };

    const addPosition = () => setPositions((list) => [...list, emptyPosition()]);
    const removePosition = (index) =>
        setPositions((list) => (list.length <= 1 ? list : list.filter((_, i) => i !== index)));

    const handleSave = async (event) => {
        event.preventDefault();
        if (!name.trim()) {
            setError("Map name is required");
            return;
        }

        const sanitized = positions
            .map((p) => ({
                map_position_id: p.id || undefined,
                lat: Number(p.lat),
                lng: Number(p.lng),
                yaw: Number(p.yaw || 0),
                pitch: Number(p.pitch || 0),
                zoom: Number(p.zoom || 1),
            }))
            .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

        if (sanitized.length < 1) {
            setError("Add at least 1 valid position");
            return;
        }

        const outOfBounds = sanitized.some(
            (p) => p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180
        );
        if (outOfBounds) {
            setError("One or more coordinates are out of bounds");
            return;
        }

        try {
            setSaving(true);
            setError("");
            const res = await fetch(`${API_BASE_URL}/maps/${map.map_id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim() || null,
                    is_public: isPublic,
                    map_positions: sanitized,
                }),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || "Failed to save");

            if (Number(body?.kept_locked_positions) > 0) {
                setError(
                    `Saved, but ${body.kept_locked_positions} position(s) were already used in games and couldn't be removed.`
                );
            }

            onSaved?.({
                ...map,
                name: name.trim(),
                description: description.trim() || null,
                is_public: isPublic,
                positions_count: sanitized.length,
            });
            onClose?.();
        } catch (err) {
            setError(err.message || "Failed to save");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="edit-map-backdrop" onClick={onClose}>
            <div className="edit-map-modal" onClick={(e) => e.stopPropagation()}>
                <div className="edit-map-head">
                    <h2>Edit Map</h2>
                    <button type="button" className="edit-map-close" onClick={onClose}>×</button>
                </div>

                {loading ? (
                    <p className="edit-map-empty">Loading…</p>
                ) : (
                    <form className="edit-map-form" onSubmit={handleSave}>
                        <label>
                            Name
                            <input
                                type="text"
                                value={name}
                                maxLength={120}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </label>

                        <label>
                            Description
                            <textarea
                                value={description}
                                rows={3}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </label>

                        <label className="edit-map-checkbox">
                            <input
                                type="checkbox"
                                checked={isPublic}
                                onChange={(e) => setIsPublic(e.target.checked)}
                            />
                            Public (visible in community maps)
                        </label>

                        <div className="edit-map-positions-head">
                            <h3>Positions ({positions.length})</h3>
                            <button type="button" onClick={addPosition}>Add</button>
                        </div>

                        <div className="edit-map-positions">
                            {positions.map((p, i) => (
                                <div className="edit-map-position" key={`pos-${i}`}>
                                    <input type="text" inputMode="decimal" placeholder="Lat"
                                        value={p.lat} onChange={(e) => updatePosition(i, "lat", e.target.value)} />
                                    <input type="text" inputMode="decimal" placeholder="Lng"
                                        value={p.lng} onChange={(e) => updatePosition(i, "lng", e.target.value)} />
                                    <input type="text" inputMode="decimal" placeholder="Yaw"
                                        value={p.yaw} onChange={(e) => updatePosition(i, "yaw", e.target.value)} />
                                    <input type="text" inputMode="decimal" placeholder="Pitch"
                                        value={p.pitch} onChange={(e) => updatePosition(i, "pitch", e.target.value)} />
                                    <input type="text" inputMode="decimal" placeholder="Zoom"
                                        value={p.zoom} onChange={(e) => updatePosition(i, "zoom", e.target.value)} />
                                    <button type="button" className="edit-map-remove"
                                        onClick={() => removePosition(i)} disabled={positions.length <= 1}>
                                        Remove
                                    </button>
                                </div>
                            ))}
                        </div>

                        {error ? <p className="edit-map-error">{error}</p> : null}

                        <div className="edit-map-actions">
                            <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
                            <button type="submit" disabled={saving}>
                                {saving ? "Saving…" : "Save changes"}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default EditMapModal;
