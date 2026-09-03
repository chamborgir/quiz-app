import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { saveQuiz } from "../lib/quizApi.js";
import UploadStep from "../components/UploadStep.jsx";
import SetupStep from "../components/SetupStep.jsx";

export default function Home({ setActiveQuiz }) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [step, setStep] = useState("upload"); // upload | setup | loading
    const [pdfText, setPdfText] = useState("");
    const [fileName, setFileName] = useState("");
    const [error, setError] = useState("");

    function handleExtracted(text, name) {
        setPdfText(text);
        setFileName(name);
        setStep("setup");
        setError("");
    }

    async function handleGenerate(mode, count, title) {
        setStep("loading");
        setError("");
        try {
            const res = await fetch("/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: pdfText, mode, count }),
            });

            const rawBody = await res.text();
            let data;
            try {
                data = rawBody ? JSON.parse(rawBody) : {};
            } catch {
                throw new Error(
                    `Server returned an invalid response (status ${res.status}). Try a smaller count or check the server logs.`,
                );
            }

            if (!res.ok)
                throw new Error(
                    data.error || `Request failed (status ${res.status})`,
                );
            if (!data.questions || data.questions.length === 0)
                throw new Error("No questions were generated.");

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
            setError(
                err.message || "Something went wrong generating your quiz.",
            );
            setStep("setup");
        }
    }

    return (
        <div className="page">
            <div className="hero">
                <h1>Turn any PDF into flashcards or a quiz</h1>
                <p className="muted">
                    Upload notes, a chapter, or an article — get a study set in
                    seconds.
                </p>
            </div>

            {error && <div className="error-box">{error}</div>}

            {step === "upload" && <UploadStep onExtracted={handleExtracted} />}

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
                    <div className="spinner"></div>
                    <p>Generating your quiz…</p>
                    <p className="muted small">
                        This can take up to a minute for larger sets.
                    </p>
                </div>
            )}
        </div>
    );
}
