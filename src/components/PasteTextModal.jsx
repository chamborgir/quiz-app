import { useState } from "react";

export default function PasteTextModal({ onClose, onGenerate }) {
    const [text, setText] = useState("");
    const [error, setError] = useState("");

    function handleGenerate() {
        if (text.trim().length < 20) {
            setError("Please paste a bit more text to work with.");
            return;
        }
        onGenerate(text.trim());
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="paste-modal-card"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    className="modal-close"
                    onClick={onClose}
                    aria-label="Close"
                >
                    ×
                </button>
                <h3>Paste Text Directly</h3>
                {error && <div className="error-box">{error}</div>}
                <textarea
                    className="paste-textarea"
                    placeholder="Paste your notes, an article, or any text content here…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    autoFocus
                />
                <div className="paste-modal-footer">
                    <button className="btn" onClick={handleGenerate}>
                        Generate
                    </button>
                </div>
            </div>
        </div>
    );
}
