import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../../components/Header/Header";
import { useAuth } from "../../context/AuthContext";
import "./CreateMapPage.css";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000/api";

function emptyPosition() {
    return {
        lat: "",
        lng: "",
        yaw: "0",
        pitch: "0",
    };
}

function buildInspectLink(position) {
    const lat = Number(position.lat);
    const lng = Number(position.lng);
    const yaw = Number(position.yaw);
    const pitch = Number(position.pitch);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }

    const params = new URLSearchParams({
        api: "1",
        map_action: "pano",
        viewpoint: `${lat},${lng}`,
    });

    if (Number.isFinite(yaw)) {
        params.set("heading", String(yaw));
    }

    if (Number.isFinite(pitch)) {
        params.set("pitch", String(-pitch));
    }

    return `https://www.google.com/maps/@?${params.toString()}`;
}

function parseStreetViewLink(input) {
    const value = String(input || "").trim();
    if (!value) {
        console.log("[CreateMapPage] parseStreetViewLink: empty input");
        return null;
    }

    let url;
    try {
        url = new URL(value);
    } catch {
        console.log("[CreateMapPage] parseStreetViewLink: invalid URL", value);
        return null;
    }

    const source = url.toString();

    const readLatLng = () => {
        const cbll = url.searchParams.get("cbll");
        if (cbll) {
            const [latRaw, lngRaw] = cbll.split(",");
            const lat = Number(latRaw);
            const lng = Number(lngRaw);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                return { lat, lng };
            }
        }

        const viewpoint = url.searchParams.get("viewpoint");
        if (viewpoint) {
            const [latRaw, lngRaw] = viewpoint.split(",");
            const lat = Number(latRaw);
            const lng = Number(lngRaw);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                return { lat, lng };
            }
        }

        const atMatch = source.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
        if (atMatch) {
            const lat = Number(atMatch[1]);
            const lng = Number(atMatch[2]);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                return { lat, lng };
            }
        }

        const dataMatch = source.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
        if (dataMatch) {
            const lat = Number(dataMatch[1]);
            const lng = Number(dataMatch[2]);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                return { lat, lng };
            }
        }

        return null;
    };

    const readYawPitch = () => {
        const headingParam = url.searchParams.get("heading");
        const pitchParam = url.searchParams.get("pitch");
        const heading = headingParam === null ? NaN : Number(headingParam);
        const pitch = pitchParam === null ? NaN : Number(pitchParam);
        if (Number.isFinite(heading) || Number.isFinite(pitch)) {
            return {
                yaw: Number.isFinite(heading) ? heading : 0,
                pitch: Number.isFinite(pitch) ? pitch : 0,
            };
        }

        const sourceVariants = [source];
        try {
            sourceVariants.push(decodeURIComponent(source));
        } catch {
            // Ignore decode errors and keep trying other formats.
        }
        try {
            sourceVariants.push(decodeURIComponent(sourceVariants[sourceVariants.length - 1]));
        } catch {
            // Some links are only encoded once.
        }

        for (const variant of sourceVariants) {
            const embeddedYawMatch = variant.match(/[?&]yaw=(-?\d+(?:\.\d+)?)/);
            const embeddedPitchMatch = variant.match(/[?&]pitch=(-?\d+(?:\.\d+)?)/);
            if (embeddedYawMatch || embeddedPitchMatch) {
                const embeddedYaw = Number(embeddedYawMatch?.[1]);
                const embeddedPitch = Number(embeddedPitchMatch?.[1]);
                return {
                    yaw: Number.isFinite(embeddedYaw) ? embeddedYaw : 0,
                    pitch: Number.isFinite(embeddedPitch) ? embeddedPitch : 0,
                };
            }
        }

        const pathOrientationMatch = source.match(/@-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,3a,\d+(?:\.\d+)?y,(-?\d+(?:\.\d+)?)h,(-?\d+(?:\.\d+)?)t/);
        if (pathOrientationMatch) {
            const pathYaw = Number(pathOrientationMatch[1]);
            const tilt = Number(pathOrientationMatch[2]);
            const pathPitch = 90 - tilt;
            return {
                yaw: Number.isFinite(pathYaw) ? pathYaw : 0,
                pitch: Number.isFinite(pathPitch) ? pathPitch : 0,
            };
        }

        const cbp = url.searchParams.get("cbp");
        if (cbp) {
            const parts = cbp.split(",");
            const cbpYaw = Number(parts[1]);
            const cbpPitch = Number(parts[3]);

            return {
                yaw: Number.isFinite(cbpYaw) ? cbpYaw : 0,
                pitch: Number.isFinite(cbpPitch) ? cbpPitch : 0,
            };
        }

        return { yaw: 0, pitch: 0 };
    };

    const coords = readLatLng();
    if (!coords) {
        console.log("[CreateMapPage] parseStreetViewLink: failed to extract coordinates", source);
        return null;
    }

    const orientation = readYawPitch();
    console.log("[CreateMapPage] parseStreetViewLink: extracted", {
        lat: coords.lat,
        lng: coords.lng,
        yaw: orientation.yaw,
        pitch: orientation.pitch,
    });
    return {
        lat: coords.lat,
        lng: coords.lng,
        yaw: orientation.yaw,
        pitch: orientation.pitch,
    };
}

