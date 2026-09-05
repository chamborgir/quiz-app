import { useEffect, useRef, useState } from "react";
import { formatQuestionText } from "../utils/formatText.js";
import FormattedText from "./FormattedText.jsx";

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
    const [showNav, setShowNav] = useState(false);
    const [showUnansweredWarning, setShowUnansweredWarning] = useState(false);

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
                    onFinish(answersRef.current); // time's up — submit as-is, no warning
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
    const unansweredCount = questions.length - Object.keys(answers).length;

    function selectChoice(choiceIdx) {
        if (isRevealed) return;
        setAnswers((prev) => ({ ...prev, [index]: choiceIdx }));
    }

    function attemptFinish() {
        if (unansweredCount > 0) {
            setShowUnansweredWarning(true);
        } else {
            onFinish(answers);
        }
    }

    function handleNext() {
        if (feedbackMode === "immediate" && !revealedMap[index] && hasAnswer) {
            setRevealedMap((prev) => ({ ...prev, [index]: true }));
            return;
        }
        if (isLast) {
            attemptFinish();
        } else {
            setIndex((i) => i + 1);
        }
    }

    function prev() {
        setIndex((i) => Math.max(0, i - 1));
    }

    function jumpTo(i) {
        setIndex(i);
        setShowNav(false);
    }

    function confirmFinishAnyway() {
        setShowUnansweredWarning(false);
        onFinish(answers);
    }

    function goReviewUnanswered() {
        setShowUnansweredWarning(false);
        const firstUnanswered = questions.findIndex(
            (_, i) => answers[i] === undefined,
        );
        if (firstUnanswered !== -1) setIndex(firstUnanswered);
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

            <div className="question-text">
                <FormattedText text={current.question} />
            </div>
            {current.imageUrl && (
                <img src={current.imageUrl} alt="" className="quiz-image" />
            )}

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
                        {String.fromCharCode(65 + i)}.{" "}
                        <FormattedText text={choice} />
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
                    <FormattedText text={current.explanation} />
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

            <div className="nav-row centered" style={{ marginTop: "0.75rem" }}>
                <button className="btn-text" onClick={() => setShowNav(true)}>
                    Jump to Question
                </button>
            </div>

            {showNav && (
                <div
                    className="modal-overlay"
                    onClick={() => setShowNav(false)}
                >
                    <div
                        className="modal-card"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            className="modal-close"
                            onClick={() => setShowNav(false)}
                            aria-label="Close"
                        >
                            ×
                        </button>
                        <h3>Jump to Question</h3>
                        <div className="nav-grid">
                            {questions.map((_, i) => {
                                let cls = "nav-num";
                                if (answers[i] !== undefined)
                                    cls += " answered";
                                if (i === index) cls += " current";
                                return (
                                    <button
                                        key={i}
                                        className={cls}
                                        onClick={() => jumpTo(i)}
                                    >
                                        {i + 1}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="nav-legend">
                            <span>
                                <i className="dot dot-answered"></i> Answered
                            </span>
                            <span>
                                <i className="dot dot-unanswered"></i> Not
                                answered
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {showUnansweredWarning && (
                <div
                    className="modal-overlay"
                    onClick={() => setShowUnansweredWarning(false)}
                >
                    <div
                        className="modal-card result-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            className="modal-close"
                            onClick={() => setShowUnansweredWarning(false)}
                            aria-label="Close"
                        >
                            ×
                        </button>
                        <div className="result-emoji">⚠️</div>
                        <p className="warning-title">
                            There {unansweredCount === 1 ? "is" : "are"}{" "}
                            {unansweredCount} unanswered item
                            {unansweredCount === 1 ? "" : "s"}.
                        </p>
                        <p
                            className="muted"
                            style={{ marginBottom: "1.25rem" }}
                        >
                            Are you sure you want to finish the quiz?
                        </p>
                        <div className="nav-row centered">
                            <button
                                className="btn btn-secondary"
                                onClick={goReviewUnanswered}
                            >
                                Review Unanswered
                            </button>
                            <button
                                className="btn"
                                onClick={confirmFinishAnyway}
                            >
                                Finish Anyway
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
