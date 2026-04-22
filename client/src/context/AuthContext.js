import { createContext, useContext, useEffect, useMemo, useState } from "react";

const AUTH_STORAGE_KEY = "geoworld-auth";

const AuthContext = createContext(null);

function readStoredAuth() {
    try {
        const storedValue = localStorage.getItem(AUTH_STORAGE_KEY);
        return storedValue ? JSON.parse(storedValue) : null;
    } catch {
        return null;
    }
}

function buildToken() {
    if (window.crypto?.randomUUID) {
        return window.crypto.randomUUID();
    }

    return `token-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
        const login = (userData) => {
            const nextAuth = {
                token: userData.token || buildToken(),
                user: userData.user || null,
            };

            setAuth(nextAuth);
            return nextAuth;
        };

        const logout = () => {
            setAuth(null);
        };

        return {
            token: auth?.token ?? null,
            user: auth?.user ?? null,
            isLoggedIn: Boolean(auth?.token),
            login,
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