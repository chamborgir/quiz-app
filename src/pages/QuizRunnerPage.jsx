import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { saveAttempt } from "../lib/quizApi.js";
import { shuffleQuizQuestions } from "../utils/shuffle.js";
import Flashcards from "../components/Flashcards.jsx";
import MultipleChoice from "../components/MultipleChoice.jsx";
import Summary from "../components/Summary.jsx";

export default function QuizRunnerPage({ activeQuiz, setActiveQuiz }) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [phase, setPhase] = useState("quiz"); // quiz | summary
    const [answers, setAnswers] = useState({});
    const [runKey, setRunKey] = useState(0);

    // Re-shuffle every time runKey changes (fresh order per attempt, incl. retakes)
    const questions = useMemo(() => {
        if (!activeQuiz) return [];
        return shuffleQuizQuestions(activeQuiz.questions, activeQuiz.mode);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeQuiz, runKey]);

    if (!activeQuiz) {
        navigate("/");
        return null;
    }

    const { mode, quizId, title, recordAttempts } = activeQuiz;

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
        setPhase("quiz");
        setRunKey((k) => k + 1); // triggers re-shuffle via useMemo
    }

    function handleRestart() {
        setActiveQuiz(null);
        navigate("/");
    }

    return (
        <div className="page">
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
                    onSaved={handleSaved}
                    onRetake={handleRetake}
                    onRestart={handleRestart}
                />
            )}
        </div>
    );
}
