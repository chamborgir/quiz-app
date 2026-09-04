import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { saveQuiz, shareQuiz } from "../lib/quizApi.js";

const PASS_THRESHOLD = 0.75;

export default function Summary({
    mode,
    questions,
    answers,
    quizId,
    title,
    onSaved,
    onRestart,
    onRetake,
}) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [saving, setSaving] = useState(false);
    const [shareLink, setShareLink] = useState("");
    const [savedId, setSavedId] = useState(quizId);

    const isMcq = mode === "mcq";
    const score = isMcq
        ? questions.reduce(
              (acc, q, i) => acc + (answers[i] === q.correctIndex ? 1 : 0),
              0,
          )
        : null;
    const percentage = isMcq ? score / questions.length : null;
    const passed = isMcq ? percentage >= PASS_THRESHOLD : null;

    const [showResultModal, setShowResultModal] = useState(isMcq);

    async function handleSave() {
        if (!user) {
            navigate("/auth");
            return;
        }
        setSaving(true);
        try {
            const saved = await saveQuiz({
                userId: user.id,
                title,
                mode,
                questions,
                count: questions.length,
            });
            setSavedId(saved.id);
            onSaved && onSaved(saved.id);
        } catch (err) {
            alert("Failed to save: " + err.message);
        } finally {
            setSaving(false);
        }
    }

    async function handleShare() {
        if (!savedId) return;
        try {
            const code = await shareQuiz(savedId);
            const link = `${window.location.origin}/shared/${code}`;
            setShareLink(link);
            await navigator.clipboard.writeText(link).catch(() => {});
        } catch (err) {
            alert("Failed to share: " + err.message);
        }
    }

    return (
        <div>
            {showResultModal && (
                <div
                    className="modal-overlay"
                    onClick={() => setShowResultModal(false)}
                >
                    <div
                        className="modal-card result-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            className="modal-close"
                            onClick={() => setShowResultModal(false)}
                            aria-label="Close"
                        >
                            ×
                        </button>
                        <div className="result-emoji">
                            {passed ? "🎉" : "💪"}
                        </div>
                        <div className="score-number">
                            {score} / {questions.length}
                        </div>
                        <p className="muted" style={{ marginBottom: "1rem" }}>
                            {Math.round(percentage * 100)}% correct
                        </p>
                        {passed ? (
                            <p className="result-message result-pass">
                                Congrats! you're LEPT ready!
                            </p>
                        ) : (
                            <p className="result-message result-encourage">
                                Don't give up, you've got this. Review and try
                                again!
                            </p>
                        )}
                        <button
                            className="btn"
                            onClick={() => setShowResultModal(false)}
                        >
                            View Full Summary
                        </button>
                    </div>
                </div>
            )}

            {isMcq && (
                <div className="score-banner">
                    <div className="score-number">
                        {score} / {questions.length}
                    </div>
                    <div className="muted">Correct answers</div>
                </div>
            )}

            <div className="summary-actions card">
                {!savedId && (
                    <button
                        className="btn"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving
                            ? "Saving…"
                            : user
                              ? "Save to Library"
                              : "Sign in to Save"}
                    </button>
                )}
                {savedId && !shareLink && (
                    <button className="btn btn-secondary" onClick={handleShare}>
                        Share Quiz
                    </button>
                )}
                {shareLink && (
                    <div className="share-link-box">
                        <input
                            readOnly
                            value={shareLink}
                            onFocus={(e) => e.target.select()}
                        />
                        <span className="copied-tag">Link copied</span>
                    </div>
                )}
            </div>

            {questions.map((q, i) => {
                if (isMcq) {
                    const userAnswer = answers[i];
                    const isCorrect = userAnswer === q.correctIndex;
                    return (
                        <div
                            key={i}
                            className={`summary-item ${isCorrect ? "correct" : "incorrect"}`}
                        >
                            <span
                                className={`tag ${isCorrect ? "correct" : "incorrect"}`}
                            >
                                {isCorrect ? "Correct" : "Incorrect"}
                            </span>
                            <div className="question-text">
                                {i + 1}. {q.question}
                            </div>
                            <p>
                                <strong>Your answer:</strong>{" "}
                                {userAnswer !== undefined
                                    ? q.choices[userAnswer]
                                    : "—"}
                            </p>
                            {!isCorrect && (
                                <p>
                                    <strong>Correct answer:</strong>{" "}
                                    {q.choices[q.correctIndex]}
                                </p>
                            )}
                            <p className="muted">
                                <strong>Why:</strong> {q.explanation}
                            </p>
                        </div>
                    );
                }
                return (
                    <div key={i} className="summary-item">
                        <div className="question-text">
                            {i + 1}. {q.front}
                        </div>
                        <p className="muted">
                            <strong>Answer:</strong> {q.back}
                        </p>
                    </div>
                );
            })}

            <div className="nav-row">
                <button className="btn btn-secondary" onClick={onRetake}>
                    Retake
                </button>
                <button className="btn" onClick={onRestart}>
                    New Quiz
                </button>
            </div>
        </div>
    );
}
