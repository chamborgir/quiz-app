import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import {
    getCollectionByShareCode,
    cloneQuiz,
    cloneCollectionWithQuizzes,
} from "../lib/quizApi.js";

export default function SharedGroup({ setActiveQuiz }) {
    const { code } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [cloningId, setCloningId] = useState(null);
    const [savingGroup, setSavingGroup] = useState(false);
    const [groupSaved, setGroupSaved] = useState(false);

    useEffect(() => {
        if (!code) {
            setError("No share code was provided in this link.");
            return;
        }
        getCollectionByShareCode(code)
            .then(setData)
            .catch((err) => {
                console.error("Failed to load shared group:", err);
                setError(
                    "This shared group was not found or is no longer public.",
                );
            });
    }, [code]);

    function handlePlay(quiz) {
        setActiveQuiz({
            mode: quiz.mode,
            questions: quiz.questions,
            quizId: null,
            title: quiz.title,
            recordAttempts: false,
        });
        navigate("/play");
    }

    async function handleSaveCopy(quiz) {
        if (!user) {
            navigate("/auth");
            return;
        }
        setCloningId(quiz.id);
        try {
            await cloneQuiz(quiz, user.id);
        } catch (err) {
            alert("Failed to save copy: " + err.message);
        } finally {
            setCloningId(null);
        }
    }

    async function handleSaveEntireGroup() {
        if (!user) {
            navigate("/auth");
            return;
        }
        setSavingGroup(true);
        try {
            await cloneCollectionWithQuizzes(
                data.collection.name,
                data.quizzes,
                user.id,
            );
            setGroupSaved(true);
        } catch (err) {
            alert("Failed to save group: " + err.message);
        } finally {
            setSavingGroup(false);
        }
    }

    if (error) {
        return (
            <div className="page">
                <div className="error-box">{error}</div>
            </div>
        );
    }

    if (!data) {
        return <div className="page-loading">Loading shared group…</div>;
    }

    return (
        <div className="page">
            <div className="card center-content">
                <h2>{data.collection.name}</h2>
                <p className="muted">
                    {data.quizzes.length} quiz
                    {data.quizzes.length === 1 ? "" : "zes"} in this group
                </p>

                {groupSaved ? (
                    <p className="info-box">
                        ✓ Saved to your Library under a new group called "
                        {data.collection.name}"
                    </p>
                ) : (
                    <button
                        className="btn"
                        onClick={handleSaveEntireGroup}
                        disabled={savingGroup}
                    >
                        {savingGroup
                            ? "Saving whole group…"
                            : "Save Entire Group"}
                    </button>
                )}
            </div>

            {data.quizzes.map((quiz) => (
                <div key={quiz.id} className="card library-item">
                    <div className="library-header">
                        <h3>{quiz.title}</h3>
                        <span className={`badge ${quiz.mode}`}>
                            {quiz.mode === "mcq" ? "MCQ" : "Cards"}
                        </span>
                    </div>
                    <p className="muted small">{quiz.count} items</p>
                    <div className="library-actions">
                        <button
                            className="btn btn-sm"
                            onClick={() => handlePlay(quiz)}
                        >
                            Take Quiz
                        </button>
                        <button
                            className="btn-text"
                            onClick={() => handleSaveCopy(quiz)}
                            disabled={cloningId === quiz.id}
                        >
                            {cloningId === quiz.id ? "Saving…" : "Save Copy"}
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
