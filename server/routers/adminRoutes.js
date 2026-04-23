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
            "SELECT id, username, email, role FROM users ORDER BY id DESC LIMIT 500"
        );
        res.json(rows);
    } catch (error) {
        console.error("[admin] list users failed", error?.message);
        res.status(500).json({ error: "Failed to load users" });
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

    try {
        const result = await db.query("DELETE FROM users WHERE id = ?", [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "User not found" });
        }
        res.json({ ok: true });
    } catch (error) {
        console.error("[admin] delete user failed", error?.message);
        res.status(500).json({ error: "Failed to delete user" });
    }
});

router.get("/maps", async (req, res) => {
    try {
        const rows = await db.query(
            `SELECT m.id, m.name, m.description, m.is_daily, m.created_by, u.username AS creator_username
             FROM maps m
             LEFT JOIN users u ON u.id = m.created_by
             ORDER BY m.id DESC
             LIMIT 500`
        );
        res.json(rows);
    } catch (error) {
        console.error("[admin] list maps failed", error?.message);
        res.status(500).json({ error: "Failed to load maps" });
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

module.exports = router;
