import { useState } from "react";

export default function SetupStep({
    fileName,
    defaultTitle,
    onBack,
    onGenerate,
}) {
    const [mode, setMode] = useState("flashcard");
    const [count, setCount] = useState(10);
    const [title, setTitle] = useState(defaultTitle);
    const [sourceMode, setSourceMode] = useState("ai"); // 'ai' | 'extract'

    const flashcardCounts = [10, 15, 20];
    const mcqCounts = [50, 100, 150];

    function selectMode(m) {
        setMode(m);
        setCount(m === "flashcard" ? 10 : 50);
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
                        ? "The AI writes new questions based on the content. Best for notes, articles, or textbook chapters."
                        : "Directly extracts existing questions & choices already in the PDF (e.g. a past exam or worksheet). Won't invent new ones — if the PDF has fewer questions than your chosen count, you'll get however many actually exist."}
                </p>
            </div>

            <div className="option-group">
                <label>
                    Number of{" "}
                    {mode === "flashcard" ? "flashcards" : "questions"}
                </label>
                <div className="option-row centered">
                    {(mode === "flashcard" ? flashcardCounts : mcqCounts).map(
                        (c) => (
                            <button
                                key={c}
                                className={`option-btn ${count === c ? "active" : ""}`}
                                onClick={() => setCount(c)}
                            >
                                {c}
                            </button>
                        ),
                    )}
                </div>
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
