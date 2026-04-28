const express = require("express");
const router = express.Router();
const db = require("../database");
const { adminMiddleware } = require("../auth");

router.use(adminMiddleware);

router.get("/overview", async (req, res) => {
    try {
        const [users] = await db.query("SELECT COUNT(*) AS count FROM users");
        const [admins] = await db.query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
        const [games] = await db.query("SELECT COUNT(*) AS count FROM games");
        const [maps] = await db.query("SELECT COUNT(*) AS count FROM maps");
        res.json({
            users: Number(users?.count) || 0,
            admins: Number(admins?.count) || 0,
            games: Number(games?.count) || 0,
            maps: Number(maps?.count) || 0,
        });
    } catch (error) {
        console.error("[admin] overview failed", error?.message);
        res.status(500).json({ error: "Failed to load overview" });
    }
});

router.get("/users", async (req, res) => {
    try {
        const rows = await db.query(
            "SELECT id, username, email, role, is_restricted FROM users ORDER BY id DESC LIMIT 500"
        );
        res.json(rows);
    } catch (error) {
        console.error("[admin] list users failed", error?.message);
        res.status(500).json({ error: "Failed to load users" });
    }
});

router.patch("/users/:id/restrict", async (req, res) => {
    const id = Number(req.params.id);
    const { is_restricted } = req.body || {};
    if (!id || typeof is_restricted !== "boolean") {
        return res.status(400).json({ error: "Invalid id or is_restricted" });
    }
    if (id === Number(req.user.id)) {
        return res.status(400).json({ error: "You cannot restrict yourself" });
    }
    try {
        const rows = await db.query("SELECT role FROM users WHERE id = ?", [id]);
        if (rows.length === 0) return res.status(404).json({ error: "User not found" });
        if (rows[0].role === "admin") {
            return res.status(400).json({ error: "Admin accounts cannot be restricted" });
        }
        await db.query("UPDATE users SET is_restricted = ? WHERE id = ?", [is_restricted ? 1 : 0, id]);
        res.json({ ok: true });
    } catch (error) {
        console.error("[admin] restrict toggle failed", error?.message);
        res.status(500).json({ error: "Failed to update user" });
    }
});

router.patch("/users/:id/role", async (req, res) => {
    const id = Number(req.params.id);
    const { role } = req.body || {};
    if (!id || (role !== "admin" && role !== "user")) {
        return res.status(400).json({ error: "Invalid id or role" });
    }

    if (id === Number(req.user.id) && role !== "admin") {
        return res.status(400).json({ error: "You cannot demote yourself" });
    }

    try {
        const result = await db.query("UPDATE users SET role = ? WHERE id = ?", [role, id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "User not found" });
        }
        res.json({ ok: true });
    } catch (error) {
        console.error("[admin] update role failed", error?.message);
        res.status(500).json({ error: "Failed to update role" });
    }
});

router.delete("/users/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    if (id === Number(req.user.id)) {
        return res.status(400).json({ error: "You cannot delete yourself" });
    }

    const mapsAction = (req.body?.maps_action || req.query?.maps_action || "delete").toString();
    if (mapsAction !== "delete" && mapsAction !== "transfer") {
        return res.status(400).json({ error: "maps_action must be 'delete' or 'transfer'" });
    }

    try {
        if (mapsAction === "transfer") {
            await db.query("UPDATE maps SET created_by = ? WHERE created_by = ?", [req.user.id, id]);
        } else {
            const userMaps = await db.query("SELECT id FROM maps WHERE created_by = ?", [id]);
            for (const row of userMaps) {
                await db.query("DELETE FROM map_positions WHERE map_id = ?", [row.id]).catch(() => {});
                await db.query("DELETE FROM maps WHERE id = ?", [row.id]).catch(() => {});
            }
        }

        const result = await db.query("DELETE FROM users WHERE id = ?", [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "User not found" });
        }
        res.json({ ok: true, maps_action: mapsAction });
    } catch (error) {
        console.error("[admin] delete user failed", error?.message);
        res.status(500).json({ error: error.message || "Failed to delete user" });
    }
});

