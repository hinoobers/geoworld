import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "./PlayMapModal.css";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000/api";

const PlayMapModal = ({ map, onClose }) => {
    const navigate = useNavigate();
    const { token } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [allowMove, setAllowMove] = useState(true);
    const [allowZoom, setAllowZoom] = useState(true);
    const [allowLook, setAllowLook] = useState(true);

    if (!map) return null;

    const startSingleplayer = async () => {
        if (!token) {
            setError("You must be logged in to play");
            return;
        }
        setError("");
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/games/create-game`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    map_id: map.map_id,
                    mode: "singleplayer",
                    allow_move: allowMove,
                    allow_zoom: allowZoom,
                    allow_look: allowLook,
                }),
            });
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.error || "Failed to start game");
            onClose();
            navigate(`/play?game=${encodeURIComponent(body.game_id)}`);
        } catch (nextError) {
            setError(nextError.message || "Failed to start game");
        } finally {
            setLoading(false);
        }
    };

    const createLobby = async () => {
        if (!token) {
            setError("You must be logged in to create a lobby");
            return;
        }

        setError("");
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/lobbies`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    map_id: map.map_id,
                    allow_move: allowMove,
                    allow_zoom: allowZoom,
                    allow_look: allowLook,
                }),
            });
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(body?.error || "Failed to create lobby");
            }
            onClose();
            navigate(`/lobby/${encodeURIComponent(body.code)}`);
        } catch (nextError) {
            setError(nextError.message || "Failed to create lobby");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="play-modal-backdrop" onClick={onClose}>
            <div className="play-modal" onClick={(event) => event.stopPropagation()}>
                <button type="button" className="play-modal-close" onClick={onClose} aria-label="Close">×</button>
                <h2>{map.name || "Play map"}</h2>
                {map.description ? <p className="play-modal-description">{map.description}</p> : null}

                <div className="play-modal-settings">
                    <label className="play-modal-toggle">
                        <input
                            type="checkbox"
                            checked={allowMove}
                            onChange={(e) => setAllowMove(e.target.checked)}
                        />
                        Allow moving
                    </label>
                    <label className="play-modal-toggle">
                        <input
                            type="checkbox"
                            checked={allowZoom}
                            onChange={(e) => setAllowZoom(e.target.checked)}
                        />
                        Allow zoom
                    </label>
                    <label className="play-modal-toggle">
                        <input
                            type="checkbox"
                            checked={allowLook}
                            onChange={(e) => setAllowLook(e.target.checked)}
                        />
                        Allow looking around
                    </label>
                </div>

                <div className="play-modal-actions">
                    <button type="button" className="play-modal-primary" onClick={startSingleplayer} disabled={loading}>
                        Singleplayer
                    </button>
                    <button type="button" className="play-modal-secondary" onClick={createLobby} disabled={loading}>
                        {loading ? "Creating lobby..." : "Create Lobby"}
                    </button>
                </div>

                {error ? <p className="play-modal-error">{error}</p> : null}
            </div>
        </div>
    );
};

export default PlayMapModal;
