import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient.js";

export default function AuthPage() {
    const [mode, setMode] = useState("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            if (mode === "login") {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                navigate("/");
            } else {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                });
                if (error) throw error;
                navigate("/"); // no email confirmation needed — signed in immediately
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="page-center">
            <div className="card auth-card">
                <h2>
                    {mode === "login" ? "Welcome back" : "Create your account"}
                </h2>
                <p className="muted">
                    {mode === "login"
                        ? "Sign in to access your saved quizzes."
                        : "Save quizzes, track scores, and share with others."}
                </p>

                {mode === "signup" && (
                    <div className="warning-box">
                        ⚠️ Your password isn't recoverable if forgotten —
                        there's no "reset password" flow set up. Take a
                        screenshot or save it somewhere safe.
                    </div>
                )}

                {error && <div className="error-box">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="field">
                        <label>Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div className="field">
                        <label>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                        />
                    </div>
                    <button
                        className="btn btn-block"
                        type="submit"
                        disabled={loading}
                    >
                        {loading
                            ? "Please wait…"
                            : mode === "login"
                              ? "Sign In"
                              : "Sign Up"}
                    </button>
                </form>
                <p className="switch-mode">
                    {mode === "login"
                        ? "Don't have an account? "
                        : "Already have an account? "}
                    <button
                        className="link-btn"
                        onClick={() =>
                            setMode(mode === "login" ? "signup" : "login")
                        }
                    >
                        {mode === "login" ? "Sign up" : "Sign in"}
                    </button>
                </p>
            </div>
        </div>
    );
}
