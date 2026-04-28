require("dotenv").config();
const jsonwebtoken = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET

const generateToken = (user, expiresIn = "7d") => {
    const payload = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role || "user",
        verified: user.verified === 1 || user.verified === true || user.verified === "1",
        account_type: user.account_type || "internal",
    };
    return jsonwebtoken.sign(payload, JWT_SECRET, { expiresIn });
}

const generateGuestToken = (guest) => {
    const payload = {
        id: guest.id,
        username: guest.display_name,
        is_guest: true,
    };
    return jsonwebtoken.sign(payload, JWT_SECRET, { expiresIn: "1d" });
}

const generateEmailVerifyToken = (user) => {
    return jsonwebtoken.sign(
        { uid: user.id, kind: "verify_email" },
        JWT_SECRET,
        { expiresIn: "1d" }
    );
}

const verifyToken = (token) => {
    try {
        return jsonwebtoken.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
}

const middleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Authorization header missing or malformed" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);
    if (!decoded || decoded.is_guest) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }

    const devMode = process.env.DEV_MODE === "true";
    if (devMode && decoded.role !== "admin") {
        return res.status(403).json({ error: "Under development due to ongoing updates. Check back later!" });
    }

    req.user = decoded;
    next();
}

const requireVerified = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (req.user.role === "admin") return next();
    if (req.user.verified) return next();
    return res.status(403).json({
        error: "Please verify your email to play.",
        code: "EMAIL_NOT_VERIFIED",
    });
}

const adminMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Authorization header missing or malformed" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);
    if (!decoded || decoded.is_guest) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }

    if (decoded.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
    }

    req.user = decoded;
    next();
}

const userOrGuestMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Authorization header missing or malformed" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }

    const devMode = process.env.DEV_MODE === "true";
    if (devMode && !decoded.is_guest && decoded.role !== "admin") {
        return res.status(403).json({ error: "Under development due to ongoing updates. Check back later!" });
    }

    req.user = decoded;
    next();
}

module.exports = {
    generateToken,
    generateGuestToken,
    generateEmailVerifyToken,
    verifyToken,
    middleware,
    requireVerified,
    adminMiddleware,
    userOrGuestMiddleware,
}
