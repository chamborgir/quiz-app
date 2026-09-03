import { useState } from "react";
import { extractTextFromPdf } from "../utils/pdf.js";

export default function UploadStep({ onExtracted }) {
    const [fileName, setFileName] = useState("");
    const [extracting, setExtracting] = useState(false);
    const [error, setError] = useState("");

    async function handleFile(file) {
        if (!file || file.type !== "application/pdf") {
            setError("Please upload a valid PDF file.");
            return;
        }
        setError("");
        setFileName(file.name);
        setExtracting(true);
        try {
            const text = await extractTextFromPdf(file);
            if (!text || text.length < 50) {
                setError(
                    "Could not extract enough text from this PDF. Try another file.",
                );
                setExtracting(false);
                return;
            }
            setExtracting(false);
            onExtracted(text, file.name);
        } catch (err) {
            console.error(err);
            setError("Failed to read PDF. Please try a different file.");
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
                    accept="application/pdf"
                    style={{ display: "none" }}
                    onChange={(e) => handleFile(e.target.files[0])}
                />
                <div style={{ fontSize: "2.5rem" }}>📄</div>
                <p>
                    <strong>Click to upload</strong> or drag & drop a PDF
                </p>
                <p style={{ color: "#64748b", fontSize: "0.85rem" }}>
                    Study notes, textbook chapters, articles, etc.
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
