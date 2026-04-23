const express = require("express");
const router = express.Router();
const {query} = require("../database");
const { middleware } = require("../auth");

async function insertMapPositionWithFallbacks(mapId, position) {
    const attempts = [
        {
            sql: "INSERT INTO map_positions (map_id, latitude, longitude, yaw, pitch) VALUES (?, ?, ?, ?, ?)",
            values: [mapId, position.lat, position.lng, position.yaw, position.pitch],
        },
        {
            sql: "INSERT INTO map_positions (map_id, latitude, longitude, rotation, pitch) VALUES (?, ?, ?, ?, ?)",
            values: [mapId, position.lat, position.lng, position.yaw, position.pitch],
        },
        {
            sql: "INSERT INTO map_positions (map_id, lat, lng, yaw, pitch) VALUES (?, ?, ?, ?, ?)",
            values: [mapId, position.lat, position.lng, position.yaw, position.pitch],
        },
        {
            sql: "INSERT INTO map_positions (map_id, lat, lng, rotation, pitch) VALUES (?, ?, ?, ?, ?)",
            values: [mapId, position.lat, position.lng, position.yaw, position.pitch],
        },
    ];

    let lastError = null;
    for (const attempt of attempts) {
        try {
            await query(attempt.sql, attempt.values);
            return;
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error("Failed to insert map position");
}

router.post("/create-map", middleware, async (req, res) => {
    // map_name, description, map_positions: [{ lat, lng, yaw, pitch }]
    const { map_name, description, map_positions } = req.body;

    if (!map_name || !Array.isArray(map_positions) || map_positions.length === 0) {
        return res.status(400).json({ error: "map_name and map_positions are required" });
    }

    if (typeof map_name !== "string") {
        return res.status(400).json({ error: "map_name must be a string" });
    }

    const sanitizedPositions = map_positions
        .map((position) => ({
            lat: Number(position?.lat),
            lng: Number(position?.lng),
            yaw: Number(position?.yaw ?? position?.rotation ?? 0),
            pitch: Number(position?.pitch ?? 0),
        }))
        .filter((position) => Number.isFinite(position.lat) && Number.isFinite(position.lng));

    if (sanitizedPositions.length !== map_positions.length) {
        return res.status(400).json({ error: "Each map position must include numeric lat and lng" });
    }

    try {
        let createdMap;
        try {
            createdMap = await query(
                "INSERT INTO maps (name, description, created_by) VALUES (?, ?, ?)",
                [map_name, description || null, req.user.id]
            );
        } catch {
            try {
                createdMap = await query(
                    "INSERT INTO maps (name, description, user_id) VALUES (?, ?, ?)",
                    [map_name, description || null, req.user.id]
                );
            } catch {
                createdMap = await query(
                    "INSERT INTO maps (name, description) VALUES (?, ?)",
                    [map_name, description || null]
                );
            }
        }

        const mapId = createdMap.insertId;

        for (const position of sanitizedPositions) {
            await insertMapPositionWithFallbacks(mapId, position);
        }

        return res.status(201).json({
            map_id: mapId,
            name: map_name,
            description: description || null,
            positions_count: sanitizedPositions.length,
        });
    } catch (error) {
        console.error("[mapRoutes] create-map failed", {
            message: error?.message,
            code: error?.code,
            errno: error?.errno,
            sqlMessage: error?.sqlMessage,
        });
        return res.status(500).json({ error: "Failed to create map" });
    }
});

router.get("/pos/:id", middleware, async (req, res) => {
    const { id } = req.params;
    try {
        const positions = await query("SELECT * FROM map_positions WHERE map_id = ?", [id]);
        res.json(positions);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch map positions" });
    }
});

router.get("/list", middleware, async (req, res) => {
    // return list of maps with map_id, map_name, description, map_positions
    try {
        const maps = await query("SELECT * FROM maps");

        const mapsWithCounts = await Promise.all(
            maps.map(async (map) => {
                const rows = await query(
                    "SELECT COUNT(*) AS positions_count FROM map_positions WHERE map_id = ?",
                    [map.id]
                );
                const gamesRows = await query(
                    "SELECT COUNT(*) AS plays_count FROM games WHERE map_id = ?",
                    [map.id]
                );

                return {
                    map_id: map.id ?? map.map_id,
                    name: map.name,
                    description: map.description,
                    user_id: map.user_id ?? map.created_by ?? null,
                    created_by: map.created_by ?? map.user_id ?? null,
                    is_public: Boolean(map.is_public),
                    positions_count: Number(rows[0]?.positions_count || 0),
                    plays_count: Number(gamesRows[0]?.plays_count || 0),
                };
            })
        );

        res.json(mapsWithCounts);
    } catch (error) {
        res.status(500).json({ error: "Failed to list maps" });
    }
});

router.patch("/:id/visibility", middleware, async (req, res) => {
    const { id } = req.params;
    const { is_public } = req.body;

    if (typeof is_public !== "boolean") {
        return res.status(400).json({ error: "is_public must be a boolean" });
    }

    const mapId = Number(id);
    if (!Number.isInteger(mapId) || mapId <= 0) {
        return res.status(400).json({ error: "Invalid map id" });
    }

    try {
        const mapRows = await query("SELECT created_by FROM maps WHERE id = ?", [mapId]);
        if (mapRows.length === 0) {
            return res.status(404).json({ error: "Map not found" });
        }

        if (Number(mapRows[0].created_by) !== Number(req.user.id)) {
            return res.status(403).json({ error: "Only the creator can change visibility" });
        }

        await query("UPDATE maps SET is_public = ? WHERE id = ?", [is_public ? 1 : 0, mapId]);
        return res.json({ map_id: mapId, is_public });
    } catch (error) {
        return res.status(500).json({ error: "Failed to update visibility" });
    }
});

router.get("/:id", middleware, async (req, res) => {
    const { id } = req.params;

    try {
        const mapRows = await query("SELECT * FROM maps WHERE id = ?", [id]);
        if (mapRows.length === 0) {
            return res.status(404).json({ error: "Map not found" });
        }

        const positions = await query("SELECT * FROM map_positions WHERE map_id = ?", [id]);
        return res.json({
            map_id: mapRows[0].id ?? mapRows[0].map_id,
            name: mapRows[0].name,
            description: mapRows[0].description,
            user_id: mapRows[0].user_id ?? mapRows[0].created_by ?? null,
            created_by: mapRows[0].created_by ?? mapRows[0].user_id ?? null,
            map_positions: positions,
        });
    } catch (error) {
        return res.status(500).json({ error: "Failed to fetch map" });
    }
});

module.exports = router;