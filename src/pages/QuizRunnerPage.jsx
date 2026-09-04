import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { saveAttempt } from "../lib/quizApi.js";
import { shuffleQuizQuestions } from "../utils/shuffle.js";
import Flashcards from "../components/Flashcards.jsx";
import MultipleChoice from "../components/MultipleChoice.jsx";
import Summary from "../components/Summary.jsx";

const TIMER_PRESETS = [
    { label: "No timer", minutes: null },
    { label: "15 mins", minutes: 15 },
    { label: "30 mins", minutes: 30 },
    { label: "60 mins", minutes: 60 },
];

const PASS_PRESETS = [60, 75, 80];

function McqOptions({ onStart }) {
    const [feedbackMode, setFeedbackMode] = useState("end");
    const [timerChoice, setTimerChoice] = useState("No timer");
    const [customMinutes, setCustomMinutes] = useState("");
    const [passRate, setPassRate] = useState(75);
    const [passRateMode, setPassRateMode] = useState("preset");

    function resolveMinutes() {
        if (timerChoice === "Custom") return Number(customMinutes) || null;
        const preset = TIMER_PRESETS.find((p) => p.label === timerChoice);
        return preset ? preset.minutes : null;
    }

    return (
        <div className="card">
            <h3>Quiz Settings</h3>

            <div className="option-group">
                <label>Answer Feedback</label>
                <div className="option-row centered">
                    <button
                        className={`option-btn ${feedbackMode === "end" ? "active" : ""}`}
                        onClick={() => setFeedbackMode("end")}
                    >
                        Show only at the end
                    </button>
                    <button
                        className={`option-btn ${feedbackMode === "immediate" ? "active" : ""}`}
                        onClick={() => setFeedbackMode("immediate")}
                    >
                        Show after each question
                    </button>
                </div>
            </div>

            <div className="option-group">
                <label>Timer</label>
                <div className="option-row centered">
                    {TIMER_PRESETS.map((p) => (
                        <button
                            key={p.label}
                            className={`option-btn ${timerChoice === p.label ? "active" : ""}`}
                            onClick={() => setTimerChoice(p.label)}
                        >
                            {p.label}
                        </button>
                    ))}
                    <button
                        className={`option-btn ${timerChoice === "Custom" ? "active" : ""}`}
                        onClick={() => setTimerChoice("Custom")}
                    >
                        Custom
                    </button>
                </div>
                {timerChoice === "Custom" && (
                    <input
                        type="number"
                        min="1"
                        placeholder="Minutes"
                        value={customMinutes}
                        onChange={(e) => setCustomMinutes(e.target.value)}
                        className="custom-timer-input"
                    />
                )}
            </div>

            <div className="option-group">
                <label>Passing Score</label>
                <div className="option-row centered">
                    {PASS_PRESETS.map((p) => (
                        <button
                            key={p}
                            className={`option-btn ${passRateMode === "preset" && passRate === p ? "active" : ""}`}
                            onClick={() => {
                                setPassRateMode("preset");
                                setPassRate(p);
                            }}
                        >
                            {p}%
                        </button>
                    ))}
                    <button
                        className={`option-btn ${passRateMode === "slider" ? "active" : ""}`}
                        onClick={() => setPassRateMode("slider")}
                    >
                        Custom
                    </button>
                </div>
                {passRateMode === "slider" && (
                    <div className="pass-slider-row">
                        <input
                            type="range"
                            min="50"
                            max="100"
                            value={passRate}
                            onChange={(e) =>
                                setPassRate(Number(e.target.value))
                            }
                            className="pass-slider"
                        />
                        <span className="pass-slider-value">{passRate}%</span>
                    </div>
                )}
            </div>

            <div className="nav-row centered">
                <button
                    className="btn"
                    onClick={() =>
                        onStart(feedbackMode, resolveMinutes(), passRate)
                    }
                >
                    Start Quiz
                </button>
            </div>
        </div>
    );
}

