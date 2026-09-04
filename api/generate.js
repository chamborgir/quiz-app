const MODEL = "gemini-3.5-flash-lite";
const BATCH_SIZE = 50;
const MAX_CONCURRENT = 3;
const MAX_SOURCE_CHARS = 60000;
const MAX_OUTPUT_TOKENS = 16000;
const MAX_TOPUP_ROUNDS = 6;
const MAX_TOPUP_ROUNDS_EXTRACT = 2; // extraction can't invent content, so cap retries lower
const NUM_CHUNKS = 6;

const VERIFY_BATCH_SIZE = 30;
const VERIFY_MAX_CONCURRENT = 5;

const SELF_REFERENTIAL_PATTERNS = [
    /\bproblem\s*#?\d+\b/i,
    /\bquestion\s*#?\d+\b/i,
    /\bpage\s*\d+\s*(of\s*\d+)?\b/i,
    /\bstatement\s*\(?[ivxlc]+\)?/i,
    /\bchoice\s*\([a-d]\)/i,
    /\boption\s*\([a-e]\)/i,
    /\bin\s+(the\s+)?(above|previous|following)\s+(problem|question|statement|exercise)\b/i,
    /\bwhat\s+(is|are)\s+(the\s+)?option/i,
    /\bthe\s+source\s+material\b/i,
    /\bthe\s+document\b/i,
    /\bat\s+the\s+(very\s+)?beginning\s+of\b/i,
    /\bthe\s+diagram\b/i,
    /\bthe\s+graph\s+(shown|below|above)\b/i,
    /\bthe\s+figure\b/i,
];

function isSelfReferential(text) {
    if (!text) return false;
    return SELF_REFERENTIAL_PATTERNS.some((re) => re.test(text));
}

function isValidItem(mode, item, sourceMode) {
    if (mode === "flashcard") {
        if (!item.front || !item.back) return false;
        if (sourceMode === "ai")
            return (
                !isSelfReferential(item.front) && !isSelfReferential(item.back)
            );
        return true;
    }
    if (
        !item.question ||
        !Array.isArray(item.choices) ||
        item.choices.length !== 4
    )
        return false;
    if (
        typeof item.correctIndex !== "number" ||
        item.correctIndex < 0 ||
        item.correctIndex > 3
    )
        return false;
    if (sourceMode === "ai") {
        if (isSelfReferential(item.question)) return false;
        if (item.choices.some((c) => isSelfReferential(c))) return false;
    }
    return true;
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }

    try {
        const { text, mode, count, sourceMode = "ai" } = req.body || {};

        if (!text || !mode || !count) {
            res.status(400).json({ error: "Missing required fields." });
            return;
        }
        if (!["flashcard", "mcq"].includes(mode)) {
            res.status(400).json({ error: "Invalid mode." });
            return;
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            res.status(500).json({
                error: "Server is missing GEMINI_API_KEY.",
            });
            return;
        }

        const sourceText = text.slice(0, MAX_SOURCE_CHARS);
        const targetCount = Math.min(Number(count) || 0, 150);

        let batchCounter = 0;
        const seen = new Set();
        let deduped = [];

        function getChunk(batchIndex) {
            const chunkSize = Math.ceil(sourceText.length / NUM_CHUNKS);
            const chunkIdx = batchIndex % NUM_CHUNKS;
            const start = Math.max(0, chunkIdx * chunkSize - 300);
            return sourceText.slice(start, start + chunkSize + 600);
        }

        function recentQuestionSummaries(limit = 60) {
            return (
                deduped
                    .slice(-limit)
                    .map((q) => (mode === "flashcard" ? q.front : q.question))
                    .join(" | ") || "none yet"
            );
        }

        async function runBatches(sizes) {
            for (let i = 0; i < sizes.length; i += MAX_CONCURRENT) {
                const chunk = sizes.slice(i, i + MAX_CONCURRENT);
                const chunkPromises = chunk.map((size) => {
                    const batchIndex = batchCounter++;
                    const chunkText = getChunk(batchIndex);
                    const avoidList = recentQuestionSummaries();
                    const prompt =
                        sourceMode === "extract"
                            ? buildExtractPrompt(
                                  mode,
                                  size,
                                  chunkText,
                                  avoidList,
                              )
                            : buildPrompt(
                                  mode,
                                  size,
                                  chunkText,
                                  batchIndex,
                                  avoidList,
                              );
                    return callGeminiWithRetry(apiKey, prompt).catch((err) => {
                        console.error(
                            `Batch ${batchIndex} failed permanently:`,
                            err.message,
                        );
                        return [];
                    });
                });
                const chunkResults = await Promise.all(chunkPromises);
                mergeValid(chunkResults.flat());
            }
        }

        function mergeValid(newItems) {
            for (const q of newItems) {
                if (!isValidItem(mode, q, sourceMode)) continue;
                const key = mode === "flashcard" ? q.front : q.question;
                if (!key || seen.has(key)) continue;
                seen.add(key);
                deduped.push(q);
            }
        }

        const initialSizes = [];
        let remaining = targetCount;
        while (remaining > 0) {
            const size = Math.min(BATCH_SIZE, remaining);
            initialSizes.push(size);
            remaining -= size;
        }
        await runBatches(initialSizes);

        const maxTopups =
            sourceMode === "extract"
                ? MAX_TOPUP_ROUNDS_EXTRACT
                : MAX_TOPUP_ROUNDS;
        let topupRound = 0;
        while (deduped.length < targetCount && topupRound < maxTopups) {
            const shortfall = targetCount - deduped.length;
            const topupSizes = [];
            let rem = shortfall;
            while (rem > 0) {
                const size = Math.min(BATCH_SIZE, rem);
                topupSizes.push(size);
                rem -= size;
            }
            const before = deduped.length;
            await runBatches(topupSizes);
            if (sourceMode === "extract" && deduped.length === before) break; // no new content found, stop retrying
            topupRound++;
        }

        if (deduped.length === 0) {
            res.status(500).json({
                error:
                    sourceMode === "extract"
                        ? 'No extractable questions were found in this PDF. Try "AI Generated" mode instead.'
                        : "The model did not return any valid questions. Try again.",
            });
            return;
        }

        let finalQuestions = deduped.slice(0, targetCount);

        if (mode === "mcq") {
            finalQuestions = await verifyAnswers(
                apiKey,
                finalQuestions,
                sourceText,
            );
        }

        res.status(200).json({ questions: finalQuestions });
    } catch (err) {
        console.error("Generation error:", err);
        res.status(500).json({
            error: err.message || "Failed to generate questions.",
        });
    }
}

