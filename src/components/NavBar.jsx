import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";

export default function NavBar() {
    const { user, signOut } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();

    async function handleSignOut() {
        await signOut();
        navigate("/");
    }

    return (
        <header className="navbar">
            <Link to="/" className="brand">
                QuizLEPT
            </Link>
            <nav className="nav-links">
                {user && <Link to="/library">Library</Link>}
                <button
                    className="theme-toggle"
                    onClick={toggleTheme}
                    aria-label="Toggle dark mode"
                >
                    {theme === "dark" ? "☀️" : "🌙"}
                </button>
                {user ? (
                    <div className="nav-user">
                        <span className="nav-email">{user.email}</span>
                        <button className="btn-text" onClick={handleSignOut}>
                            Sign out
                        </button>
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
