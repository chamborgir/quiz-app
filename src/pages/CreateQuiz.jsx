import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { saveQuiz } from "../lib/quizApi.js";
import { uploadQuizImage } from "../lib/imageApi.js";

function emptyFlashcard() {
    return {
        front: "",
        back: "",
        imageUrl: "",
        imagePosition: "front",
        frontDisplay: "text",
    };
}

function setFrontDisplay(idx, display) {
    setItems((prev) =>
        prev.map((it, i) =>
            i === idx ? { ...it, frontDisplay: display } : it,
        ),
    );
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

export default function CreateQuiz() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [mode, setMode] = useState("flashcard");
    const [title, setTitle] = useState("");
    const [items, setItems] = useState([emptyFlashcard()]);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [uploadingIdx, setUploadingIdx] = useState(null);
    const [showLeaveWarning, setShowLeaveWarning] = useState(false);
    const [pendingLeaveAction, setPendingLeaveAction] = useState(null);
    const [justSaved, setJustSaved] = useState(false);

    const hasUnsavedInput =
        !justSaved &&
        (title.trim() !== "" ||
            items.some((it) =>
                mode === "flashcard"
                    ? it.front.trim() !== "" ||
                      it.back.trim() !== "" ||
                      it.imageUrl
                    : it.question.trim() !== "" ||
                      it.choices.some((c) => c.trim() !== "") ||
                      it.explanation.trim() !== "" ||
                      it.imageUrl,
            ));

    useEffect(() => {
        if (!hasUnsavedInput) return;
        function handleBeforeUnload(e) {
            e.preventDefault();
            e.returnValue = "";
        }
        function handlePopState() {
            window.history.pushState(null, "", window.location.href);
            setPendingLeaveAction(() => () => navigate("/"));
            setShowLeaveWarning(true);
        }
        window.history.pushState(null, "", window.location.href);
        window.addEventListener("beforeunload", handleBeforeUnload);
        window.addEventListener("popstate", handlePopState);
        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
            window.removeEventListener("popstate", handlePopState);
        };
    }, [hasUnsavedInput, navigate]);

    function requestExit(action) {
        if (hasUnsavedInput) {
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

    function switchMode(m) {
        requestExit(() => {
            setMode(m);
            setItems([m === "flashcard" ? emptyFlashcard() : emptyMcq()]);
        });
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
        if (!user) {
            navigate("/auth");
            return;
        }
        setSaving(true);
        setError("");
        try {
            await saveQuiz({
                userId: user.id,
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

    return (
        <div className="page">
            <h2>Create Your Own</h2>
            {error && <div className="error-box">{error}</div>}

            <div className="card">
                <div className="field">
                    <label>Title</label>
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        maxLength={80}
                        placeholder="e.g. Chapter 4 Vocabulary"
                    />
                </div>
                <div className="option-group">
                    <label>Type</label>
                    <div className="option-row centered">
                        <button
                            className={`option-btn ${mode === "flashcard" ? "active" : ""}`}
                            onClick={() => switchMode("flashcard")}
                        >
                            Flashcards
                        </button>
                        <button
                            className={`option-btn ${mode === "mcq" ? "active" : ""}`}
                            onClick={() => switchMode("mcq")}
                        >
                            Multiple Choice
                        </button>
                    </div>
                </div>
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
                                        <>
                                            <div>
                                                <p
                                                    className="muted small"
                                                    style={{
                                                        marginBottom: "0.3rem",
                                                    }}
                                                >
                                                    Which side shows the image?
                                                </p>
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
                                                        Front
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
                                                        Back
                                                    </button>
                                                </div>
                                            </div>
                                            <div>
                                                <p
                                                    className="muted small"
                                                    style={{
                                                        marginBottom: "0.3rem",
                                                    }}
                                                >
                                                    What shows on that side?
                                                </p>
                                                <div
                                                    className="option-row"
                                                    style={{ gap: "0.4rem" }}
                                                >
                                                    <button
                                                        className={`option-btn option-btn-sm ${item.frontDisplay === "text" ? "active" : ""}`}
                                                        onClick={() =>
                                                            setFrontDisplay(
                                                                idx,
                                                                "text",
                                                            )
                                                        }
                                                    >
                                                        Text Only
                                                    </button>
                                                    <button
                                                        className={`option-btn option-btn-sm ${item.frontDisplay === "image" ? "active" : ""}`}
                                                        onClick={() =>
                                                            setFrontDisplay(
                                                                idx,
                                                                "image",
                                                            )
                                                        }
                                                    >
                                                        Image Only
                                                    </button>
                                                    <button
                                                        className={`option-btn option-btn-sm ${item.frontDisplay === "both" ? "active" : ""}`}
                                                        onClick={() =>
                                                            setFrontDisplay(
                                                                idx,
                                                                "both",
                                                            )
                                                        }
                                                    >
                                                        Both
                                                    </button>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                    <button
                                        className="btn-text danger"
                                        onClick={() => removeImage(idx)}
                                    >
                                        Remove image
                                    </button>
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
                        {mode === "mcq" && item.imageUrl && (
                            <p
                                className="muted small"
                                style={{ marginTop: "0.4rem" }}
                            >
                                This image will display below the question,
                                above the choices.
                            </p>
                        )}
                    </div>

                    {mode === "flashcard" ? (
                        <>
                            <div className="field">
                                <label>
                                    Front{" "}
                                    {item.imageUrl &&
                                        item.imagePosition === "front" && (
                                            <span className="muted small">
                                                (image shows here too)
                                            </span>
                                        )}
                                </label>
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
                                <label>
                                    Back{" "}
                                    {item.imageUrl &&
                                        item.imagePosition === "back" && (
                                            <span className="muted small">
                                                (image shows here too)
                                            </span>
                                        )}
                                </label>
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
                    {saving ? "Saving…" : "Save Quiz"}
                </button>
            </div>

            <div className="nav-row centered" style={{ marginTop: "0.75rem" }}>
                <button
                    className="btn-text danger"
                    onClick={() => requestExit(() => navigate("/"))}
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
