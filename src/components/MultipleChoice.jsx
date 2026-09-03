import { useEffect, useRef, useState } from "react";

export default function MultipleChoice({
    questions,
    feedbackMode,
    timeLimitSeconds,
    onFinish,
}) {
    const [index, setIndex] = useState(0);
    const [answers, setAnswers] = useState({});
    const [revealedMap, setRevealedMap] = useState({});
    const [timeLeft, setTimeLeft] = useState(timeLimitSeconds || null);

    const answersRef = useRef(answers);
    useEffect(() => {
        answersRef.current = answers;
    }, [answers]);

    useEffect(() => {
        if (!timeLimitSeconds) return;
        const interval = setInterval(() => {
            setTimeLeft((t) => {
                if (t <= 1) {
                    clearInterval(interval);
                    onFinish(answersRef.current);
                    return 0;
                }
                return t - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeLimitSeconds]);

    const current = questions[index];
    const isLast = index === questions.length - 1;
    const isRevealed = feedbackMode === "immediate" && !!revealedMap[index];
    const hasAnswer = answers[index] !== undefined;

    function selectChoice(choiceIdx) {
        if (isRevealed) return;
        setAnswers((prev) => ({ ...prev, [index]: choiceIdx }));
    }

    function handleNext() {
        if (feedbackMode === "immediate" && !revealedMap[index] && hasAnswer) {
            setRevealedMap((prev) => ({ ...prev, [index]: true }));
            return;
        }
        if (isLast) {
            onFinish(answers);
        } else {
            setIndex((i) => i + 1);
        }
    }

    function prev() {
        setIndex((i) => Math.max(0, i - 1));
    }

    let nextLabel;
    if (feedbackMode === "immediate") {
        nextLabel = !revealedMap[index]
            ? "Check Answer"
            : isLast
              ? "Finish"
              : "Next Question";
    } else {
        nextLabel = isLast ? "Submit" : "Next";
    }

    function formatTime(s) {
        const m = Math.floor(s / 60)
            .toString()
            .padStart(2, "0");
        const sec = (s % 60).toString().padStart(2, "0");
        return `${m}:${sec}`;
    }

    return (
        <div className="card">
            <div className="quiz-top-row">
                <div className="progress">
                    Question {index + 1} of {questions.length}
                </div>
                {timeLimitSeconds && (
                    <div
                        className={`timer-badge ${timeLeft <= 30 ? "timer-low" : ""}`}
                    >
                        ⏱ {formatTime(timeLeft)}
                    </div>
                )}
            </div>

            <div className="question-text">{current.question}</div>

            {current.choices.map((choice, i) => {
                let cls = "choice";
                if (answers[index] === i) cls += " selected";
                if (isRevealed) {
                    if (i === current.correctIndex) cls += " correct-reveal";
                    else if (i === answers[index]) cls += " incorrect-reveal";
                }
                return (
                    <button
                        key={i}
                        className={cls}
                        onClick={() => selectChoice(i)}
                        disabled={isRevealed}
                    >
                        {String.fromCharCode(65 + i)}. {choice}
                    </button>
                );
            })}

            {isRevealed && (
                <div className="explanation-box">
                    <strong>
                        {answers[index] === current.correctIndex
                            ? "Correct!"
                            : "Incorrect."}
                    </strong>{" "}
                    {current.explanation}
                </div>
            )}

            <div className="nav-row">
                <button
                    className="btn btn-secondary"
                    onClick={prev}
                    disabled={index === 0}
                >
                    Prev
                </button>
                <button
                    className="btn"
                    onClick={handleNext}
                    disabled={!hasAnswer}
                >
                    {nextLabel}
                </button>
            </div>
        </div>
    );
}
