const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const router = express.Router();
const db = require("../database");
const { generateToken } = require("../auth");

const FRONTEND_URL = process.env.FRONTEND_URL || "https://geoworld.byenoob.com";

// CSRF state cache: state -> { provider, expires }
const oauthStates = new Map();
function issueState(provider) {
    const state = crypto.randomBytes(16).toString("hex");
    oauthStates.set(state, { provider, expires: Date.now() + 10 * 60 * 1000 });
    return state;
}
function consumeState(state, provider) {
    const entry = oauthStates.get(state);
    if (!entry) return false;
    oauthStates.delete(state);
    if (entry.expires < Date.now()) return false;
    return entry.provider === provider;
}

function sanitizeUsername(raw) {
    let base = String(raw || "user").trim().replace(/[^A-Za-z0-9_.\-]/g, "_");
    base = base.slice(0, 20);
    if (base.length < 2) base = `user_${crypto.randomBytes(2).toString("hex")}`;
    return base;
}

async function findOrCreateOauthUser({ email, accountType, providerName }) {
    if (!email) throw new Error(`No email returned from ${accountType}`);

    const existing = await db.query(
        "SELECT id, username, email, role, is_restricted, verified, account_type FROM users WHERE email = ?",
        [email]
    );
    if (existing.length > 0) {
        const u = existing[0];
        if (u.account_type && u.account_type !== accountType) {
            const err = new Error(
                `An account with this email already exists using ${u.account_type} sign-in. Log in there instead.`
            );
            err.code = "ACCOUNT_TYPE_MISMATCH";
            throw err;
        }
        return u;
    }

    let username = sanitizeUsername(providerName || email.split("@")[0]);
    for (let attempt = 0; attempt < 6; attempt += 1) {
        const dup = await db.query("SELECT id FROM users WHERE username = ?", [username]);
        if (dup.length === 0) break;
        username = `${sanitizeUsername(providerName || email.split("@")[0])}_${crypto.randomBytes(2).toString("hex")}`;
    }

    const randomPassword = await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10);
    const result = await db.query(
        "INSERT INTO users (email, username, password, account_type, verified) VALUES (?, ?, ?, ?, 1)",
        [email, username, randomPassword, accountType]
    );
    return {
        id: result.insertId,
        username,
        email,
        role: "user",
        verified: 1,
        account_type: accountType,
    };
}

function redirectWithToken(res, token) {
    return res.redirect(`https://geoworld.pnglin.byenoob.com/oauth/callback?token=${encodeURIComponent(token)}`);
}

function redirectWithError(res, message) {
    return res.redirect(`${FRONTEND_URL}/login?message=${encodeURIComponent(message)}`);
}

// ---------- Discord ----------

router.get("/discord", (req, res) => {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const redirectUri = process.env.DISCORD_REDIRECT_URI;
    if (!clientId || !redirectUri) {
        return res.status(500).send("Discord OAuth not configured");
    }
    const state = issueState("discord");
    const url = new URL("https://discord.com/oauth2/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "identify email");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
});

router.get("/discord/callback", async (req, res) => {
    const { code, state } = req.query;
    if (!code || !state || !consumeState(String(state), "discord")) {
        return redirectWithError(res, "Discord login was cancelled or expired");
    }
    try {
        const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: "authorization_code",
                code: String(code),
                redirect_uri: process.env.DISCORD_REDIRECT_URI,
            }),
        });
        const tokenBody = await tokenRes.json();
        if (!tokenRes.ok || !tokenBody.access_token) {
            console.error("[oauth/discord] token exchange failed", tokenBody);
            return redirectWithError(res, "Discord login failed");
        }
        const meRes = await fetch("https://discord.com/api/users/@me", {
            headers: { Authorization: `Bearer ${tokenBody.access_token}` },
        });
        const me = await meRes.json();
        if (!meRes.ok || !me.email) {
            return redirectWithError(res, "Discord did not return a verified email");
        }
        if (me.verified === false) {
            return redirectWithError(res, "Verify your Discord email first, then try again");
        }

        const user = await findOrCreateOauthUser({
            email: me.email,
            accountType: "discord",
            providerName: me.username || me.global_name,
        });
        if (Number(user.is_restricted) === 1) {
            return redirectWithError(res, "Your account is restricted");
        }
        const token = generateToken(user);
        return redirectWithToken(res, token);
    } catch (err) {
        console.error("[oauth/discord] callback error", err?.message);
        return redirectWithError(res, err?.message || "Discord login failed");
    }
});

// ---------- Google ----------

router.get("/google", (req, res) => {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
    if (!clientId || !redirectUri) {
        return res.status(500).send("Google OAuth not configured");
    }
    const state = issueState("google");
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");
    res.redirect(url.toString());
});

router.get("/google/callback", async (req, res) => {
    const { code, state } = req.query;
    if (!code || !state || !consumeState(String(state), "google")) {
        return redirectWithError(res, "Google login was cancelled or expired");
    }
    try {
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
                client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
                grant_type: "authorization_code",
                code: String(code),
                redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
            }),
        });
        const tokenBody = await tokenRes.json();
        if (!tokenRes.ok || !tokenBody.access_token) {
            console.error("[oauth/google] token exchange failed", tokenBody);
            return redirectWithError(res, "Google login failed");
        }
        const meRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${tokenBody.access_token}` },
        });
        const me = await meRes.json();
        if (!meRes.ok || !me.email) {
            return redirectWithError(res, "Google did not return an email");
        }
        if (me.email_verified === false) {
            return redirectWithError(res, "Verify your Google email first, then try again");
        }

        const user = await findOrCreateOauthUser({
            email: me.email,
            accountType: "google",
            providerName: me.name || me.given_name,
        });
        if (Number(user.is_restricted) === 1) {
            return redirectWithError(res, "Your account is restricted");
        }
        const token = generateToken(user);
        return redirectWithToken(res, token);
    } catch (err) {
        console.error("[oauth/google] callback error", err?.message);
        return redirectWithError(res, err?.message || "Google login failed");
    }
});

module.exports = router;
