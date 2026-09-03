import { useState } from "react";

export default function Flashcards({ questions, onFinish }) {
    const [index, setIndex] = useState(0);
    const [flipped, setFlipped] = useState(false);

    const current = questions[index];
    const isLast = index === questions.length - 1;

    function next() {
        setFlipped(false);
        if (isLast) {
            onFinish();
        } else {
            setIndex((i) => i + 1);
        }
    }

    function prev() {
        setFlipped(false);
        setIndex((i) => Math.max(0, i - 1));
    }

    return (
        <div className="card">
            <div className="progress">
                Card {index + 1} of {questions.length}
            </div>

            <div
                className={`flashcard-wrap ${flipped ? "flipped" : ""}`}
                onClick={() => setFlipped((f) => !f)}
            >
                <div className="flashcard-inner">
                    <div className="flashcard-face flashcard-front">
                        {current.front}
                    </div>
                    <div className="flashcard-face flashcard-back">
                        {current.back}
                    </div>
                </div>
            </div>

            <p className="hint">Tap the card to flip</p>

            <div className="nav-row">
                <button
                    className="btn btn-secondary"
                    onClick={prev}
                    disabled={index === 0}
                >
                    ← Prev
                </button>
                <button className="btn" onClick={next}>
                    {isLast ? "Finish" : "Next →"}
                </button>
            </div>
        </div>
    );
}