router.get("/maps", async (req, res) => {
    try {
        let rows;
        try {
            rows = await db.query(
                `SELECT m.id, m.name, m.description, m.is_daily, m.is_public, m.is_forced_popular,
                        m.is_dynamic, m.created_by, u.username AS creator_username
                 FROM maps m
                 LEFT JOIN users u ON u.id = m.created_by
                 ORDER BY m.id DESC
                 LIMIT 500`
            );
        } catch {
            rows = await db.query(
                `SELECT m.id, m.name, m.description, m.is_daily, m.is_public, m.is_forced_popular,
                        m.created_by, u.username AS creator_username
                 FROM maps m
                 LEFT JOIN users u ON u.id = m.created_by
                 ORDER BY m.id DESC
                 LIMIT 500`
            );
            rows = rows.map((r) => ({ ...r, is_dynamic: 0 }));
        }
        res.json(rows);
    } catch (error) {
        console.error("[admin] list maps failed", error?.message);
        res.status(500).json({ error: "Failed to load maps" });
    }
});

router.patch("/maps/:id/public", async (req, res) => {
    const id = Number(req.params.id);
    const { is_public } = req.body || {};
    if (!id || typeof is_public !== "boolean") {
        return res.status(400).json({ error: "Invalid id or is_public" });
    }
    try {
        const result = await db.query(
            "UPDATE maps SET is_public = ? WHERE id = ?",
            [is_public ? 1 : 0, id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Map not found" });
        }
        res.json({ ok: true });
    } catch (error) {
        console.error("[admin] toggle public failed", error?.message);
        res.status(500).json({ error: "Failed to update map" });
    }
});

router.patch("/maps/:id/forced-popular", async (req, res) => {
    const id = Number(req.params.id);
    const { is_forced_popular } = req.body || {};
    if (!id || typeof is_forced_popular !== "boolean") {
        return res.status(400).json({ error: "Invalid id or is_forced_popular" });
    }
    try {
        const result = await db.query(
            "UPDATE maps SET is_forced_popular = ? WHERE id = ?",
            [is_forced_popular ? 1 : 0, id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Map not found" });
        }
        res.json({ ok: true });
    } catch (error) {
        console.error("[admin] toggle forced popular failed", error?.message);
        res.status(500).json({ error: "Failed to update map" });
    }
});

router.delete("/maps/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    try {
        await db.query("DELETE FROM map_positions WHERE map_id = ?", [id]).catch(() => {});
        const result = await db.query("DELETE FROM maps WHERE id = ?", [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Map not found" });
        }
        res.json({ ok: true });
    } catch (error) {
        console.error("[admin] delete map failed", error?.message);
        res.status(500).json({ error: "Failed to delete map" });
    }
});

const apiUsage = require("../apiUsage");

router.get("/api-usage", async (req, res) => {
    try {
        const rows = apiUsage.snapshot();
        const userIds = rows
            .filter((r) => !r.is_guest && r.user_id)
            .map((r) => Number(r.user_id));

        let usernameById = new Map();
        let gamesById = new Map();
        if (userIds.length > 0) {
            const placeholders = userIds.map(() => "?").join(",");
            const userRows = await db.query(
                `SELECT id, username, is_restricted, role FROM users WHERE id IN (${placeholders})`,
                userIds
            );
            usernameById = new Map(userRows.map((u) => [Number(u.id), u]));

            for (const uid of userIds) {
                const needle = `%"side":"${uid}"%`;
                const [count] = await db.query(
                    "SELECT COUNT(*) AS n FROM games WHERE one_side LIKE ? OR second_side LIKE ?",
                    [needle, needle]
                );
                gamesById.set(uid, Number(count?.n) || 0);
            }
        }

        const enriched = rows.map((r) => {
            const u = !r.is_guest && r.user_id ? usernameById.get(Number(r.user_id)) : null;
            return {
                ...r,
                username: u?.username || (r.is_guest ? `Guest ${r.user_id ?? "?"}` : `#${r.user_id ?? "?"}`),
                role: u?.role || (r.is_guest ? "guest" : "user"),
                is_restricted: u ? Boolean(u.is_restricted) : false,
                games_played: r.is_guest ? null : (gamesById.get(Number(r.user_id)) || 0),
            };
        });

        res.json(enriched);
    } catch (error) {
        console.error("[admin] api-usage failed", error?.message);
        res.status(500).json({ error: "Failed to load API usage" });
    }
});

router.post("/api-usage/reset", (req, res) => {
    apiUsage.reset();
    res.json({ ok: true });
});

router.get("/dev-mode", (req, res) => {
    res.json({ dev_mode: process.env.DEV_MODE === "true" });
});

router.post("/dev-mode", (req, res) => {
    const { enabled } = req.body || {};
    if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled (boolean) required" });
    }
    process.env.DEV_MODE = enabled ? "true" : "false";
    console.log(`[admin] DEV_MODE set to ${process.env.DEV_MODE} by user ${req.user?.id}`);
    res.json({ dev_mode: process.env.DEV_MODE === "true" });
});

module.exports = router;
