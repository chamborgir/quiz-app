import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { getQuizByShareCode, cloneQuiz } from "../lib/quizApi.js";

export default function SharedQuiz({ setActiveQuiz }) {
    const { code } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [quiz, setQuiz] = useState(null);
    const [error, setError] = useState("");
    const [cloning, setCloning] = useState(false);

    useEffect(() => {
        getQuizByShareCode(code)
            .then(setQuiz)
            .catch(() =>
                setError(
                    "This shared quiz was not found or is no longer public.",
                ),
            );
    }, [code]);

    function handlePlay() {
        setActiveQuiz({
            mode: quiz.mode,
            questions: quiz.questions,
            quizId: null,
            title: quiz.title,
            recordAttempts: false,
        });
        navigate("/play");
    }

    async function handleSaveCopy() {
        if (!user) {
            navigate("/auth");
            return;
        }
        setCloning(true);
        try {
            const saved = await cloneQuiz(quiz, user.id);
            navigate("/library");
            void saved;
        } catch (err) {
            alert("Failed to save copy: " + err.message);
        } finally {
            setCloning(false);
        }
    }

    if (error)
        return (
            <div className="page">
                <div className="error-box">{error}</div>
            </div>
        );
    if (!quiz) return <div className="page-loading">Loading shared quiz…</div>;

    return (
        <div className="page">
            <div className="card center-content">
                <h2>{quiz.title}</h2>
                <p className="muted">
                    {quiz.count}{" "}
                    {quiz.mode === "mcq"
                        ? "multiple-choice questions"
                        : "flashcards"}{" "}
                    · shared with you
                </p>
                <div
                    className="nav-row"
                    style={{ justifyContent: "center", gap: "1rem" }}
                >
                    <button className="btn" onClick={handlePlay}>
                        Take Quiz
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={handleSaveCopy}
                        disabled={cloning}
                    >
                        {cloning ? "Saving…" : "Save a Copy to My Library"}
                    </button>
                </div>
            </div>
        </div>
    );
}
