require("dotenv").config();
const jsonwebtoken = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET

const generateToken = (user, expiresIn = "7d") => {
    const payload = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role || "user",
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

    req.user = decoded;
    next();
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

    req.user = decoded;
    next();
}

module.exports = {
    generateToken,
    generateGuestToken,
    verifyToken,
    middleware,
    adminMiddleware,
    userOrGuestMiddleware,
}