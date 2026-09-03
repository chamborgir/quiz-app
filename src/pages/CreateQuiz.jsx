import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { saveQuiz } from "../lib/quizApi.js";

function emptyFlashcard() {
    return { front: "", back: "" };
}

function emptyMcq() {
    return {
        question: "",
        choices: ["", "", "", ""],
        correctIndex: 0,
        explanation: "",
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

    function switchMode(m) {
        setMode(m);
        setItems([m === "flashcard" ? emptyFlashcard() : emptyMcq()]);
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
                    {saving ? "Saving…" : "Save Quiz"}
                </button>
            </div>
        </div>
    );
}
