const DIRECTIONS = [
    { label: "N", deg: 0 },
    { label: "NE", deg: 45 },
    { label: "E", deg: 90 },
    { label: "SE", deg: 135 },
    { label: "S", deg: 180 },
    { label: "SW", deg: 225 },
    { label: "W", deg: 270 },
    { label: "NW", deg: 315 },
];

const STRIP_WIDTH = 240;
const DEG_PER_PX = 360 / STRIP_WIDTH;

const Compass = ({ heading = 0 }) => {
    const h = ((Number(heading) || 0) % 360 + 360) % 360;

    const marks = [];
    for (const d of DIRECTIONS) {
        for (const offset of [-360, 0, 360]) {
            const delta = d.deg + offset - h;
            if (Math.abs(delta) > 200) continue;
            marks.push({ label: d.label, x: STRIP_WIDTH / 2 + delta / DEG_PER_PX });
        }
    }

    return (
        <div className="mp-compass" aria-hidden="true">
            <div className="mp-compass-strip">
                {marks.map((m, i) => {
                    const isCardinal = m.label.length === 1;
                    return (
                        <span
                            key={i}
                            className={`mp-compass-mark${isCardinal ? " is-cardinal" : ""}`}
                            style={{ left: `${m.x}px` }}
                        >
                            {m.label}
                        </span>
                    );
                })}
            </div>
            <div className="mp-compass-tick" />
        </div>
    );
};

export default Compass;
