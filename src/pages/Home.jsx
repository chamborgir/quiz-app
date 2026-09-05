import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { saveQuiz } from "../lib/quizApi.js";
import UploadStep from "../components/UploadStep.jsx";
import SetupStep from "../components/SetupStep.jsx";
import PasteTextModal from "../components/PasteTextModal.jsx";

export default function Home({ setActiveQuiz }) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [step, setStep] = useState("upload");
    const [pdfText, setPdfText] = useState("");
    const [fileName, setFileName] = useState("");
    const [error, setError] = useState("");
    const [progress, setProgress] = useState(0);
    const [showPasteModal, setShowPasteModal] = useState(false);

    const intervalRef = useRef(null);
    const startTimeRef = useRef(null);
    const estimatedMsRef = useRef(10000);

    function estimateDuration(mode, count) {
        if (mode === "flashcard") return 8000 + count * 250;
        return 12000 + (count / 50) * 16000;
    }

    function startProgress(mode, count) {
        estimatedMsRef.current = estimateDuration(mode, count);
        startTimeRef.current = Date.now();
        setProgress(0);
        intervalRef.current = setInterval(() => {
            const elapsed = Date.now() - startTimeRef.current;
            const pct = 95 * (1 - Math.exp(-elapsed / estimatedMsRef.current));
            setProgress(pct);
        }, 150);
    }

    function stopProgress(finalValue) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setProgress(finalValue);
    }

    useEffect(
        () => () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        },
        [],
    );

    function handleExtracted(text, name) {
        setPdfText(text);
        setFileName(name);
        setStep("setup");
        setError("");
    }

    function handlePasteGenerate(text) {
        setShowPasteModal(false);
        handleExtracted(text, "Pasted Text");
    }

    async function handleGenerate(mode, count, title, sourceMode) {
        setStep("loading");
        setError("");
        startProgress(mode, count);
        try {
            const res = await fetch("/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: pdfText,
                    mode,
                    count,
                    sourceMode,
                }),
            });

            const rawBody = await res.text();
            let data;
            try {
                data = rawBody ? JSON.parse(rawBody) : {};
            } catch {
                throw new Error(
                    `Server returned an invalid response (status ${res.status}). Try a smaller count.`,
                );
            }

            if (!res.ok) {
                console.error("Server error details:", data.debug);
                throw new Error(
                    data.error || `Request failed (status ${res.status})`,
                );
            }
            if (!data.questions || data.questions.length === 0)
                throw new Error("No questions were generated.");

            stopProgress(100);

            let quizId = null;
            if (user) {
                try {
                    const saved = await saveQuiz({
                        userId: user.id,
                        title,
                        mode,
                        questions: data.questions,
                        count: data.questions.length,
                    });
                    quizId = saved.id;
                } catch (err) {
                    console.error("Auto-save failed:", err.message);
                }
            }

            setActiveQuiz({
                mode,
                questions: data.questions,
                quizId,
                title,
                recordAttempts: true,
            });
            navigate("/play");
        } catch (err) {
            console.error(err);
            stopProgress(0);
            setError(
                err.message || "Something went wrong generating your quiz.",
            );
            setStep("setup");
        }
    }

    return (
        <div className="page">
            <div className="hero">
                <h1>Turn any text into flashcards or a quiz</h1>
                <p className="muted">
                    Upload PDFs, MSWord documents, notes, a chapter, or an article and get a study
                    set in seconds.
                </p>
            </div>

            {error && <div className="error-box">{error}</div>}

            {step === "upload" && (
                <>
                    <div className="dual-input-row">
                        <div className="dual-input-col">
                            <UploadStep onExtracted={handleExtracted} />
                        </div>
                        <div className="dual-input-col">
                            <div className="card paste-text-outer">
                                <button
                                    className="paste-text-card"
                                    onClick={() => setShowPasteModal(true)}
                                >
                                    <span className="paste-text-icon">📋</span>
                                    <span className="paste-text-label">
                                        Paste Text Directly
                                    </span>
                                    <span className="paste-text-sub">
                                        Skip uploads — paste notes or an article
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="or-divider">
                        <span>or</span>
                    </div>

                    {user ? (
                        <Link
                            to="/create"
                            className="btn btn-secondary btn-block create-link"
                        >
                            Create Your Own Quiz
                        </Link>
                    ) : (
                        <div className="card center-content">
                            <p
                                className="muted small"
                                style={{ marginBottom: "0.75rem" }}
                            >
                                Sign in to create your own flashcards or
                                questions manually.
                            </p>
                            <Link to="/auth" className="btn btn-secondary">
                                Sign in to create
                            </Link>
                        </div>
                    )}
                </>
            )}

            {step === "setup" && (
                <SetupStep
                    fileName={fileName}
                    defaultTitle={fileName.replace(/\.pdf$/i, "")}
                    onBack={() => setStep("upload")}
                    onGenerate={handleGenerate}
                />
            )}

            {step === "loading" && (
                <div className="card center-content">
                    <p style={{ marginBottom: "0.25rem", fontWeight: 600 }}>
                        Generating your quiz…
                    </p>
                    <div className="progress-bar-track">
                        <div
                            className="progress-bar-fill"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="muted small" style={{ marginTop: "0.6rem" }}>
                        {Math.round(progress)}%
                    </p>
                    <p className="muted small">
                        Larger sets take longer — this can run up to a minute.
                    </p>
                </div>
            )}

            {showPasteModal && (
                <PasteTextModal
                    onClose={() => setShowPasteModal(false)}
                    onGenerate={handlePasteGenerate}
                />
            )}
        </div>
    );
}
