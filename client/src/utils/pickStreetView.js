const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000/api";

const ANCHOR_CITIES = [
    { lat: 40.7128, lng: -74.006 },
    { lat: 34.0522, lng: -118.2437 },
    { lat: 41.8781, lng: -87.6298 },
    { lat: 29.7604, lng: -95.3698 },
    { lat: 39.7392, lng: -104.9903 },
    { lat: 47.6062, lng: -122.3321 },
    { lat: 25.7617, lng: -80.1918 },
    { lat: 42.3601, lng: -71.0589 },
    { lat: 33.4484, lng: -112.074 },
    { lat: 32.7767, lng: -96.797 },
    { lat: 49.2827, lng: -123.1207 },
    { lat: 43.6532, lng: -79.3832 },
    { lat: 45.5017, lng: -73.5673 },
    { lat: 19.4326, lng: -99.1332 },
    { lat: -23.5505, lng: -46.6333 },
    { lat: -22.9068, lng: -43.1729 },
    { lat: -34.6037, lng: -58.3816 },
    { lat: -33.4489, lng: -70.6693 },
    { lat: 51.5074, lng: -0.1278 },
    { lat: 48.8566, lng: 2.3522 },
    { lat: 52.52, lng: 13.405 },
    { lat: 41.9028, lng: 12.4964 },
    { lat: 40.4168, lng: -3.7038 },
    { lat: 38.7223, lng: -9.1393 },
    { lat: 52.3676, lng: 4.9041 },
    { lat: 50.8503, lng: 4.3517 },
    { lat: 48.2082, lng: 16.3738 },
    { lat: 47.3769, lng: 8.5417 },
    { lat: 59.3293, lng: 18.0686 },
    { lat: 55.6761, lng: 12.5683 },
    { lat: 60.1699, lng: 24.9384 },
    { lat: 53.3498, lng: -6.2603 },
    { lat: 37.9838, lng: 23.7275 },
    { lat: 50.0755, lng: 14.4378 },
    { lat: 52.2297, lng: 21.0122 },
    { lat: 47.4979, lng: 19.0402 },
    { lat: 35.6762, lng: 139.6503 },
    { lat: 34.6937, lng: 135.5023 },
    { lat: 37.5665, lng: 126.978 },
    { lat: 1.3521, lng: 103.8198 },
    { lat: 13.7563, lng: 100.5018 },
    { lat: -6.2088, lng: 106.8456 },
    { lat: 14.5995, lng: 120.9842 },
    { lat: 28.6139, lng: 77.209 },
    { lat: 19.076, lng: 72.8777 },
    { lat: 25.2048, lng: 55.2708 },
    { lat: 41.0082, lng: 28.9784 },
    { lat: -33.8688, lng: 151.2093 },
    { lat: -37.8136, lng: 144.9631 },
    { lat: -27.4698, lng: 153.0251 },
    { lat: -36.8485, lng: 174.7633 },
    { lat: -33.9249, lng: 18.4241 },
    { lat: -26.2041, lng: 28.0473 },
];

const SEARCH_RADIUS_METERS = 50000;
const JITTER_DEG = 0.4;
const MAX_ATTEMPTS = 12;

function getAuthToken() {
    try {
        const stored = localStorage.getItem("geoworld-auth");
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed?.token) return parsed.token;
        }
        const guest = localStorage.getItem("geoworld-guest");
        if (guest) {
            const parsed = JSON.parse(guest);
            if (parsed?.token) return parsed.token;
        }
    } catch {
        // ignore
    }
    return null;
}

let cachedKeyPromise = null;
function fetchApiKey() {
    if (cachedKeyPromise) return cachedKeyPromise;
    const token = getAuthToken();
    cachedKeyPromise = fetch(`${API_BASE_URL}/streetview/config`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
        .then(async (res) => {
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error || "Failed to load street view config");
            }
            return res.json();
        })
        .then((body) => body.key)
        .catch((err) => {
            cachedKeyPromise = null;
            throw err;
        });
    return cachedKeyPromise;
}

function pickAnchor() {
    return ANCHOR_CITIES[Math.floor(Math.random() * ANCHOR_CITIES.length)];
}

function jitter(value) {
    return value + (Math.random() - 0.5) * 2 * JITTER_DEG;
}

async function fetchPanoMetadata(lat, lng, key) {
    const url =
        "https://maps.googleapis.com/maps/api/streetview/metadata"
        + `?location=${lat},${lng}`
        + `&radius=${SEARCH_RADIUS_METERS}`
        + "&source=outdoor"
        + `&key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json().catch(() => null);
}

export async function pickStreetViewLocation() {
    const key = await fetchApiKey();
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const anchor = pickAnchor();
        const lat = jitter(anchor.lat);
        const lng = jitter(anchor.lng);

        const meta = await fetchPanoMetadata(lat, lng, key);
        if (meta?.status !== "OK" || !meta.location) continue;

        return {
            lat: Number(meta.location.lat),
            lng: Number(meta.location.lng),
            pano_id: meta.pano_id || null,
        };
    }
    return null;
}
