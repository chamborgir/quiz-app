const MODEL = "gemini-3.5-flash-lite";
const BATCH_SIZE = 50;
const MAX_CONCURRENT = 3;
const MAX_SOURCE_CHARS = 60000;
const MAX_OUTPUT_TOKENS = 16000;
const MAX_TOPUP_ROUNDS = 6;
const NUM_CHUNKS = 6;

const VERIFY_BATCH_SIZE = 30;
const VERIFY_MAX_CONCURRENT = 5;
const VERIFY_OUTPUT_TOKENS = 12000;

// Catches questions that reference the source document's own numbering/labeling instead of being self-contained
const SELF_REFERENTIAL_PATTERNS = [
    /\bproblem\s*#?\d+\b/i,
    /\bquestion\s*#?\d+\b/i,
    /\bpage\s*\d+\s*(of\s*\d+)?\b/i,
    /\bexam\s*(a|b|c|d)?\b.*\bpage\b/i,
    /\bstatement\s*\(?[ivxlc]+\)?/i,
    /\bchoice\s*\([a-d]\)/i,
    /\boption\s*\([a-e]\)/i,
    /\bin\s+(the\s+)?(above|previous|following)\s+(problem|question|statement|exercise)\b/i,
    /\bwhat\s+(is|are)\s+(the\s+)?option/i,
    /\bfor\s+(the\s+)?(problem|question)\s*\d*\b/i,
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

function isValidItem(mode, item) {
    if (mode === "flashcard") {
        if (!item.front || !item.back) return false;
        return !isSelfReferential(item.front) && !isSelfReferential(item.back);
    }
    if (
        !item.question ||
        !Array.isArray(item.choices) ||
        item.choices.length !== 4
    )
        return false;
    if (isSelfReferential(item.question)) return false;
    if (item.choices.some((c) => isSelfReferential(c))) return false;
    return true;
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }

    try {
        const { text, mode, count } = req.body || {};

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
                    return callGeminiWithRetry(
                        apiKey,
                        buildPrompt(
                            mode,
                            size,
                            chunkText,
                            batchIndex,
                            avoidList,
                        ),
                    ).catch((err) => {
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
                if (!isValidItem(mode, q)) continue; // silently drop self-referential / malformed items
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

        let topupRound = 0;
        while (deduped.length < targetCount && topupRound < MAX_TOPUP_ROUNDS) {
            const shortfall = targetCount - deduped.length;
            const topupSizes = [];
            let rem = shortfall;
            while (rem > 0) {
                const size = Math.min(BATCH_SIZE, rem);
                topupSizes.push(size);
                rem -= size;
            }
            await runBatches(topupSizes);
            topupRound++;
        }

        if (deduped.length === 0) {
            res.status(500).json({
                error: "The model did not return any valid questions. Try again.",
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
                    if (
                        Array.isArray(result) &&
                        result.length === chunk.length
                    ) {
                        verifiedChunks[chunkIdx] = result;
                    } else {
                        verifiedChunks[chunkIdx] = chunk;
                    }
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

For each question below, verify that "correctIndex" truly points to the factually correct choice, based strictly on the SOURCE MATERIAL. If it is already correct, leave the item unchanged. If it is wrong, fix "correctIndex" (and rewrite "explanation" if needed) so it is accurate. Preserve any $...$ math notation and \\n line breaks exactly as given. Ensure EVERY math symbol (like \\infty, \\sqrt, fractions, exponents) in "question", "choices", and "explanation" is wrapped in single $ signs — if you find one that isn't wrapped, fix it.

Return a JSON array with the EXACT SAME NUMBER of items, in the EXACT SAME ORDER, same keys ("question","choices","correctIndex","explanation") — just corrected where needed. Respond with ONLY the JSON array, no markdown, no commentary.

QUESTIONS TO VERIFY:
${JSON.stringify(questionChunk)}

SOURCE MATERIAL:
"""${sourceText}"""`;
}

function buildPrompt(mode, count, sourceText, batchIndex, avoidList) {
    const languageInstruction = `IMPORTANT LANGUAGE RULE: The source material below may mix languages (e.g. Filipino/Tagalog sentences next to English ones). Read it sentence by sentence or paragraph by paragraph — do NOT judge the "overall" language of the whole document. For EACH question you write, base it on one specific sentence or paragraph, and write that question (plus its choices/answer/explanation) in the SAME language as that specific sentence or paragraph.`;

    const formattingInstruction = `FORMATTING RULE: If a question includes a list of enumerated statements (e.g. "I. ... II. ..." or "1. ... 2. ..."), insert a literal newline (\\n) before each item so each appears on its own line.`;

    const mathInstruction = `MATH FORMATTING RULE: Write ALL math using LaTeX wrapped in single dollar signs — this includes every symbol, not just full equations. Examples: $x^2 + 3x - 4 = 0$, $\\frac{a}{b}$, $\\sqrt{16}$, $\\infty$, $-\\infty$, $\\pi$. Even a single symbol like infinity must be $\\infty$, never a bare "infinity" or unwrapped "\\infty". Apply this in "question", "choices", "front", "back", and "explanation" wherever math appears.`;

    const selfContainedInstruction = `SELF-CONTAINED RULE — CRITICAL, READ CAREFULLY: The source material may already be a worksheet or exam with its own numbered questions/problems, lettered choices, page numbers, and section labels (e.g. "Problem 7", "Page 2 of 8", "Statement (i)", "Choice (C)"). You are FORBIDDEN from writing any question that mentions or depends on this original numbering/labeling. This means you must NEVER write anything shaped like these real examples of what NOT to do:
- "What is choice (C) for the limit evaluation in problem 7?" ❌
- "What page number is indicated for Page 2 of the exam?" ❌
- "In statement (i) of problem 4, what are the two time values mentioned?" ❌
- "What name is given at the very beginning of the source material?" ❌
Instead, extract the actual underlying content and ask about THAT directly, as a standalone question with no reference to where it came from. Correct version of the first bad example above: "What is $\\lim_{x \\to 0} x^4 \\sin(1/x)$?" with real choices like $0$, $1$, $-\\infty$, $\\infty$ (each properly wrapped in $ signs) — no mention of "problem 7" or "choice (C)" anywhere.
Before including a question in your output, silently re-check it: does it mention "problem", "question", "page", "statement", "choice (X)", "option (X)", "the document", "the source", "the beginning", "the diagram", "the graph", or any exam/worksheet label? If yes, REWRITE it to remove that reference and ask about the real content instead, or discard it and pick different content.`;

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

    let parsed;
    try {
        parsed = JSON.parse(rawText);
    } catch {
        parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());
    }
    if (!Array.isArray(parsed))
        throw new Error("Gemini response was not a JSON array.");
    return parsed;
}
