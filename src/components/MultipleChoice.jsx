import { useState } from "react";

export default function MultipleChoice({ questions, onFinish }) {
    const [index, setIndex] = useState(0);
    const [answers, setAnswers] = useState({});

    const current = questions[index];
    const isLast = index === questions.length - 1;

    function selectChoice(choiceIdx) {
        setAnswers((prev) => ({ ...prev, [index]: choiceIdx }));
    }

    function next() {
        if (isLast) {
            onFinish(answers);
        } else {
            setIndex((i) => i + 1);
        }
    }

    function prev() {
        setIndex((i) => Math.max(0, i - 1));
    }

    return (
        <div className="card">
            <div className="progress">
                Question {index + 1} of {questions.length}
            </div>
            <div className="question-text">{current.question}</div>

            {current.choices.map((choice, i) => (
                <button
                    key={i}
                    className={`choice ${answers[index] === i ? "selected" : ""}`}
                    onClick={() => selectChoice(i)}
                >
                    {String.fromCharCode(65 + i)}. {choice}
                </button>
            ))}

            <div className="nav-row" style={{ marginTop: "1.5rem" }}>
                <button
                    className="btn btn-secondary"
                    onClick={prev}
                    disabled={index === 0}
                >
                    ← Prev
                </button>
                <button
                    className="btn"
                    onClick={next}
                    disabled={answers[index] === undefined}
                >
                    {isLast ? "Submit" : "Next →"}
                </button>
            </div>
        </div>
    );
}
