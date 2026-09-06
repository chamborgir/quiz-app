import { useState } from "react";
import { extractTextFromPdf } from "../utils/pdf.js";
import { extractTextFromDocx } from "../utils/docx.js";
import Icon from "./Icon.jsx";

const DOCX_MIME =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export default function UploadStep({ onExtracted }) {
    const [fileName, setFileName] = useState("");
    const [extracting, setExtracting] = useState(false);
    const [error, setError] = useState("");

    async function handleFile(file) {
        if (!file) return;

        const isPdf = file.type === "application/pdf";
        const isDocx =
            file.type === DOCX_MIME ||
            file.name.toLowerCase().endsWith(".docx");

        if (!isPdf && !isDocx) {
            setError("Please upload a PDF or Word (.docx) file.");
            return;
        }

        setError("");
        setFileName(file.name);
        setExtracting(true);
        try {
            const text = isPdf
                ? await extractTextFromPdf(file)
                : await extractTextFromDocx(file);
            if (!text || text.length < 50) {
                setError(
                    "Could not extract enough text from this file. Try another one.",
                );
                setExtracting(false);
                return;
            }
            setExtracting(false);
            onExtracted(text, file.name);
        } catch (err) {
            console.error(err);
            setError("Failed to read this file. Please try a different one.");
            setExtracting(false);
        }
    }

    return (
        <div className="card">
            <label
                className="upload-zone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                    e.preventDefault();
                    handleFile(e.dataTransfer.files[0]);
                }}
            >
                <input
                    type="file"
                    accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    style={{ display: "none" }}
                    onChange={(e) => handleFile(e.target.files[0])}
                />
                <Icon name="upload" size={36} />{" "}
                <p>
                    <strong>Click to upload</strong> or drag & drop
                </p>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    PDF or Word (.docx) — notes, chapters, articles, etc.
                </p>
                {fileName && !extracting && (
                    <div className="file-name">✓ {fileName} loaded</div>
                )}
                {extracting && (
                    <div className="file-name">Extracting text…</div>
                )}
            </label>
            {error && (
                <div className="error-box" style={{ marginTop: "1rem" }}>
                    {error}
                </div>
            )}
        </div>
    );
}
