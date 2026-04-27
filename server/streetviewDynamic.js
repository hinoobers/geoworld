// Curated list of cities with strong Google Street View coverage.
// We pick a random anchor and jitter ±0.4° (~40km), then ask Google's
// Street View metadata API to snap to the nearest valid panorama.
const ANCHOR_CITIES = [
    // North America
    { lat: 40.7128, lng: -74.0060 },   // New York
    { lat: 34.0522, lng: -118.2437 },  // Los Angeles
    { lat: 41.8781, lng: -87.6298 },   // Chicago
    { lat: 29.7604, lng: -95.3698 },   // Houston
    { lat: 39.7392, lng: -104.9903 },  // Denver
    { lat: 47.6062, lng: -122.3321 },  // Seattle
    { lat: 25.7617, lng: -80.1918 },   // Miami
    { lat: 42.3601, lng: -71.0589 },   // Boston
    { lat: 33.4484, lng: -112.0740 },  // Phoenix
    { lat: 32.7767, lng: -96.7970 },   // Dallas
    { lat: 49.2827, lng: -123.1207 },  // Vancouver
    { lat: 43.6532, lng: -79.3832 },   // Toronto
    { lat: 45.5017, lng: -73.5673 },   // Montreal
    { lat: 19.4326, lng: -99.1332 },   // Mexico City

    // South America
    { lat: -23.5505, lng: -46.6333 },  // São Paulo
    { lat: -22.9068, lng: -43.1729 },  // Rio
    { lat: -34.6037, lng: -58.3816 },  // Buenos Aires
    { lat: -33.4489, lng: -70.6693 },  // Santiago

    // Europe
    { lat: 51.5074, lng: -0.1278 },    // London
    { lat: 48.8566, lng: 2.3522 },     // Paris
    { lat: 52.5200, lng: 13.4050 },    // Berlin
    { lat: 41.9028, lng: 12.4964 },    // Rome
    { lat: 40.4168, lng: -3.7038 },    // Madrid
    { lat: 38.7223, lng: -9.1393 },    // Lisbon
    { lat: 52.3676, lng: 4.9041 },     // Amsterdam
    { lat: 50.8503, lng: 4.3517 },     // Brussels
    { lat: 48.2082, lng: 16.3738 },    // Vienna
    { lat: 47.3769, lng: 8.5417 },     // Zurich
    { lat: 59.3293, lng: 18.0686 },    // Stockholm
    { lat: 55.6761, lng: 12.5683 },    // Copenhagen
    { lat: 60.1699, lng: 24.9384 },    // Helsinki
    { lat: 53.3498, lng: -6.2603 },    // Dublin
    { lat: 37.9838, lng: 23.7275 },    // Athens
    { lat: 50.0755, lng: 14.4378 },    // Prague
    { lat: 52.2297, lng: 21.0122 },    // Warsaw
    { lat: 47.4979, lng: 19.0402 },    // Budapest

    // Asia
    { lat: 35.6762, lng: 139.6503 },   // Tokyo
    { lat: 34.6937, lng: 135.5023 },   // Osaka
    { lat: 37.5665, lng: 126.9780 },   // Seoul
    { lat: 1.3521, lng: 103.8198 },    // Singapore
    { lat: 13.7563, lng: 100.5018 },   // Bangkok
    { lat: -6.2088, lng: 106.8456 },   // Jakarta
    { lat: 14.5995, lng: 120.9842 },   // Manila
    { lat: 28.6139, lng: 77.2090 },    // New Delhi
    { lat: 19.0760, lng: 72.8777 },    // Mumbai
    { lat: 25.2048, lng: 55.2708 },    // Dubai
    { lat: 41.0082, lng: 28.9784 },    // Istanbul

    // Oceania
    { lat: -33.8688, lng: 151.2093 },  // Sydney
    { lat: -37.8136, lng: 144.9631 },  // Melbourne
    { lat: -27.4698, lng: 153.0251 },  // Brisbane
    { lat: -36.8485, lng: 174.7633 },  // Auckland

    // Africa
    { lat: -33.9249, lng: 18.4241 },   // Cape Town
    { lat: -26.2041, lng: 28.0473 },   // Johannesburg
];

const SEARCH_RADIUS_METERS = 50_000;
const JITTER_DEG = 0.4;
const MAX_ATTEMPTS_PER_POSITION = 12;