async function verifyAnswers(apiKey, questions, sourceText) {
    const chunks = [];
    for (let i = 0; i < questions.length; i += VERIFY_BATCH_SIZE) {
        chunks.push(questions.slice(i, i + VERIFY_BATCH_SIZE));
    }

    const verifiedChunks = new Array(chunks.length).fill(null);

    for (let i = 0; i < chunks.length; i += VERIFY_MAX_CONCURRENT) {
        const group = chunks.slice(i, i + VERIFY_MAX_CONCURRENT);
        const groupPromises = group.map((chunk, j) => {
            const chunkIdx = i + j;
            return callGeminiWithRetry(
                apiKey,
                buildVerifyPrompt(chunk, sourceText),
            )
                .then((result) => {
                    verifiedChunks[chunkIdx] =
                        Array.isArray(result) && result.length === chunk.length
                            ? result
                            : chunk;
                })
                .catch(() => {
                    verifiedChunks[chunkIdx] = chunk;
                });
        });
        await Promise.all(groupPromises);
    }

    return verifiedChunks.flat();
}

function buildVerifyPrompt(questionChunk, sourceText) {
    return `You are a strict fact-checker reviewing a multiple-choice quiz for accuracy against its source material.

For each question below, verify "correctIndex" truly points to the correct choice per the SOURCE MATERIAL. Fix it if wrong. Preserve $...$ math notation and \\n line breaks. Ensure every math symbol is wrapped in single $ signs.

Return a JSON array, same length and order, same keys ("question","choices","correctIndex","explanation"). Respond with ONLY the JSON array.

QUESTIONS TO VERIFY:
${JSON.stringify(questionChunk)}

SOURCE MATERIAL:
"""${sourceText}"""`;
}

function buildExtractPrompt(mode, count, sourceText, avoidList) {
    const mathInstruction = `Write ALL math using LaTeX wrapped in single dollar signs (e.g. $x^2$, $\\infty$, $\\frac{a}{b}$), matching what appears in the source, even if the source uses plain text for it.`;

    if (mode === "flashcard") {
        return `The text below is an exam, worksheet, or study material that already contains its own questions and answers (or facts that pair naturally as a question/answer).

Extract up to ${count} existing question-and-answer pairs VERBATIM from this text — do not invent, paraphrase, or rephrase. Only fix obvious OCR/extraction typos (broken spacing, garbled characters). If the source doesn't clearly pair a question with its answer, skip it rather than guessing.

${mathInstruction}

Do not repeat any of these already-used items: ${avoidList}

If this excerpt has no extractable Q&A content, return an empty JSON array: []

Return a JSON array of objects: {"front": "the exact original question/term", "back": "the exact original answer/definition"}. Respond with ONLY the JSON array, no markdown, no commentary.

SOURCE TEXT:
"""${sourceText}"""`;
    }

    return `The text below is an exam, worksheet, or study material that already contains its own multiple-choice questions with their own answer choices.

Extract up to ${count} existing multiple-choice questions VERBATIM from this text — copy the exact original question wording and exact original choice wording. Do NOT invent new questions, do NOT paraphrase, do NOT create questions about page numbers, problem numbers, or labels — only copy real question content that is actually present. Only fix obvious OCR/extraction typos.

For each extracted question:
- If the source shows an answer key or indicates the correct answer, use that to set "correctIndex".
- If no answer key is visible, use your own subject-matter judgment to determine which choice is correct.
- Write a brief 1-2 sentence "explanation" for why that answer is correct.

${mathInstruction}

Do not repeat any of these already-used questions: ${avoidList}

If this excerpt has no extractable multiple-choice questions, return an empty JSON array: []

Return a JSON array of objects: {"question": "exact original question", "choices": [4 exact original choice strings], "correctIndex": 0-3, "explanation": "string"}. Respond with ONLY the JSON array, no markdown, no commentary.

SOURCE TEXT:
"""${sourceText}"""`;
}

