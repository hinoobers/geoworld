import { useEffect, useRef, useState } from "react";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000/api";

let mapsLoaderPromise = null;
function loadGoogleMapsScript(apiKey) {
    if (window.google?.maps?.StreetViewPanorama) return Promise.resolve();
    if (mapsLoaderPromise) return mapsLoaderPromise;

    mapsLoaderPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => {
            mapsLoaderPromise = null;
            reject(new Error("Failed to load Google Maps script"));
        };
        document.head.appendChild(script);
    });
    return mapsLoaderPromise;
}

let cachedKeyPromise = null;
function fetchApiKey() {
    if (cachedKeyPromise) return cachedKeyPromise;
    cachedKeyPromise = fetch(`${API_BASE_URL}/streetview/config`)
        .then((res) => {
            if (!res.ok) throw new Error("Failed to load street view config");
            return res.json();
        })
        .then((body) => body.key);
    return cachedKeyPromise;
}

const DEFAULT_OPTIONS = {
    addressControl: false,
    fullscreenControl: false,
    linksControl: false,
    panControl: false,
    zoomControl: false,
    motionTracking: false,
    motionTrackingControl: false,
    showRoadLabels: false,
    clickToGo: false,
    scrollwheel: false,
    disableDefaultUI: true,
};

const StreetViewPano = ({ lat, lng, heading = 0, pitch = 0, zoom = 1, className }) => {
    const containerRef = useRef(null);
    const panoRef = useRef(null);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const key = await fetchApiKey();
                if (cancelled) return;
                await loadGoogleMapsScript(key);
                if (cancelled || !containerRef.current) return;

                const position = { lat: Number(lat), lng: Number(lng) };
                const pov = { heading: Number(heading) || 0, pitch: Number(pitch) || 0 };
                const zoomNum = Number(zoom) || 1;

                if (!panoRef.current) {
                    panoRef.current = new window.google.maps.StreetViewPanorama(containerRef.current, {
                        position,
                        pov,
                        zoom: zoomNum,
                        ...DEFAULT_OPTIONS,
                    });
                } else {
                    panoRef.current.setPosition(position);
                    panoRef.current.setPov(pov);
                    panoRef.current.setZoom(zoomNum);
                }
            } catch (err) {
                if (!cancelled) setError(err.message || "Street view failed to load");
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [lat, lng, heading, pitch, zoom]);

    if (error) {
        return <div className={className}>{error}</div>;
    }

    return <div ref={containerRef} className={className} />;
};

export default StreetViewPano;
