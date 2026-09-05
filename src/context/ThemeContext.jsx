import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { getPreferences, upsertPreferences } from "../lib/preferencesApi.js";

const ThemeContext = createContext(null);

export const PALETTES = [
    { id: "cream", label: "Cream", swatch: "#F0B94A" },
    { id: "pink", label: "Pink", swatch: "#E8A6C1" },
    { id: "blue", label: "Blue", swatch: "#8EBBE0" },
    { id: "green", label: "Green", swatch: "#93C9A5" },
    { id: "purple", label: "Purple", swatch: "#B79FD9" },
    { id: "red", label: "Red", swatch: "#E39A97" },
    { id: "brown", label: "Brown", swatch: "#B8967A" },
];

export function ThemeProvider({ children }) {
    const { user } = useAuth();

    const [mode, setMode] = useState(() => {
        const saved = localStorage.getItem("theme_mode");
        if (saved) return saved;
        return window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
    });

    const [palette, setPaletteState] = useState(
        () => localStorage.getItem("theme_palette") || "cream",
    );

    const hasLoadedForUser = useRef(null); // tracks which user's cloud prefs we've already fetched

    // Apply to DOM + localStorage (works for both signed-in and guest users)
    useEffect(() => {
        document.documentElement.setAttribute("data-theme", mode);
        localStorage.setItem("theme_mode", mode);
    }, [mode]);

    useEffect(() => {
        document.documentElement.setAttribute("data-palette", palette);
        localStorage.setItem("theme_palette", palette);
    }, [palette]);

    // On sign-in: pull saved preference from Supabase (cloud wins over local device value)
    useEffect(() => {
        if (!user) {
            hasLoadedForUser.current = null;
            return;
        }
        if (hasLoadedForUser.current === user.id) return; // already synced this session

        (async () => {
            try {
                const prefs = await getPreferences(user.id);
                if (prefs) {
                    setMode(prefs.theme_mode);
                    setPaletteState(prefs.theme_palette);
                } else {
                    // First time this account has ever set a preference — save current local value as their default
                    await upsertPreferences(user.id, {
                        theme_mode: mode,
                        theme_palette: palette,
                    });
                }
                hasLoadedForUser.current = user.id;
            } catch (err) {
                console.error("Failed to load theme preferences:", err.message);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    function toggleMode() {
        const next = mode === "dark" ? "light" : "dark";
        setMode(next);
        if (user) {
            upsertPreferences(user.id, {
                theme_mode: next,
                theme_palette: palette,
            }).catch((err) =>
                console.error("Failed to save theme preference:", err.message),
            );
        }
    }

    function setPalette(id) {
        setPaletteState(id);
        if (user) {
            upsertPreferences(user.id, {
                theme_mode: mode,
                theme_palette: id,
            }).catch((err) =>
                console.error("Failed to save theme preference:", err.message),
            );
        }
    }

    return (
        <ThemeContext.Provider
            value={{ mode, palette, toggleMode, setPalette }}
        >
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