function buildPrompt(mode, count, sourceText, batchIndex, avoidList) {
    const languageInstruction = `IMPORTANT LANGUAGE RULE: The source material below may mix languages (e.g. Filipino/Tagalog sentences next to English ones). Read it sentence by sentence or paragraph by paragraph — do NOT judge the "overall" language of the whole document. For EACH question you write, base it on one specific sentence or paragraph, and write that question (plus its choices/answer/explanation) in the SAME language as that specific sentence or paragraph.`;

    const formattingInstruction = `FORMATTING RULE: If a question includes a list of enumerated statements (e.g. "I. ... II. ..." or "1. ... 2. ..."), insert a literal newline (\\n) before each item so each appears on its own line.`;

    const mathInstruction = `MATH FORMATTING RULE: Write ALL math using LaTeX wrapped in single dollar signs — every symbol, not just full equations. Examples: $x^2 + 3x - 4 = 0$, $\\frac{a}{b}$, $\\sqrt{16}$, $\\infty$, $-\\infty$, $\\pi$. Apply this in "question", "choices", "front", "back", and "explanation" wherever math appears.`;

    const selfContainedInstruction = `SELF-CONTAINED RULE — CRITICAL: The source material may already be a worksheet or exam with its own numbered questions/problems, lettered choices, page numbers, and section labels. You are FORBIDDEN from writing any question that mentions or depends on this original numbering/labeling, such as "What is choice (C) for problem 7?" or "What page number is Page 2?" or "In statement (i) of problem 4...". Instead, extract the actual underlying content and ask about it directly, fully self-contained, with zero references to "the source," "the document," "question N," "problem N," "page N," or any external numbering.`;

    const noDiagramInstruction = `TEXT-ONLY RULE: Only extractable text is available — no images or diagrams. Never reference "the diagram," "the graph," "the figure," or ask the reader to look at anything visual.`;

    const duplicateAvoidance = `Do NOT repeat or rephrase any of these already-used questions/fronts: ${avoidList}`;

    if (mode === "flashcard") {
        return `You are creating study flashcards from the source material below.
Generate EXACTLY ${count} flashcards as a JSON array. Each item: {"front": string, "back": string}.

${languageInstruction}
${formattingInstruction}
${mathInstruction}
${selfContainedInstruction}
${noDiagramInstruction}
${duplicateAvoidance}

This is batch #${batchIndex + 1} — base flashcards strictly on the SOURCE MATERIAL excerpt below.
Respond with ONLY a valid JSON array of exactly ${count} items. No markdown, no commentary.

SOURCE MATERIAL:
"""${sourceText}"""`;
    }

    return `You are creating a multiple-choice quiz from the source material below.
Generate EXACTLY ${count} questions as a JSON array. Each item: {"question": string, "choices": [4 strings], "correctIndex": 0-3, "explanation": string}.

${languageInstruction}
${formattingInstruction}
${mathInstruction}
${selfContainedInstruction}
${noDiagramInstruction}

ACCURACY RULE: Double-check "correctIndex" truly points to the correct choice based on the source. Only one choice should be correct.

${duplicateAvoidance}

This is batch #${batchIndex + 1} — base questions strictly on the SOURCE MATERIAL excerpt below.
Respond with ONLY a valid JSON array of exactly ${count} items. No markdown, no commentary.

SOURCE MATERIAL:
"""${sourceText}"""`;
}

async function callGeminiWithRetry(apiKey, prompt, retries = 1) {
    try {
        return await callGemini(apiKey, prompt);
    } catch (err) {
        if (retries <= 0) throw err;
        await new Promise((r) => setTimeout(r, 800));
        return callGeminiWithRetry(apiKey, prompt, retries - 1);
    }
}

// Fixes invalid backslash escapes (common with LaTeX like \infty, \frac) that break JSON.parse
function repairJsonEscapes(str) {
    return str.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
}

function safeParseJsonArray(rawText) {
    const attempts = [rawText, rawText.replace(/```json|```/g, "").trim()];
    attempts.push(repairJsonEscapes(attempts[1]));

    for (const attempt of attempts) {
        try {
            const parsed = JSON.parse(attempt);
            if (Array.isArray(parsed)) return parsed;
        } catch {
            // try next attempt
        }
    }
    throw new Error(
        "Could not parse Gemini response as valid JSON, even after repair.",
    );
}

async function callGemini(apiKey, prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                maxOutputTokens: MAX_OUTPUT_TOKENS,
                responseMimeType: "application/json",
            },
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(
            `Gemini API error (${response.status}): ${errText.slice(0, 300)}`,
        );
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Gemini returned an empty response.");

    return safeParseJsonArray(rawText);
}
