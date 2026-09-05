import { useState } from "react";

const MCQ_PRESETS = [25, 50, 100, 150];
const FLASHCARD_PRESETS = [5, 10, 20, 30];
const MCQ_MIN = 10,
    MCQ_MAX = 150;
const FLASHCARD_MIN = 5,
    FLASHCARD_MAX = 50;

export default function SetupStep({
    fileName,
    defaultTitle,
    onBack,
    onGenerate,
}) {
    const [mode, setMode] = useState("flashcard");
    const [count, setCount] = useState(10);
    const [customCount, setCustomCount] = useState("");
    const [useCustom, setUseCustom] = useState(false);
    const [title, setTitle] = useState(defaultTitle);
    const [sourceMode, setSourceMode] = useState("ai");

    const min = mode === "flashcard" ? FLASHCARD_MIN : MCQ_MIN;
    const max = mode === "flashcard" ? FLASHCARD_MAX : MCQ_MAX;
    const presets = mode === "flashcard" ? FLASHCARD_PRESETS : MCQ_PRESETS;

    function selectMode(m) {
        setMode(m);
        setUseCustom(false);
        setCount(m === "flashcard" ? 10 : 50);
        setCustomCount("");
    }

    function selectPreset(p) {
        setUseCustom(false);
        setCount(p);
    }

    function handleCustomChange(value) {
        setCustomCount(value);
        const n = Number(value);
        if (!isNaN(n)) setCount(Math.min(max, Math.max(min, n)));
    }

    function handleCustomBlur() {
        if (customCount === "") return;
        const n = Math.min(max, Math.max(min, Number(customCount) || min));
        setCustomCount(String(n));
        setCount(n);
    }

    return (
        <div className="card">
            <p className="muted">
                Source: <strong>{fileName}</strong>
            </p>

            <div className="field">
                <label>Quiz Title</label>
                <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={80}
                />
            </div>

            <div className="option-group">
                <label>Quiz Type</label>
                <div className="option-row centered">
                    <button
                        className={`option-btn ${mode === "flashcard" ? "active" : ""}`}
                        onClick={() => selectMode("flashcard")}
                    >
                        Flashcards
                    </button>
                    <button
                        className={`option-btn ${mode === "mcq" ? "active" : ""}`}
                        onClick={() => selectMode("mcq")}
                    >
                        Multiple Choice
                    </button>
                </div>
            </div>

            <div className="option-group">
                <label>Question Source</label>
                <div className="option-row centered">
                    <button
                        className={`option-btn ${sourceMode === "ai" ? "active" : ""}`}
                        onClick={() => setSourceMode("ai")}
                    >
                        AI Generated
                    </button>
                    <button
                        className={`option-btn ${sourceMode === "extract" ? "active" : ""}`}
                        onClick={() => setSourceMode("extract")}
                    >
                        Copy from PDF As-Is
                    </button>
                </div>
                <p className="muted small" style={{ marginTop: "0.5rem" }}>
                    {sourceMode === "ai"
                        ? "The AI writes new questions based on the content."
                        : "Extracts existing questions already in the PDF (e.g. a past exam)."}
                </p>
            </div>

            <div className="option-group">
                <label>
                    Number of{" "}
                    {mode === "flashcard" ? "flashcards" : "questions"} ({min}–
                    {max})
                </label>
                <div className="option-row centered">
                    {presets.map((p) => (
                        <button
                            key={p}
                            className={`option-btn ${!useCustom && count === p ? "active" : ""}`}
                            onClick={() => selectPreset(p)}
                        >
                            {p}
                        </button>
                    ))}
                    <button
                        className={`option-btn ${useCustom ? "active" : ""}`}
                        onClick={() => setUseCustom(true)}
                    >
                        Custom
                    </button>
                </div>
                {useCustom && (
                    <div className="custom-count-center">
                        <input
                            type="number"
                            min={min}
                            max={max}
                            placeholder={`${min}-${max}`}
                            value={customCount}
                            onChange={(e) => handleCustomChange(e.target.value)}
                            onBlur={handleCustomBlur}
                            className="custom-timer-input"
                        />
                    </div>
                )}
                {!useCustom && (
                    <p
                        className="muted small"
                        style={{ marginTop: "0.4rem" }}
                    ></p>
                )}
            </div>

            <div className="nav-row centered">
                <button className="btn btn-secondary" onClick={onBack}>
                    Back
                </button>
                <button
                    className="btn"
                    onClick={() =>
                        onGenerate(
                            mode,
                            count,
                            title.trim() || defaultTitle,
                            sourceMode,
                        )
                    }
                >
                    Generate
                </button>
            </div>
        </div>
    );
}