async function apiRequest(path, token, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(options.headers || {}),
        },
    });

    const responseBody = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(responseBody?.error || "Request failed");
    }

    return responseBody;
}

const CreateMapPage = () => {
    const navigate = useNavigate();
    const { token, isLoggedIn } = useAuth();

    const [mapName, setMapName] = useState("");
    const [description, setDescription] = useState("");
    const [positions, setPositions] = useState([emptyPosition(), emptyPosition(), emptyPosition()]);
    const [error, setError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const [loading, setLoading] = useState(false);

    const validCount = useMemo(() => {
        return positions.filter((position) => Number.isFinite(Number(position.lat)) && Number.isFinite(Number(position.lng))).length;
    }, [positions]);

    if (!isLoggedIn) {
        navigate("/login");
        return null;
    }

    const updatePosition = (index, field, value) => {
        setPositions((currentPositions) =>
            currentPositions.map((position, currentIndex) => {
                if (currentIndex !== index) {
                    return position;
                }

                return {
                    ...position,
                    [field]: value,
                };
            })
        );
    };

    const addPosition = () => {
        setPositions((currentPositions) => [...currentPositions, emptyPosition()]);
    };

    const removePosition = (index) => {
        setPositions((currentPositions) => currentPositions.filter((_, currentIndex) => currentIndex !== index));
    };

    const handlePastePosition = async (index) => {
        if (!navigator.clipboard?.readText) {
            setError("Clipboard read is not available in this browser/context");
            console.log("[CreateMapPage] clipboard API unavailable");
            return;
        }

        try {
            const clipboardText = await navigator.clipboard.readText();
            console.log("[CreateMapPage] clipboard text", clipboardText);
            const parsed = parseStreetViewLink(clipboardText);

            if (!parsed) {
                setError("Clipboard does not contain a valid Google Street View link");
                console.log("[CreateMapPage] parse result is null");
                return;
            }

            setError("");
            updatePosition(index, "lat", String(parsed.lat));
            updatePosition(index, "lng", String(parsed.lng));
            updatePosition(index, "yaw", String(parsed.yaw));
            updatePosition(index, "pitch", String(parsed.pitch));
            console.log("[CreateMapPage] applied parsed position", parsed);
        } catch {
            setError("Unable to read clipboard. Allow clipboard permission and try again");
            console.log("[CreateMapPage] failed to read clipboard");
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!mapName.trim()) {
            setError("Map name is required");
            return;
        }

        const sanitizedPositions = positions
            .map((position) => ({
                lat: Number(position.lat),
                lng: Number(position.lng),
                yaw: Number(position.yaw || 0),
                pitch: Number(position.pitch || 0),
            }))
            .filter((position) => Number.isFinite(position.lat) && Number.isFinite(position.lng));

        if (sanitizedPositions.length < 3) {
            setError("Add at least 3 valid positions");
            return;
        }

        const hasInvalid = sanitizedPositions.some(
            (p) =>
                p.lat < -90 || p.lat > 90 ||
                p.lng < -180 || p.lng > 180
        );

        if (hasInvalid) {
            setError("One or more coordinates are out of bounds");
            return;
        }
        setError("");
        setSuccessMessage("");

        try {
            setLoading(true);
            const response = await apiRequest("/maps/create-map", token, {
                method: "POST",
                body: JSON.stringify({
                    map_name: mapName.trim(),
                    description: description.trim() || null,
                    map_positions: sanitizedPositions,
                }),
            });

            setSuccessMessage(`Map created: ${response.name || mapName.trim()} (${response.positions_count} positions)`);
            setMapName("");
            setDescription("");
            setPositions([emptyPosition(), emptyPosition(), emptyPosition()]);
        } catch (nextError) {
            setError(nextError.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="create-map-page">
            <Header />
            <main className="create-map-content">
                <section className="create-map-header">
                    <h1>Create Map</h1>
                    <p>Add coordinates users can play in Street View.</p>
                </section>

                <form className="create-map-form" onSubmit={handleSubmit}>
                    <label htmlFor="map-name">Map Name</label>
                    <input
                        id="map-name"
                        type="text"
                        value={mapName}
                        onChange={(event) => setMapName(event.target.value)}
                        placeholder="Downtown Landmarks"
                        maxLength={120}
                        required
                    />

                    <label htmlFor="map-description">Description</label>
                    <textarea
                        id="map-description"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="Fast urban map with mixed difficulty"
                        rows={3}
                    />

                    <div className="positions-header">
                        <h2>Positions ({validCount} valid)</h2>
                        <button type="button" onClick={addPosition}>Add Position</button>
                    </div>

                    <div className="positions-list">
                        {positions.map((position, index) => (
                            <article className="position-row" key={`position-${index}`}>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="Latitude"
                                    value={position.lat}
                                    onChange={(event) => updatePosition(index, "lat", event.target.value)}
                                />
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="Longitude"
                                    value={position.lng}
                                    onChange={(event) => updatePosition(index, "lng", event.target.value)}
                                />
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="Yaw"
                                    value={position.yaw}
                                    onChange={(event) => updatePosition(index, "yaw", event.target.value)}
                                />
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="Pitch"
                                    value={position.pitch}
                                    onChange={(event) => updatePosition(index, "pitch", event.target.value)}
                                />
                                <button
                                    type="button"
                                    className="paste-position"
                                    onClick={() => {
                                        handlePastePosition(index);
                                    }}
                                >
                                    Paste
                                </button>
                                <button
                                    type="button"
                                    className="inspect-position"
                                    onClick={() => {
                                        const inspectLink = buildInspectLink(position);
                                        if (inspectLink) {
                                            window.open(inspectLink, "_blank", "noopener,noreferrer");
                                        }
                                    }}
                                    disabled={!buildInspectLink(position)}
                                >
                                    Inspect
                                </button>
                                <button
                                    type="button"
                                    className="remove-position"
                                    onClick={() => removePosition(index)}
                                    disabled={positions.length <= 1}
                                >
                                    Remove
                                </button>
                            </article>
                        ))}
                    </div>

                    {error ? <p className="create-map-error">{error}</p> : null}
                    {successMessage ? <p className="create-map-success">{successMessage}</p> : null}

                    <div className="create-map-actions">
                        <button type="submit" disabled={loading}>{loading ? "Creating..." : "Create Map"}</button>
                    </div>
                </form>
            </main>
        </div>
    );
};

export default CreateMapPage;
