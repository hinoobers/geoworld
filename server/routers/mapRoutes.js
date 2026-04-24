const express = require("express");
const router = express.Router();
const {query} = require("../database");
const { middleware } = require("../auth");

async function updateMapPositionWithFallbacks(mapId, positionId, position) {
    const attempts = [
        {
            sql: "UPDATE map_positions SET latitude = ?, longitude = ?, yaw = ?, pitch = ?, zoom = ? WHERE map_position_id = ? AND map_id = ?",
            values: [position.lat, position.lng, position.yaw, position.pitch, position.zoom, positionId, mapId],
        },
        {
            sql: "UPDATE map_positions SET latitude = ?, longitude = ?, rotation = ?, pitch = ?, zoom = ? WHERE map_position_id = ? AND map_id = ?",
            values: [position.lat, position.lng, position.yaw, position.pitch, position.zoom, positionId, mapId],
        },
        {
            sql: "UPDATE map_positions SET lat = ?, lng = ?, yaw = ?, pitch = ?, zoom = ? WHERE map_position_id = ? AND map_id = ?",
            values: [position.lat, position.lng, position.yaw, position.pitch, position.zoom, positionId, mapId],
        },
        {
            sql: "UPDATE map_positions SET lat = ?, lng = ?, rotation = ?, pitch = ?, zoom = ? WHERE map_position_id = ? AND map_id = ?",
            values: [position.lat, position.lng, position.yaw, position.pitch, position.zoom, positionId, mapId],
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

    throw lastError || new Error("Failed to update map position");
}

async function insertMapPositionWithFallbacks(mapId, position) {
    const attempts = [
        {
            sql: "INSERT INTO map_positions (map_id, latitude, longitude, yaw, pitch, zoom) VALUES (?, ?, ?, ?, ?, ?)",
            values: [mapId, position.lat, position.lng, position.yaw, position.pitch, position.zoom],
        },
        {
            sql: "INSERT INTO map_positions (map_id, latitude, longitude, rotation, pitch, zoom) VALUES (?, ?, ?, ?, ?, ?)",
            values: [mapId, position.lat, position.lng, position.yaw, position.pitch, position.zoom],
        },
        {
            sql: "INSERT INTO map_positions (map_id, lat, lng, yaw, pitch, zoom) VALUES (?, ?, ?, ?, ?, ?)",
            values: [mapId, position.lat, position.lng, position.yaw, position.pitch, position.zoom],
        },
        {
            sql: "INSERT INTO map_positions (map_id, lat, lng, rotation, pitch, zoom) VALUES (?, ?, ?, ?, ?, ?)",
            values: [mapId, position.lat, position.lng, position.yaw, position.pitch, position.zoom],
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
            zoom: Number.isFinite(Number(position?.zoom)) ? Number(position.zoom) : 1,
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
        } catch (error) {
            console.error("[mapRoutes] create-map failed to insert map", error);
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

router.put("/:id", middleware, async (req, res) => {
    const mapId = Number(req.params.id);
    if (!Number.isInteger(mapId) || mapId <= 0) {
        return res.status(400).json({ error: "Invalid map id" });
    }

    const { name, description, is_public, map_positions } = req.body || {};

    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({ error: "name must be a non-empty string" });
    }
    if (description !== undefined && description !== null && typeof description !== "string") {
        return res.status(400).json({ error: "description must be a string" });
    }
    if (is_public !== undefined && typeof is_public !== "boolean") {
        return res.status(400).json({ error: "is_public must be a boolean" });
    }

    let sanitizedPositions = null;
    if (map_positions !== undefined) {
        if (!Array.isArray(map_positions) || map_positions.length === 0) {
            return res.status(400).json({ error: "map_positions must be a non-empty array" });
        }
        sanitizedPositions = map_positions
            .map((p) => ({
                id: Number.isFinite(Number(p?.map_position_id)) ? Number(p.map_position_id) : null,
                lat: Number(p?.lat ?? p?.latitude),
                lng: Number(p?.lng ?? p?.longitude),
                yaw: Number(p?.yaw ?? p?.rotation ?? 0),
                pitch: Number(p?.pitch ?? 0),
                zoom: Number.isFinite(Number(p?.zoom)) ? Number(p.zoom) : 1,
            }))
            .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
        if (sanitizedPositions.length !== map_positions.length) {
            return res.status(400).json({ error: "Each map position must include numeric lat and lng" });
        }
    }

    try {
        const mapRows = await query("SELECT created_by FROM maps WHERE id = ?", [mapId]);
        if (mapRows.length === 0) {
            return res.status(404).json({ error: "Map not found" });
        }
        if (Number(mapRows[0].created_by) !== Number(req.user.id)) {
            return res.status(403).json({ error: "Only the creator can edit this map" });
        }

        const fields = [];
        const values = [];
        if (name !== undefined) { fields.push("name = ?"); values.push(name.trim()); }
        if (description !== undefined) { fields.push("description = ?"); values.push(description || null); }
        if (is_public !== undefined) { fields.push("is_public = ?"); values.push(is_public ? 1 : 0); }

        if (fields.length > 0) {
            values.push(mapId);
            await query(`UPDATE maps SET ${fields.join(", ")} WHERE id = ?`, values);
        }

        let keptLocked = 0;
        if (sanitizedPositions) {
            const existingRows = await query(
                "SELECT map_position_id FROM map_positions WHERE map_id = ?",
                [mapId]
            );
            const existingIds = new Set(existingRows.map((r) => Number(r.map_position_id)));
            const submittedIds = new Set(
                sanitizedPositions.map((p) => p.id).filter((id) => id !== null && existingIds.has(id))
            );

            for (const position of sanitizedPositions) {
                if (position.id !== null && existingIds.has(position.id)) {
                    await updateMapPositionWithFallbacks(mapId, position.id, position);
                } else {
                    await insertMapPositionWithFallbacks(mapId, position);
                }
            }

            for (const existingId of existingIds) {
                if (submittedIds.has(existingId)) continue;
                try {
                    await query(
                        "DELETE FROM map_positions WHERE map_position_id = ? AND map_id = ?",
                        [existingId, mapId]
                    );
                } catch {
                    keptLocked += 1;
                }
            }
        }

        return res.json({ ok: true, map_id: mapId, kept_locked_positions: keptLocked });
    } catch (error) {
        console.error("[mapRoutes] update failed", error?.message);
        return res.status(500).json({ error: "Failed to update map" });
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

router.delete("/:id", middleware, async (req, res) => {
    const mapId = Number(req.params.id);
    if (!Number.isInteger(mapId) || mapId <= 0) {
        return res.status(400).json({ error: "Invalid map id" });
    }

    try {
        const mapRows = await query("SELECT created_by FROM maps WHERE id = ?", [mapId]);
        if (mapRows.length === 0) {
            return res.status(404).json({ error: "Map not found" });
        }
        if (Number(mapRows[0].created_by) !== Number(req.user.id)) {
            return res.status(403).json({ error: "Only the creator can delete this map" });
        }

        await query("DELETE FROM map_positions WHERE map_id = ?", [mapId]);
        await query("DELETE FROM maps WHERE id = ?", [mapId]);
        return res.json({ ok: true });
    } catch (error) {
        console.error("[mapRoutes] delete failed", error?.message);
        return res.status(500).json({ error: error?.message || "Failed to delete map" });
    }
});

module.exports = router;