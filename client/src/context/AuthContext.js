import { createContext, useContext, useEffect, useMemo, useState } from "react";

const AUTH_STORAGE_KEY = "geoworld-auth";
const USER_API_BASE_URL = process.env.REACT_APP_API_URL + "/users" || "http://localhost:3000/api/users";
console.log("Using API base URL:", USER_API_BASE_URL, process.env.REACT_APP_API_URL);

const AuthContext = createContext(null);

function readStoredAuth() {
    try {
        const storedValue = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!storedValue) {
            return null;
        }

        const parsedValue = JSON.parse(storedValue);
        if (!parsedValue?.token) {
            return null;
        }

        return {
            token: parsedValue.token,
            user: parsedValue.user || null,
        };
    } catch {
        return null;
    }
}

function decodeToken(token) {
    const tokenParts = token.split(".");
    if (tokenParts.length !== 3) {
        return null;
    }

    try {
        const payload = tokenParts[1]
            .replace(/-/g, "+")
            .replace(/_/g, "/")
            .padEnd(Math.ceil(tokenParts[1].length / 4) * 4, "=");
        const decodedPayload = JSON.parse(window.atob(payload));

        return {
            id: decodedPayload.id,
            username: decodedPayload.username,
            email: decodedPayload.email,
            role: decodedPayload.role || "user",
        };
    } catch {
        return null;
    }
}

async function requestUserAuth(path, body) {
    const response = await fetch(`${USER_API_BASE_URL}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    const responseBody = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(responseBody?.error || "Unable to complete authentication");
    }

    return responseBody;
}

function buildAuthState(token, fallbackUser = null) {
    return {
        token,
        user: decodeToken(token) || fallbackUser,
    };
}

export function AuthProvider({ children }) {
    const [auth, setAuth] = useState(() => readStoredAuth());

    useEffect(() => {
        if (auth) {
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
            return;
        }

        localStorage.removeItem(AUTH_STORAGE_KEY);
    }, [auth]);

    const value = useMemo(() => {
        const login = async (credentials) => {
            if (credentials?.token) {
                const nextAuth = buildAuthState(credentials.token, credentials.user || null);

                setAuth(nextAuth);
                return nextAuth;
            }

            const { email, password } = credentials || {};
            const { token } = await requestUserAuth("/login", { email, password });
            const nextAuth = buildAuthState(token);

            setAuth(nextAuth);
            return nextAuth;
        };

        const register = async (userDetails) => {
            const { username, email, password } = userDetails || {};

            await requestUserAuth("/register", { username, email, password });

            return login({ email, password });
        };

        const changePassword = async (currentPassword, newPassword) => {
            if (!auth?.token) {
                throw new Error("Not authenticated");
            }

            const response = await fetch(`${USER_API_BASE_URL}/change-password`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${auth.token}`,
                },
                body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
            });

            if (!response.ok) {
                throw new Error("Failed to change password");
            }

            return response.json();
        };

        const logout = () => {
            setAuth(null);
        };

        return {
            token: auth?.token ?? null,
            user: auth?.user ?? null,
            isLoggedIn: Boolean(auth?.token),
            isAdmin: auth?.user?.role === "admin",
            login,
            register,
            changePassword,
            logout,
        };
    }, [auth]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error("useAuth must be used inside AuthProvider");
    }

    return context;
}