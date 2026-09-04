import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme, PALETTES } from "../context/ThemeContext.jsx";

export default function NavBar() {
    const { user, signOut } = useAuth();
    const { mode, palette, toggleMode, setPalette } = useTheme();
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(e) {
            if (
                menuOpen &&
                menuRef.current &&
                !menuRef.current.contains(e.target)
            ) {
                setMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () =>
            document.removeEventListener("mousedown", handleClickOutside);
    }, [menuOpen]);

    async function handleSignOut() {
        setMenuOpen(false);
        await signOut();
        navigate("/");
    }

    const initial = user?.email?.[0]?.toUpperCase() || "?";

    return (
        <header className="navbar">
            <Link to="/" className="brand">
                QuizLEPT
            </Link>
            <nav className="nav-links">
                {user && <Link to="/library">Library</Link>}

                <button
                    className="theme-toggle"
                    onClick={toggleMode}
                    aria-label="Toggle dark mode"
                >
                    {mode === "dark" ? "☀️" : "🌙"}
                </button>

                {user ? (
                    <div className="user-menu-wrap" ref={menuRef}>
                        <button
                            className="user-avatar-btn"
                            onClick={() => setMenuOpen((o) => !o)}
                            aria-label="Account menu"
                        >
                            {initial}
                        </button>
                        {menuOpen && (
                            <div className="user-menu">
                                <div className="user-menu-email">
                                    {user.email}
                                </div>

                                <div className="user-menu-section-label">
                                    Color Theme
                                </div>
                                <div className="palette-swatch-row">
                                    {PALETTES.map((p) => (
                                        <button
                                            key={p.id}
                                            className={`palette-swatch ${palette === p.id ? "active" : ""}`}
                                            style={{ background: p.swatch }}
                                            onClick={() => setPalette(p.id)}
                                            aria-label={p.label}
                                            title={p.label}
                                        />
                                    ))}
                                </div>

                                <button
                                    className="user-menu-signout"
                                    onClick={handleSignOut}
                                >
                                    Sign out
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <Link to="/auth" className="btn btn-sm">
                        Sign in
                    </Link>
                )}
            </nav>
        </header>
    );
}
