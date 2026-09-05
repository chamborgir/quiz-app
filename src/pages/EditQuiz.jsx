import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { getQuizById, updateQuizContent } from "../lib/quizApi.js";
import { uploadQuizImage } from "../lib/imageApi.js";

function emptyFlashcard() {
    return { front: "", back: "", imageUrl: "", imagePosition: "front" };
}

function emptyMcq() {
    return {
        question: "",
        choices: ["", "", "", ""],
        correctIndex: 0,
        explanation: "",
        imageUrl: "",
    };
}

function normalizeItem(mode, item) {
    if (mode === "flashcard") {
        return {
            front: item.front || "",
            back: item.back || "",
            imageUrl: item.imageUrl || "",
            imagePosition: item.imagePosition || "front",
            frontDisplay: item.frontDisplay || "text",
        };
    }
    return {
        question: item.question || "",
        choices:
            Array.isArray(item.choices) && item.choices.length === 4
                ? item.choices
                : ["", "", "", ""],
        correctIndex:
            typeof item.correctIndex === "number" ? item.correctIndex : 0,
        explanation: item.explanation || "",
        imageUrl: item.imageUrl || "",
    };
}

export default function EditQuiz() {
    const { quizId } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [mode, setMode] = useState("flashcard");
    const [title, setTitle] = useState("");
    const [items, setItems] = useState([]);
    const [originalSnapshot, setOriginalSnapshot] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [uploadingIdx, setUploadingIdx] = useState(null);
    const [showLeaveWarning, setShowLeaveWarning] = useState(false);
    const [pendingLeaveAction, setPendingLeaveAction] = useState(null);
    const [justSaved, setJustSaved] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const quiz = await getQuizById(quizId);
                if (!user || quiz.user_id !== user.id) {
                    setNotFound(true);
                    setLoading(false);
                    return;
                }
                setMode(quiz.mode);
                setTitle(quiz.title);
                const normalized = quiz.questions.map((q) =>
                    normalizeItem(quiz.mode, q),
                );
                setItems(normalized);
                setOriginalSnapshot(
                    JSON.stringify({
                        title: quiz.title,
                        mode: quiz.mode,
                        items: normalized,
                    }),
                );
            } catch (err) {
                console.error(err);
                setNotFound(true);
            } finally {
                setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quizId, user]);

    const currentSnapshot = JSON.stringify({ title, mode, items });
    const hasUnsavedChanges =
        !justSaved && !loading && currentSnapshot !== originalSnapshot;

    useEffect(() => {
        if (!hasUnsavedChanges) return;
        function handleBeforeUnload(e) {
            e.preventDefault();
            e.returnValue = "";
        }
        function handlePopState() {
            window.history.pushState(null, "", window.location.href);
            setPendingLeaveAction(() => () => navigate("/library"));
            setShowLeaveWarning(true);
        }
        window.history.pushState(null, "", window.location.href);
        window.addEventListener("beforeunload", handleBeforeUnload);
        window.addEventListener("popstate", handlePopState);
        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
            window.removeEventListener("popstate", handlePopState);
        };
    }, [hasUnsavedChanges, navigate]);

    function requestExit(action) {
        if (hasUnsavedChanges) {
            setPendingLeaveAction(() => action);
            setShowLeaveWarning(true);
        } else {
            action();
        }
    }

    function confirmLeave() {
        setShowLeaveWarning(false);
        if (pendingLeaveAction) pendingLeaveAction();
        setPendingLeaveAction(null);
    }

    function cancelLeave() {
        setShowLeaveWarning(false);
        setPendingLeaveAction(null);
    }

    function addItem() {
        setItems((prev) => [
            ...prev,
            mode === "flashcard" ? emptyFlashcard() : emptyMcq(),
        ]);
    }

    function removeItem(idx) {
        setItems((prev) => prev.filter((_, i) => i !== idx));
    }

    function updateFlashcard(idx, field, value) {
        setItems((prev) =>
            prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)),
        );
    }

    function updateMcqField(idx, field, value) {
        setItems((prev) =>
            prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)),
        );
    }

    function updateChoice(idx, choiceIdx, value) {
        setItems((prev) =>
            prev.map((it, i) => {
                if (i !== idx) return it;
                const choices = [...it.choices];
                choices[choiceIdx] = value;
                return { ...it, choices };
            }),
        );
    }

    async function handleImageUpload(idx, file) {
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            setError("Please upload an image file.");
            return;
        }
        setUploadingIdx(idx);
        setError("");
        try {
            const url = await uploadQuizImage(user.id, file);
            setItems((prev) =>
                prev.map((it, i) =>
                    i === idx ? { ...it, imageUrl: url } : it,
                ),
            );
        } catch (err) {
            setError("Image upload failed: " + err.message);
        } finally {
            setUploadingIdx(null);
        }
    }

    function removeImage(idx) {
        setItems((prev) =>
            prev.map((it, i) => (i === idx ? { ...it, imageUrl: "" } : it)),
        );
    }

    function setImagePosition(idx, position) {
        setItems((prev) =>
            prev.map((it, i) =>
                i === idx ? { ...it, imagePosition: position } : it,
            ),
        );
    }

    function validate() {
        if (!title.trim()) return "Please give your quiz a title.";
        if (items.length === 0) return "Add at least one item.";
        if (mode === "flashcard") {
            for (const it of items) {
                if (!it.front.trim() || !it.back.trim())
                    return "Every flashcard needs both a front and back.";
            }
        } else {
            for (const it of items) {
                if (!it.question.trim())
                    return "Every question needs question text.";
                if (it.choices.some((c) => !c.trim()))
                    return "Every question needs all 4 choices filled in.";
            }
        }
        return "";
    }

    async function handleSave() {
        const validationError = validate();
        if (validationError) {
            setError(validationError);
            return;
        }
        setSaving(true);
        setError("");
        try {
            await updateQuizContent(quizId, {
                title: title.trim(),
                mode,
                questions: items,
                count: items.length,
            });
            setJustSaved(true);
            navigate("/library");
        } catch (err) {
            setError("Failed to save: " + err.message);
        } finally {
            setSaving(false);
        }
    }

    if (loading) return <div className="page-loading">Loading quiz…</div>;

    if (notFound) {
        return (
            <div className="page">
                <div className="error-box">
                    This quiz couldn't be found, or you don't have permission to
                    edit it.
                </div>
                <button
                    className="btn btn-secondary"
                    onClick={() => navigate("/library")}
                >
                    Back to Library
                </button>
            </div>
        );
    }

    return (
        <div className="page">
            <h2>Edit Quiz</h2>
            {error && <div className="error-box">{error}</div>}

            <div className="card">
                <div className="field">
                    <label>Title</label>
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        maxLength={80}
                    />
                </div>
                <p className="muted small">
                    Type:{" "}
                    <strong>
                        {mode === "mcq" ? "Multiple Choice" : "Flashcards"}
                    </strong>{" "}
                    (type can't be changed after creation)
                </p>
            </div>

            {items.map((item, idx) => (
                <div key={idx} className="card create-item">
                    <div className="create-item-header">
                        <span className="muted small">Item {idx + 1}</span>
                        {items.length > 1 && (
                            <button
                                className="btn-text danger"
                                onClick={() => removeItem(idx)}
                            >
                                Remove
                            </button>
                        )}
                    </div>

                    <div className="field">
                        <label>Image (optional)</label>
                        {item.imageUrl ? (
                            <div className="item-image-preview">
                                <img
                                    src={item.imageUrl}
                                    alt="Question visual"
                                />
                                <div className="image-actions-row">
                                    {mode === "flashcard" && (
                                        <div
                                            className="option-row"
                                            style={{ gap: "0.4rem" }}
                                        >
                                            <button
                                                className={`option-btn option-btn-sm ${item.imagePosition === "front" ? "active" : ""}`}
                                                onClick={() =>
                                                    setImagePosition(
                                                        idx,
                                                        "front",
                                                    )
                                                }
                                            >
                                                Show on Front
                                            </button>
                                            <button
                                                className={`option-btn option-btn-sm ${item.imagePosition === "back" ? "active" : ""}`}
                                                onClick={() =>
                                                    setImagePosition(
                                                        idx,
                                                        "back",
                                                    )
                                                }
                                            >
                                                Show on Back
                                            </button>
                                        </div>
                                    )}
                                    <div
                                        className="nav-row"
                                        style={{ gap: "0.6rem" }}
                                    >
                                        <label
                                            className="btn-text"
                                            style={{ cursor: "pointer" }}
                                        >
                                            Replace image
                                            <input
                                                type="file"
                                                accept="image/*"
                                                style={{ display: "none" }}
                                                onChange={(e) =>
                                                    handleImageUpload(
                                                        idx,
                                                        e.target.files[0],
                                                    )
                                                }
                                            />
                                        </label>
                                        <button
                                            className="btn-text danger"
                                            onClick={() => removeImage(idx)}
                                        >
                                            Remove image
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) =>
                                    handleImageUpload(idx, e.target.files[0])
                                }
                                disabled={uploadingIdx === idx}
                            />
                        )}
                        {uploadingIdx === idx && (
                            <p className="muted small">Uploading…</p>
                        )}
                    </div>

                    {mode === "flashcard" ? (
                        <>
                            <div className="field">
                                <label>Front</label>
                                <input
                                    value={item.front}
                                    onChange={(e) =>
                                        updateFlashcard(
                                            idx,
                                            "front",
                                            e.target.value,
                                        )
                                    }
                                />
                            </div>
                            <div className="field">
                                <label>Back</label>
                                <input
                                    value={item.back}
                                    onChange={(e) =>
                                        updateFlashcard(
                                            idx,
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
                                    value={item.question}
                                    onChange={(e) =>
                                        updateMcqField(
                                            idx,
                                            "question",
                                            e.target.value,
                                        )
                                    }
                                />
                            </div>
                            {item.choices.map((choice, cIdx) => (
                                <div className="field choice-field" key={cIdx}>
                                    <label>
                                        <input
                                            type="radio"
                                            name={`correct-${idx}`}
                                            checked={item.correctIndex === cIdx}
                                            onChange={() =>
                                                updateMcqField(
                                                    idx,
                                                    "correctIndex",
                                                    cIdx,
                                                )
                                            }
                                        />{" "}
                                        Choice {String.fromCharCode(65 + cIdx)}{" "}
                                        {item.correctIndex === cIdx &&
                                            "(correct)"}
                                    </label>
                                    <input
                                        value={choice}
                                        onChange={(e) =>
                                            updateChoice(
                                                idx,
                                                cIdx,
                                                e.target.value,
                                            )
                                        }
                                    />
                                </div>
                            ))}
                            <div className="field">
                                <label>Explanation (optional)</label>
                                <input
                                    value={item.explanation}
                                    onChange={(e) =>
                                        updateMcqField(
                                            idx,
                                            "explanation",
                                            e.target.value,
                                        )
                                    }
                                />
                            </div>
                        </>
                    )}
                </div>
            ))}

            <div className="nav-row centered">
                <button className="btn btn-secondary" onClick={addItem}>
                    + Add {mode === "flashcard" ? "Flashcard" : "Question"}
                </button>
                <button className="btn" onClick={handleSave} disabled={saving}>
                    {saving ? "Saving…" : "Save Changes"}
                </button>
            </div>

            <div className="nav-row centered" style={{ marginTop: "0.75rem" }}>
                <button
                    className="btn-text danger"
                    onClick={() => requestExit(() => navigate("/library"))}
                >
                    Cancel & Go Back
                </button>
            </div>

            {showLeaveWarning && (
                <div className="modal-overlay" onClick={cancelLeave}>
                    <div
                        className="modal-card result-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            className="modal-close"
                            onClick={cancelLeave}
                            aria-label="Close"
                        >
                            ×
                        </button>
                        <div className="result-emoji">⚠️</div>
                        <p className="warning-title">
                            Are you sure you want to go back?
                        </p>
                        <p
                            className="muted"
                            style={{ marginBottom: "1.25rem" }}
                        >
                            Your current attempt will not be saved and you can't
                            continue it later.
                        </p>
                        <div className="nav-row centered">
                            <button
                                className="btn btn-secondary"
                                onClick={cancelLeave}
                            >
                                Stay Here
                            </button>
                            <button className="btn" onClick={confirmLeave}>
                                Leave Anyway
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
