import katex from "katex";
import { formatQuestionText } from "../utils/formatText.js";

function renderMathSegments(line, keyPrefix) {
    const parts = line.split(/(\$[^$]+\$)/g);
    return parts.map((part, i) => {
        if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
            const expr = part.slice(1, -1);
            try {
                const html = katex.renderToString(expr, {
                    throwOnError: false,
                    output: "html",
                });
                return (
                    <span
                        key={`${keyPrefix}-${i}`}
                        dangerouslySetInnerHTML={{ __html: html }}
                    />
                );
            } catch {
                return <span key={`${keyPrefix}-${i}`}>{part}</span>;
            }
        }
        return <span key={`${keyPrefix}-${i}`}>{part}</span>;
    });
}

export default function FormattedText({ text }) {
    if (!text) return null;
    const formatted = formatQuestionText(text);
    const lines = formatted.split("\n");

    if (lines.length === 1) {
        return <>{renderMathSegments(lines[0], "l0")}</>;
    }

    return (
        <>
            {lines.map((line, i) => (
                <div key={i} className="formatted-line">
                    {renderMathSegments(line, `l${i}`)}
                </div>
            ))}
        </>
    );
}