export default function QuizRunnerPage({ activeQuiz, setActiveQuiz }) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [phase, setPhase] = useState(
        activeQuiz?.mode === "mcq" ? "options" : "quiz",
    );
    const [feedbackMode, setFeedbackMode] = useState("end");
    const [timeLimitMinutes, setTimeLimitMinutes] = useState(null);
    const [passThreshold, setPassThreshold] = useState(75);
    const [answers, setAnswers] = useState({});
    const [runKey, setRunKey] = useState(0);
    const [showLeaveWarning, setShowLeaveWarning] = useState(false);
    const [pendingLeaveAction, setPendingLeaveAction] = useState(null);

    const questions = useMemo(() => {
        if (!activeQuiz) return [];
        return shuffleQuizQuestions(activeQuiz.questions, activeQuiz.mode);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeQuiz, runKey]);

    const isInProgress = phase === "quiz";

    useEffect(() => {
        if (!isInProgress) return;

        function handleBeforeUnload(e) {
            e.preventDefault();
            e.returnValue = "";
        }

        function handlePopState() {
            window.history.pushState(null, "", window.location.href);
            setPendingLeaveAction(() => () => {
                setActiveQuiz(null);
                navigate("/");
            });
            setShowLeaveWarning(true);
        }

        window.history.pushState(null, "", window.location.href);
        window.addEventListener("beforeunload", handleBeforeUnload);
        window.addEventListener("popstate", handlePopState);

        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
            window.removeEventListener("popstate", handlePopState);
        };
    }, [isInProgress, navigate, setActiveQuiz]);

    if (!activeQuiz) {
        navigate("/");
        return null;
    }

    const { mode, quizId, title, recordAttempts } = activeQuiz;

    function handleStartOptions(fbMode, minutes, passRate) {
        setFeedbackMode(fbMode);
        setTimeLimitMinutes(minutes);
        setPassThreshold(passRate);
        setPhase("quiz");
    }

    async function handleFinish(finalAnswers) {
        if (finalAnswers) setAnswers(finalAnswers);
        setPhase("summary");

        if (mode === "mcq" && recordAttempts && quizId && user) {
            const score = questions.reduce(
                (acc, q, i) =>
                    acc + (finalAnswers?.[i] === q.correctIndex ? 1 : 0),
                0,
            );
            try {
                await saveAttempt({
                    quizId,
                    userId: user.id,
                    score,
                    total: questions.length,
                    answers: finalAnswers,
                });
            } catch (err) {
                console.error("Failed to record attempt:", err.message);
            }
        }
    }

    function handleSaved(newQuizId) {
        setActiveQuiz((prev) => ({
            ...prev,
            quizId: newQuizId,
            recordAttempts: true,
        }));
    }

    function handleRetake() {
        setAnswers({});
        setRunKey((k) => k + 1);
        setPhase(mode === "mcq" ? "options" : "quiz");
    }

    function requestExit(action) {
        if (isInProgress) {
            setPendingLeaveAction(() => action);
            setShowLeaveWarning(true);
        } else {
            action();
        }
    }

    function handleRestart() {
        requestExit(() => {
            setActiveQuiz(null);
            navigate("/");
        });
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

    return (
        <div className={`page ${mode === "mcq" ? "page-quiz" : ""}`}>
            {phase === "options" && <McqOptions onStart={handleStartOptions} />}

            {phase === "quiz" && mode === "flashcard" && (
                <Flashcards
                    key={runKey}
                    questions={questions}
                    onFinish={() => handleFinish(null)}
                />
            )}
            {phase === "quiz" && mode === "mcq" && (
                <MultipleChoice
                    key={runKey}
                    questions={questions}
                    feedbackMode={feedbackMode}
                    timeLimitSeconds={
                        timeLimitMinutes ? timeLimitMinutes * 60 : null
                    }
                    onFinish={handleFinish}
                />
            )}
            {phase === "summary" && (
                <Summary
                    mode={mode}
                    questions={questions}
                    answers={answers}
                    quizId={quizId}
                    title={title}
                    passThreshold={passThreshold}
                    onSaved={handleSaved}
                    onRetake={handleRetake}
                    onRestart={handleRestart}
                />
            )}

            {phase === "quiz" && (
                <div
                    className="nav-row centered"
                    style={{ marginTop: "0.75rem" }}
                >
                    <button
                        className="btn-text danger"
                        onClick={() =>
                            requestExit(() => {
                                setActiveQuiz(null);
                                navigate("/");
                            })
                        }
                    >
                        Cancel Quiz
                    </button>
                </div>
            )}

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
                                Stay on Quiz
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
