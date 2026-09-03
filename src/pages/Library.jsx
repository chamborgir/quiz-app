import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import {
    listQuizzes,
    renameQuiz,
    deleteQuiz,
    shareQuiz,
    unshareQuiz,
    listAttempts,
} from "../lib/quizApi.js";

export default function Library({ setActiveQuiz }) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [quizzes, setQuizzes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [editValue, setEditValue] = useState("");
    const [expandedId, setExpandedId] = useState(null);
    const [attempts, setAttempts] = useState({});
    const [shareLinks, setShareLinks] = useState({});

    useEffect(() => {
        load();
    }, []);

    async function load() {
        setLoading(true);
        try {
            const data = await listQuizzes(user.id);
            setQuizzes(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    function startPlay(quiz) {
        setActiveQuiz({
            mode: quiz.mode,
            questions: quiz.questions,
            quizId: quiz.id,
            title: quiz.title,
            recordAttempts: true,
        });
        navigate("/play");
    }

    function startEdit(quiz) {
        setEditingId(quiz.id);
        setEditValue(quiz.title);
    }

    async function saveEdit(quizId) {
        const title = editValue.trim();
        if (title) {
            await renameQuiz(quizId, title);
            setQuizzes((prev) =>
                prev.map((q) => (q.id === quizId ? { ...q, title } : q)),
            );
        }
        setEditingId(null);
    }

    async function handleDelete(quizId) {
        if (!confirm("Delete this quiz permanently?")) return;
        await deleteQuiz(quizId);
        setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
    }

    async function handleShare(quiz) {
        const code = await shareQuiz(quiz.id, quiz.share_code);
        const link = `${window.location.origin}/shared/${code}`;
        setShareLinks((prev) => ({ ...prev, [quiz.id]: link }));
        setQuizzes((prev) =>
            prev.map((q) =>
                q.id === quiz.id
                    ? { ...q, is_public: true, share_code: code }
                    : q,
            ),
        );
        await navigator.clipboard.writeText(link).catch(() => {});
    }

    async function handleUnshare(quiz) {
        await unshareQuiz(quiz.id);
        setQuizzes((prev) =>
            prev.map((q) =>
                q.id === quiz.id ? { ...q, is_public: false } : q,
            ),
        );
        setShareLinks((prev) => ({ ...prev, [quiz.id]: "" }));
    }

    async function toggleHistory(quiz) {
        if (expandedId === quiz.id) {
            setExpandedId(null);
            return;
        }
        setExpandedId(quiz.id);
        if (!attempts[quiz.id]) {
            const data = await listAttempts(quiz.id);
            setAttempts((prev) => ({ ...prev, [quiz.id]: data }));
        }
    }

    if (loading)
        return <div className="page-loading">Loading your library…</div>;

    return (
        <div className="page">
            <h2>My Library</h2>
            {quizzes.length === 0 && (
                <p className="muted">
                    No saved quizzes yet. Generate one from the home page.
                </p>
            )}

            {quizzes.map((quiz) => (
                <div key={quiz.id} className="card library-item">
                    <div className="library-header">
                        {editingId === quiz.id ? (
                            <input
                                className="inline-input"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) =>
                                    e.key === "Enter" && saveEdit(quiz.id)
                                }
                                autoFocus
                            />
                        ) : (
                            <h3>{quiz.title}</h3>
                        )}
                        <span className={`badge ${quiz.mode}`}>
                            {quiz.mode === "mcq"
                                ? "Multiple Choice"
                                : "Flashcards"}
                        </span>
                    </div>

                    <p className="muted small">
                        {quiz.count} items · created{" "}
                        {new Date(quiz.created_at).toLocaleDateString()}
                    </p>

                    <div className="library-actions">
                        <button
                            className="btn btn-sm"
                            onClick={() => startPlay(quiz)}
                        >
                            Play
                        </button>
                        {editingId === quiz.id ? (
                            <button
                                className="btn-text"
                                onClick={() => saveEdit(quiz.id)}
                            >
                                Save name
                            </button>
                        ) : (
                            <button
                                className="btn-text"
                                onClick={() => startEdit(quiz)}
                            >
                                Rename
                            </button>
                        )}
                        {quiz.mode === "mcq" && (
                            <button
                                className="btn-text"
                                onClick={() => toggleHistory(quiz)}
                            >
                                {expandedId === quiz.id
                                    ? "Hide history"
                                    : "History"}
                            </button>
                        )}
                        {quiz.is_public ? (
                            <button
                                className="btn-text"
                                onClick={() => handleUnshare(quiz)}
                            >
                                Unshare
                            </button>
                        ) : (
                            <button
                                className="btn-text"
                                onClick={() => handleShare(quiz)}
                            >
                                Share
                            </button>
                        )}
                        <button
                            className="btn-text danger"
                            onClick={() => handleDelete(quiz.id)}
                        >
                            Delete
                        </button>
                    </div>

                    {shareLinks[quiz.id] && (
                        <div className="share-link-box">
                            <input
                                readOnly
                                value={shareLinks[quiz.id]}
                                onFocus={(e) => e.target.select()}
                            />
                            <span className="copied-tag">Link copied</span>
                        </div>
                    )}

                    {expandedId === quiz.id && (
                        <div className="attempt-history">
                            {(attempts[quiz.id] || []).length === 0 && (
                                <p className="muted small">No attempts yet.</p>
                            )}
                            {(attempts[quiz.id] || []).map((a) => (
                                <div key={a.id} className="attempt-row">
                                    <span>
                                        {a.score} / {a.total}
                                    </span>
                                    <span className="muted small">
                                        {new Date(
                                            a.attempted_at,
                                        ).toLocaleString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
