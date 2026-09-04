import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { saveQuiz, shareQuiz, updateSingleQuestion } from "../lib/quizApi.js";
import FormattedText from "./FormattedText.jsx";

const PASS_THRESHOLD = 0.75;

function buildDraft(mode, item) {
    if (mode === "flashcard") {
        return { front: item.front, back: item.back };
    }
    return {
        question: item.question,
        choices: [...item.choices],
        correctIndex: item.correctIndex,
        explanation: item.explanation || "",
    };
}

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
    const [sharing, setSharing] = useState(false);
    const [shareLink, setShareLink] = useState("");
    const [savedId, setSavedId] = useState(quizId);

    const [overrides, setOverrides] = useState({}); // index -> corrected item, for immediate display
    const [flagIndex, setFlagIndex] = useState(null);
    const [flagDraft, setFlagDraft] = useState(null);
    const [flagOriginalKey, setFlagOriginalKey] = useState(null);
    const [flagSaving, setFlagSaving] = useState(false);
    const [flagError, setFlagError] = useState("");

    const isMcq = mode === "mcq";

    function displayItem(i) {
        return overrides[i] || questions[i];
    }

    const score = isMcq
        ? questions.reduce(
              (acc, q, i) =>
                  acc + (answers[i] === displayItem(i).correctIndex ? 1 : 0),
              0,
          )
        : null;
    const percentage = isMcq ? score / questions.length : null;
    const passed = isMcq ? percentage >= PASS_THRESHOLD : null;

    const [showResultModal, setShowResultModal] = useState(isMcq);

    async function doSave() {
        if (!user) {
            navigate("/auth");
            return null;
        }
        const saved = await saveQuiz({
            userId: user.id,
            title,
            mode,
            questions,
            count: questions.length,
        });
        setSavedId(saved.id);
        onSaved && onSaved(saved.id);
        return saved.id;
    }

    async function handleSave() {
        setSaving(true);
        try {
            await doSave();
        } catch (err) {
            alert("Failed to save: " + err.message);
        } finally {
            setSaving(false);
        }
    }

    async function handleShareClick() {
        setSharing(true);
        try {
            let id = savedId;
            if (!id) {
                id = await doSave();
                if (!id) return;
            }
            const code = await shareQuiz(id);
            const link = `${window.location.origin}/shared/${code}`;
            setShareLink(link);
            await navigator.clipboard.writeText(link).catch(() => {});
        } catch (err) {
            alert("Failed to share: " + err.message);
        } finally {
            setSharing(false);
        }
    }

    function openFlag(i) {
        const item = displayItem(i);
        setFlagIndex(i);
        setFlagDraft(buildDraft(mode, item));
        setFlagOriginalKey(mode === "mcq" ? item.question : item.front);
        setFlagError("");
    }

    function closeFlag() {
        setFlagIndex(null);
        setFlagDraft(null);
        setFlagOriginalKey(null);
        setFlagError("");
    }

    function updateDraftField(field, value) {
        setFlagDraft((prev) => ({ ...prev, [field]: value }));
    }

    function updateDraftChoice(cIdx, value) {
        setFlagDraft((prev) => {
            const choices = [...prev.choices];
            choices[cIdx] = value;
            return { ...prev, choices };
        });
    }

    async function handleSaveFlag() {
        if (
            mode === "flashcard" &&
            (!flagDraft.front.trim() || !flagDraft.back.trim())
        ) {
            setFlagError("Both front and back are required.");
            return;
        }
        if (mode === "mcq") {
            if (!flagDraft.question.trim()) {
                setFlagError("Question text is required.");
                return;
            }
            if (flagDraft.choices.some((c) => !c.trim())) {
                setFlagError("All 4 choices are required.");
                return;
            }
        }

        setFlagSaving(true);
        setFlagError("");
        try {
            let id = savedId;
            if (!id) {
                id = await doSave();
                if (!id) {
                    setFlagSaving(false);
                    return;
                }
            }
            await updateSingleQuestion(id, mode, flagOriginalKey, flagDraft);
            setOverrides((prev) => ({ ...prev, [flagIndex]: flagDraft }));
            closeFlag();
        } catch (err) {
            setFlagError("Failed to save correction: " + err.message);
        } finally {
            setFlagSaving(false);
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
                                Congrats — you're LEPT ready!
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

            {questions.map((_, i) => {
                const q = displayItem(i);
                if (isMcq) {
                    const userAnswer = answers[i];
                    const isCorrect = userAnswer === q.correctIndex;
                    return (
                        <div
                            key={i}
                            className={`summary-item ${isCorrect ? "correct" : "incorrect"}`}
                        >
                            <div className="summary-item-top">
                                <span
                                    className={`tag ${isCorrect ? "correct" : "incorrect"}`}
                                >
                                    {isCorrect ? "Correct" : "Incorrect"}
                                </span>
                                <button
                                    className="btn-text flag-btn"
                                    onClick={() => openFlag(i)}
                                >
                                    🚩 Flag / Edit
                                </button>
                            </div>
                            <div className="question-text">
                                {i + 1}. <FormattedText text={q.question} />
                            </div>
                            <p>
                                <strong>Your answer:</strong>{" "}
                                <FormattedText
                                    text={
                                        userAnswer !== undefined
                                            ? q.choices[userAnswer]
                                            : "—"
                                    }
                                />
                            </p>
                            {!isCorrect && (
                                <p>
                                    <strong>Correct answer:</strong>{" "}
                                    <FormattedText
                                        text={q.choices[q.correctIndex]}
                                    />
                                </p>
                            )}
                            <p className="muted">
                                <strong>Why:</strong>{" "}
                                <FormattedText text={q.explanation} />
                            </p>
                        </div>
                    );
                }
                return (
                    <div key={i} className="summary-item">
                        <div className="summary-item-top">
                            <span></span>
                            <button
                                className="btn-text flag-btn"
                                onClick={() => openFlag(i)}
                            >
                                🚩 Flag / Edit
                            </button>
                        </div>
                        <div className="question-text">
                            {i + 1}. <FormattedText text={q.front} />
                        </div>
                        <p className="muted">
                            <strong>Answer:</strong>{" "}
                            <FormattedText text={q.back} />
                        </p>
                    </div>
                );
            })}

            {!savedId && (
                <div className="card center-content">
                    <p
                        className="muted small"
                        style={{ marginBottom: "0.75rem" }}
                    >
                        Save this quiz to retake it later or share it with
                        others.
                    </p>
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
                </div>
            )}

            {shareLink && (
                <div className="card">
                    <div className="share-link-box">
                        <input
                            readOnly
                            value={shareLink}
                            onFocus={(e) => e.target.select()}
                        />
                        <span className="copied-tag">Link copied</span>
                    </div>
                </div>
            )}

            <div className="nav-row centered">
                <button className="btn-retake" onClick={onRetake}>
                    Retake
                </button>
                <button className="btn-newquiz" onClick={onRestart}>
                    New Quiz
                </button>
                <button
                    className="btn"
                    onClick={handleShareClick}
                    disabled={sharing}
                >
                    {sharing ? "Sharing…" : "Share Quiz"}
                </button>
            </div>

            {flagIndex !== null && (
                <div className="modal-overlay" onClick={closeFlag}>
                    <div
                        className="modal-card"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            className="modal-close"
                            onClick={closeFlag}
                            aria-label="Close"
                        >
                            ×
                        </button>
                        <h3>
                            Fix This {mode === "mcq" ? "Question" : "Flashcard"}
                        </h3>
                        {flagError && (
                            <div className="error-box">{flagError}</div>
                        )}

                        {mode === "flashcard" ? (
                            <>
                                <div className="field">
                                    <label>Front</label>
                                    <input
                                        value={flagDraft.front}
                                        onChange={(e) =>
                                            updateDraftField(
                                                "front",
                                                e.target.value,
                                            )
                                        }
                                    />
                                </div>
                                <div className="field">
                                    <label>Back</label>
                                    <input
                                        value={flagDraft.back}
                                        onChange={(e) =>
                                            updateDraftField(
                                                "back",
                                                e.target.value,
                                            )
                                        }
                                    />
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="field">
                                    <label>Question</label>
                                    <input
                                        value={flagDraft.question}
                                        onChange={(e) =>
                                            updateDraftField(
                                                "question",
                                                e.target.value,
                                            )
                                        }
                                    />
                                </div>
                                {flagDraft.choices.map((choice, cIdx) => (
                                    <div
                                        className="field choice-field"
                                        key={cIdx}
                                    >
                                        <label>
                                            <input
                                                type="radio"
                                                name="flag-correct"
                                                checked={
                                                    flagDraft.correctIndex ===
                                                    cIdx
                                                }
                                                onChange={() =>
                                                    updateDraftField(
                                                        "correctIndex",
                                                        cIdx,
                                                    )
                                                }
                                            />{" "}
                                            Choice{" "}
                                            {String.fromCharCode(65 + cIdx)}{" "}
                                            {flagDraft.correctIndex === cIdx &&
                                                "(correct)"}
                                        </label>
                                        <input
                                            value={choice}
                                            onChange={(e) =>
                                                updateDraftChoice(
                                                    cIdx,
                                                    e.target.value,
                                                )
                                            }
                                        />
                                    </div>
                                ))}
                                <div className="field">
                                    <label>Explanation</label>
                                    <input
                                        value={flagDraft.explanation}
                                        onChange={(e) =>
                                            updateDraftField(
                                                "explanation",
                                                e.target.value,
                                            )
                                        }
                                    />
                                </div>
                            </>
                        )}

                        <div className="nav-row centered">
                            <button
                                className="btn btn-secondary"
                                onClick={closeFlag}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn"
                                onClick={handleSaveFlag}
                                disabled={flagSaving}
                            >
                                {flagSaving ? "Saving…" : "Save Correction"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