function pickAnchor() {
    return ANCHOR_CITIES[Math.floor(Math.random() * ANCHOR_CITIES.length)];
}

function jitter(value) {
    return value + (Math.random() - 0.5) * 2 * JITTER_DEG;
}

async function fetchPanoramaMetadata(lat, lng, apiKey) {
    const url = "https://maps.googleapis.com/maps/api/streetview/metadata"
        + `?location=${lat},${lng}`
        + `&radius=${SEARCH_RADIUS_METERS}`
        + "&source=outdoor"
        + `&key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url);
    const body = await response.json().catch(() => null);
    return { httpOk: response.ok, status: response.status, body };
}

const statusCounts = {};

async function pickValidStreetView(apiKey) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_POSITION; attempt += 1) {
        const anchor = pickAnchor();
        const lat = jitter(anchor.lat);
        const lng = jitter(anchor.lng);

        const result = await fetchPanoramaMetadata(lat, lng, apiKey);
        const apiStatus = result?.body?.status || `HTTP_${result?.status || "?"}`;
        statusCounts[apiStatus] = (statusCounts[apiStatus] || 0) + 1;

        if (result?.body?.error_message) {
            console.error(
                "[streetviewDynamic] Google API error:",
                apiStatus,
                "-",
                result.body.error_message
            );
        }

        if (result?.body?.status === "OK" && result.body.location) {
            return {
                lat: Number(result.body.location.lat),
                lng: Number(result.body.location.lng),
                pano_id: result.body.pano_id || null,
            };
        }
    }
    return null;
}

async function generateDynamicPositions(count) {
    const apiKey = process.env.GOOGLE_STREET_VIEW_API_KEY;
    if (!apiKey) {
        throw new Error("Street View API key not configured");
    }

    Object.keys(statusCounts).forEach((k) => delete statusCounts[k]);

    const seen = new Set();
    const positions = [];

    for (let i = 0; i < count; i += 1) {
        let chosen = null;
        for (let retry = 0; retry < 4 && !chosen; retry += 1) {
            const candidate = await pickValidStreetView(apiKey);
            if (!candidate) continue;
            const key = candidate.pano_id || `${candidate.lat.toFixed(4)},${candidate.lng.toFixed(4)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            chosen = candidate;
        }
        if (!chosen) {
            console.error(
                "[streetviewDynamic] giving up — API status counts:",
                JSON.stringify(statusCounts)
            );
            throw new Error("Could not find enough valid Street View locations");
        }
        positions.push({
            lat: chosen.lat,
            lng: chosen.lng,
            yaw: 0,
            pitch: 0,
            zoom: 1,
            panorama_id: chosen.pano_id,
        });
    }

    return positions;
}

async function reverseGeocodeCountry(lat, lng, apiKey) {
    const url = "https://maps.googleapis.com/maps/api/geocode/json"
        + `?latlng=${lat},${lng}`
        + "&result_type=country"
        + "&language=en"
        + `&key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url);
    if (!response.ok) return null;
    const body = await response.json().catch(() => null);
    if (body?.error_message) {
        console.error(
            "[streetviewDynamic] Geocoding API error:",
            body.status,
            "-",
            body.error_message
        );
    }
    if (body?.status !== "OK" || !body.results?.[0]) return null;
    const country = body.results[0].address_components?.find((component) =>
        component.types?.includes("country")
    );
    if (!country?.short_name) return null;
    return {
        code: country.short_name,
        name: country.long_name || country.short_name,
    };
}

async function pickStreetViewWithCountry(excludeCountryCodes = []) {
    const apiKey = process.env.GOOGLE_STREET_VIEW_API_KEY;
    if (!apiKey) throw new Error("Street View API key not configured");

    const exclude = new Set(excludeCountryCodes);
    for (let attempt = 0; attempt < 30; attempt += 1) {
        const candidate = await pickValidStreetView(apiKey);
        if (!candidate) continue;
        const country = await reverseGeocodeCountry(candidate.lat, candidate.lng, apiKey);
        if (!country?.code) continue;
        if (exclude.has(country.code)) continue;
        return {
            lat: candidate.lat,
            lng: candidate.lng,
            pano_id: candidate.pano_id,
            country_code: country.code,
            country_name: country.name,
        };
    }
    return null;
}

module.exports = {
    generateDynamicPositions,
    pickStreetViewWithCountry,
    reverseGeocodeCountry,
};
