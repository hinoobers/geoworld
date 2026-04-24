const express = require("express");
const router = express.Router();
const db = require("../database");
const bcrypt = require("bcrypt");
const { generateToken, middleware } = require("../auth");

function parseSide(raw) {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

const BANNED_USERNAME_TERMS = [
    "nigger", "nigga", "n1gger", "n1gga",
    "faggot", "fag", "f4ggot",
    "retard", "ret4rd",
    "tranny", "tr4nny",
    "wetback",
    "coon", "goon",
    "paki", "killyourself",
    "hitler", "heilhitler",
    "nazi", "naz1",
    "pedo", "pedophile",
    "rape", "rapist",
];

function normalizeForModeration(value) {
    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .replace(/0/g, "o")
        .replace(/1/g, "i")
        .replace(/3/g, "e")
        .replace(/4/g, "a")
        .replace(/5/g, "s")
        .replace(/7/g, "t");
}

function containsBannedTerm(value) {
    const normalized = normalizeForModeration(value);
    return BANNED_USERNAME_TERMS.some((term) => normalized.includes(normalizeForModeration(term)));
}

router.post("/register", async (req, res) => {
    const { email, username, password } = req.body;
    if (!email || !username || !password) {
        return res.status(400).json({ error: "Email, username, and password are required" });
    }

    if(typeof email !== "string" || typeof username !== "string" || typeof password !== "string") {
        return res.status(400).json({ error: "Email, username, and password must be strings" });
    }

    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 2 || trimmedUsername.length > 24) {
        return res.status(400).json({ error: "Username must be between 2 and 24 characters" });
    }
    if (!/^[A-Za-z0-9_.\-]+$/.test(trimmedUsername)) {
        return res.status(400).json({ error: "Username can only use letters, numbers, and _.-" });
    }
    if (containsBannedTerm(trimmedUsername)) {
        return res.status(400).json({ error: "Please choose a different username" });
    }

    if(password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }

    const existingUser = await db.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existingUser.length > 0) {
        return res.status(400).json({ error: "Email is already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.query("INSERT INTO users (email, username, password) VALUES (?, ?, ?)", [email, username, hashedPassword]);
    if(result.affectedRows === 0) {
        return res.status(500).json({ error: "Failed to create user" });
    }

    res.status(201).json({ id: result.insertId });
});

router.post("/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    if(typeof email !== "string" || typeof password !== "string") {
        return res.status(400).json({ error: "Email and password must be strings" });
    }

    const user = await db.query("SELECT id, username, email, password, role, is_restricted FROM users WHERE email = ?", [email]);
    if (user.length === 0) {
        // we don't want to reveal whether account exists, so use same error message for both cases
        return res.status(400).json({ error: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user[0].password);
    if (!isMatch) {
        return res.status(400).json({ error: "Invalid email or password" });
    }

    if (Number(user[0].is_restricted) === 1) {
        return res.status(403).json({
            error: "Your account is restricted, please contact hinoob@byenoob.com regarding this",
        });
    }

    const token = generateToken(user[0]);
    res.json({ token });
});

function findMySideAndOpponent(oneSide, secondSide, userIdNumeric) {
    const userIdStr = String(userIdNumeric);

    const matchesUser = (side) => {
        if (!side) return false;
        if (String(side.side) === userIdStr) return true;
        if (Array.isArray(side.user_ids) && side.user_ids.map(Number).includes(userIdNumeric)) return true;
        return false;
    };

    if (matchesUser(oneSide)) return { mine: oneSide, other: secondSide || null };
    if (matchesUser(secondSide)) return { mine: secondSide, other: oneSide || null };
    return { mine: null, other: null };
}

router.get("/me/stats", middleware, async (req, res) => {
    try {
        const userIdNumeric = Number(req.user.id);
        const singleNeedle = `%"side":"${userIdNumeric}"%`;
        const multiNeedle = `%"user_ids":%`;

        const games = await db.query(
            `SELECT game_id, mode, one_side, second_side, created_at
             FROM games
             WHERE one_side LIKE ? OR second_side LIKE ?
                OR one_side LIKE ? OR second_side LIKE ?
             ORDER BY game_id DESC`,
            [singleNeedle, singleNeedle, multiNeedle, multiNeedle]
        );

        const oneWeekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

        let gamesPlayedThisWeek = 0;
        let winStreak = 0;
        let streakOpen = true;
        let totalScore = 0;
        let totalMaxScore = 0;
        let completedGames = 0;

        for (const row of games) {
            const oneSide = parseSide(row.one_side);
            const secondSide = parseSide(row.second_side);

            const { mine: userSide, other: opponentSide } = findMySideAndOpponent(
                oneSide,
                secondSide,
                userIdNumeric
            );
            if (!userSide) continue;

            const score = Number(userSide.score) || 0;
            const totalRounds = Number(userSide.total_rounds) || 0;
            const status = userSide.status;

            if (status !== "completed") continue;

            completedGames += 1;

            const createdAtMs = row.created_at ? new Date(row.created_at).getTime() : null;
            if (createdAtMs && createdAtMs >= oneWeekAgoMs) {
                gamesPlayedThisWeek += 1;
            }

            if (totalRounds > 0) {
                totalScore += score;
                totalMaxScore += totalRounds * 5000;
            }

            if (streakOpen) {
                let isWin;
                if (row.mode === "multiplayer" && opponentSide) {
                    isWin = score > (Number(opponentSide.score) || 0);
                } else {
                    isWin = totalRounds > 0 && score >= totalRounds * 2500;
                }

                if (isWin) {
                    winStreak += 1;
                } else {
                    streakOpen = false;
                }
            }
        }

        const accuracy = totalMaxScore > 0
            ? Math.round((totalScore / totalMaxScore) * 100)
            : 0;

        return res.json({
            win_streak: winStreak,
            games_played_this_week: gamesPlayedThisWeek,
            accuracy,
            completed_games: completedGames,
        });
    } catch (error) {
        console.error("[userRoutes] stats failed", error?.message);
        return res.status(500).json({ error: "Failed to load stats" });
    }
});

router.get("/me/games", middleware, async (req, res) => {
    try {
        const userIdNumeric = Number(req.user.id);
        const singleNeedle = `%"side":"${userIdNumeric}"%`;
        const multiNeedle = `%"user_ids":%`;

        const rows = await db.query(
            `SELECT g.game_id, g.mode, g.one_side, g.second_side, g.map_id, g.created_at,
                    m.name AS map_name, m.is_public AS map_is_public, m.created_by AS map_created_by
             FROM games g
             LEFT JOIN maps m ON m.id = g.map_id
             WHERE g.one_side LIKE ? OR g.second_side LIKE ?
                OR g.one_side LIKE ? OR g.second_side LIKE ?
             ORDER BY g.game_id DESC
             LIMIT 200`,
            [singleNeedle, singleNeedle, multiNeedle, multiNeedle]
        );

        const opponentUserIds = new Set();
        for (const row of rows) {
            const oneSide = parseSide(row.one_side);
            const secondSide = parseSide(row.second_side);
            const { other } = findMySideAndOpponent(oneSide, secondSide, userIdNumeric);
            if (!other) continue;
            if (Array.isArray(other.user_ids)) {
                for (const uid of other.user_ids) {
                    const n = Number(uid);
                    if (n) opponentUserIds.add(n);
                }
            } else if (other.side) {
                const n = Number(other.side);
                if (n) opponentUserIds.add(n);
            }
        }

        let usernameById = new Map();
        if (opponentUserIds.size > 0) {
            const ids = Array.from(opponentUserIds);
            const placeholders = ids.map(() => "?").join(",");
            const userRows = await db.query(
                `SELECT id, username FROM users WHERE id IN (${placeholders})`,
                ids
            );
            usernameById = new Map(userRows.map((u) => [Number(u.id), u.username]));
        }

        const resolveOpponentName = (opponentSide) => {
            if (!opponentSide) return null;

            if (Array.isArray(opponentSide.members) && opponentSide.members.length > 0) {
                const names = opponentSide.members.map((member) => {
                    if (!member) return null;
                    if (member.is_guest === true) {
                        return member.display_name || "Guest";
                    }
                    if (member.user_id != null) {
                        return usernameById.get(Number(member.user_id)) || member.display_name || null;
                    }
                    return member.display_name || null;
                }).filter(Boolean);
                if (names.length > 0) return names.join(", ");
                return null;
            }

            if (Array.isArray(opponentSide.user_ids) && opponentSide.user_ids.length > 0) {
                const names = opponentSide.user_ids
                    .map((uid) => usernameById.get(Number(uid)))
                    .filter(Boolean);
                if (names.length > 0) return names.join(", ");
            }

            if (opponentSide.side) {
                const username = usernameById.get(Number(opponentSide.side));
                if (username) return username;
            }

            if (opponentSide.display_name && opponentSide.display_name !== opponentSide.side_label) {
                return opponentSide.display_name;
            }

            return null;
        };

        const games = rows
            .map((row) => {
                const oneSide = parseSide(row.one_side);
                const secondSide = parseSide(row.second_side);

                const { mine: userSide, other: opponentSide } = findMySideAndOpponent(
                    oneSide,
                    secondSide,
                    userIdNumeric
                );

                if (!userSide) return null;

                const score = Number(userSide.score) || 0;
                const totalRounds = Number(userSide.total_rounds) || 0;
                let status = userSide.status || "unknown";

                if (status === "active") {
                    const lastUpdateMs =
                        Date.parse(userSide.updated_at || "") ||
                        (row.created_at ? new Date(row.created_at).getTime() : 0);
                    const staleMs = 30 * 60 * 1000;
                    if (lastUpdateMs && Date.now() - lastUpdateMs > staleMs) {
                        status = "abandoned";
                    }
                }

                let result = null;
                if (row.mode === "multiplayer" && opponentSide) {
                    const opponentScore = Number(opponentSide.score) || 0;
                    if (score > opponentScore) result = "win";
                    else if (score < opponentScore) result = "loss";
                    else result = "draw";
                } else if (status === "completed" && totalRounds > 0) {
                    result = score >= totalRounds * 2500 ? "win" : "loss";
                }

                const opponentName = row.mode === "multiplayer"
                    ? resolveOpponentName(opponentSide)
                    : null;

                return {
                    game_id: row.game_id,
                    mode: row.mode,
                    status,
                    result,
                    score,
                    total_rounds: totalRounds,
                    map_id: row.map_id,
                    map_name: (() => {
                        if (!row.map_name) return "Deleted map";
                        const isPublic = Number(row.map_is_public) === 1;
                        const isMine = Number(row.map_created_by) === userIdNumeric;
                        if (isPublic || isMine) return row.map_name;
                        return "Private map";
                    })(),
                    opponent_name: opponentName,
                    opponent_score: opponentSide ? (Number(opponentSide.score) || 0) : null,
                    created_at: row.created_at || null,
                };
            })
            .filter(Boolean);

        return res.json(games);
    } catch (error) {
        console.error("[userRoutes] me/games failed", error?.message);
        return res.status(500).json({ error: "Failed to load games" });
    }
});

router.get("/leaderboard", async (req, res) => {
    try {
        const games = await db.query("SELECT mode, one_side, second_side FROM games");
        const perUser = new Map();

        const addForUser = (uid, scoreShare, totalRounds) => {
            if (!uid || totalRounds <= 0) return;
            const entry = perUser.get(uid) || { score: 0, max: 0, games_played: 0 };
            entry.score += scoreShare;
            entry.max += totalRounds * 5000;
            entry.games_played += 1;
            perUser.set(uid, entry);
        };

        const recordSide = (side, mode) => {
            if (!side || side.status !== "completed") return;
            const totalRounds = Number(side.total_rounds) || 0;
            if (totalRounds <= 0) return;

            if (mode === "multiplayer" && Array.isArray(side.user_ids) && side.user_ids.length > 0) {
                const n = side.user_ids.length;
                const share = (Number(side.score) || 0) / n;
                for (const uid of side.user_ids) addForUser(Number(uid), share, totalRounds);
            } else if (side.side) {
                addForUser(Number(side.side), Number(side.score) || 0, totalRounds);
            }
        };

        for (const row of games) {
            recordSide(parseSide(row.one_side), row.mode);
            recordSide(parseSide(row.second_side), row.mode);
        }

        const ids = [...perUser.keys()].filter(Boolean);
        if (ids.length === 0) return res.json([]);
        const placeholders = ids.map(() => "?").join(",");
        const users = await db.query(
            `SELECT id, username, is_restricted FROM users WHERE id IN (${placeholders})`,
            ids
        );
        const usernameById = new Map(
            users.filter((u) => Number(u.is_restricted) !== 1).map((u) => [Number(u.id), u.username])
        );

        const SMOOTH_ROUNDS = 20;
        const entries = [];
        for (const [uid, stats] of perUser.entries()) {
            const username = usernameById.get(Number(uid));
            if (!username) continue;
            const accuracyPct = stats.max > 0 ? (stats.score / stats.max) * 100 : 0;
            const rating = stats.max > 0
                ? (stats.score / (stats.max + SMOOTH_ROUNDS * 5000)) * 100
                : 0;
            entries.push({
                user_id: uid,
                username,
                games_played: stats.games_played,
                accuracy: Math.round(accuracyPct * 10) / 10,
                rating: Math.round(rating * 10) / 10,
            });
        }
        entries.sort((a, b) => b.rating - a.rating);
        return res.json(entries.slice(0, 100));
    } catch (error) {
        console.error("[userRoutes] leaderboard failed", error?.message);
        return res.status(500).json({ error: "Failed to load leaderboard" });
    }
});

module.exports = router;