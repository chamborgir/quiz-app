// Ensures enumerated statement lists (Roman numeral or numbered) always break onto separate lines,
// even as a fallback if the model didn't include explicit newlines.
export function formatQuestionText(text) {
    if (!text) return text;
    return text
        .replace(/\s+((?:[IVXLCDM]{1,4}|[0-9]{1,2})[.)])\s+/g, "\n$1 ")
        .trim();
}
