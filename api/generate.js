const MODEL_CONFIGS = {
    "gemini-3.5-flash-lite": {
        maxOutputTokens: 16000,
        label: "Gemini 3.5 Flash-Lite (fastest, cheapest)",
    },
    "gemini-3.1-flash-lite": {
        maxOutputTokens: 16000,
        label: "Gemini 3.1 Flash-Lite (frontier-class, low cost)",
    },
    "gemini-3.6-flash": {
        maxOutputTokens: 20000,
        label: "Gemini 3.6 Flash (strongest reasoning, higher cost)",
    },
};

const ACTIVE_MODEL = "gemini-3.5-flash-lite"; // <-- CHANGE THIS LINE TO SWITCH MODELS, then redeploy

const MODEL = ACTIVE_MODEL;
const MAX_OUTPUT_TOKENS = MODEL_CONFIGS[ACTIVE_MODEL].maxOutputTokens;

const BATCH_SIZE = 12;
const MAX_CONCURRENT = 1; // sequential, not parallel — avoids the Windows/Node libuv crash
const MAX_SOURCE_CHARS = 60000;
const MAX_TOPUP_ROUNDS = 6;
const MAX_TOPUP_ROUNDS_EXTRACT = 2;
const NUM_CHUNKS = 6;

const VERIFY_BATCH_SIZE = 20;
const VERIFY_MAX_CONCURRENT = 1; // sequential, same reason

const SOFT_DEADLINE_MS = 52000;
const SHORT_SOURCE_THRESHOLD = 3000;

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

function needsExpansion(sourceText) {
    if (sourceText.length < SHORT_SOURCE_THRESHOLD) return true;
    const lines = sourceText.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length === 0) return false;
    const avgLineLen = sourceText.length / lines.length;
    return avgLineLen < 70 && lines.length >= 4;
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }

    const startTime = Date.now();
    const timeLeft = () => SOFT_DEADLINE_MS - (Date.now() - startTime);

    try {
        const { text, mode, count } = req.body || {};
        const sourceMode = req.body?.sourceMode || "ai";

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

        let sourceText = text.slice(0, MAX_SOURCE_CHARS);
        const targetCount = Math.min(Number(count) || 0, 150);
        let usedExpansion = false;

        if (
            sourceMode === "ai" &&
            needsExpansion(sourceText) &&
            timeLeft() > 15000
        ) {
            try {
                const expanded = await callGeminiText(
                    apiKey,
                    buildExpansionPrompt(sourceText),
                );
                if (
                    expanded &&
                    expanded.trim().length > sourceText.length * 1.5
                ) {
                    sourceText = expanded.trim().slice(0, MAX_SOURCE_CHARS);
                    usedExpansion = true;
                } else {
                    console.warn(
                        "Expansion result too short, keeping original source.",
                    );
                }
            } catch (err) {
                console.warn(
                    "Expansion pass failed, continuing with original source:",
                    err.message,
                );
            }
        }

        let batchCounter = 0;
        const seen = new Set();
        let deduped = [];

        function getChunk(batchIndex) {
            const chunkSize = Math.ceil(sourceText.length / NUM_CHUNKS);
            const chunkIdx = batchIndex % NUM_CHUNKS;
            const start = Math.max(0, chunkIdx * chunkSize - 300);
            return sourceText.slice(start, start + chunkSize + 600);
        }

        function recentQuestionSummaries(limit) {
            const lim = limit || 60;
            return (
                deduped
                    .slice(-lim)
                    .map(function (q) {
                        return mode === "flashcard" ? q.front : q.question;
                    })
                    .join(" | ") || "none yet"
            );
        }

        function buildSizeList(n) {
            const sizes = [];
            let rem = n;
            while (rem > 0) {
                const size = Math.min(BATCH_SIZE, rem);
                sizes.push(size);
                rem -= size;
            }
            return sizes;
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

        async function runBatches(sizes) {
            for (let i = 0; i < sizes.length; i += MAX_CONCURRENT) {
                if (timeLeft() < 6000) break;
                const chunk = sizes.slice(i, i + MAX_CONCURRENT);
                const chunkPromises = chunk.map((size) => {
                    const batchIndex = batchCounter++;
                    const chunkText = usedExpansion
                        ? sourceText
                        : getChunk(batchIndex);
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
                                  usedExpansion,
                              );
                    return callGeminiWithRetry(apiKey, prompt).catch((err) => {
                        console.error(
                            "Batch " + batchIndex + " failed permanently:",
                            err.message,
                        );
                        return [];
                    });
                });
                const chunkResults = await Promise.all(chunkPromises);
                mergeValid(chunkResults.flat());
            }
        }

        await runBatches(buildSizeList(targetCount));

        const maxTopups =
            sourceMode === "extract"
                ? MAX_TOPUP_ROUNDS_EXTRACT
                : MAX_TOPUP_ROUNDS;
        let topupRound = 0;
        while (
            deduped.length < targetCount &&
            topupRound < maxTopups &&
            timeLeft() > 6000
        ) {
            const shortfall = targetCount - deduped.length;
            const before = deduped.length;
            await runBatches(buildSizeList(shortfall));
            if (deduped.length === before) break;
            topupRound++;
        }

        if (deduped.length === 0) {
            res.status(500).json({
                error:
                    sourceMode === "extract"
                        ? 'No extractable questions were found in this text. Try "AI Generated" mode instead.'
                        : "The model did not return any valid questions. Try again, or try a smaller count.",
            });
            return;
        }

        let finalQuestions = deduped.slice(0, targetCount);

        if (mode === "mcq" && timeLeft() > 12000) {
            finalQuestions = await verifyAnswers(
                apiKey,
                finalQuestions,
                sourceText,
                timeLeft,
            );
        }

        res.status(200).json({
            questions: finalQuestions,
            generatedCount: finalQuestions.length,
            requestedCount: targetCount,
        });
    } catch (err) {
        console.error("Generation error:", err);
        res.status(500).json({
            error: err.message || "Failed to generate questions.",
            debug: {
                stack: err.stack ? err.stack.slice(0, 800) : null,
                name: err.name,
            },
        });
    }
}

async function verifyAnswers(apiKey, questions, sourceText, timeLeft) {
    const chunks = [];
    for (let i = 0; i < questions.length; i += VERIFY_BATCH_SIZE) {
        chunks.push(questions.slice(i, i + VERIFY_BATCH_SIZE));
    }

    const verifiedChunks = new Array(chunks.length).fill(null);

    for (let i = 0; i < chunks.length; i += VERIFY_MAX_CONCURRENT) {
        if (timeLeft() < 6000) {
            for (let j = i; j < chunks.length; j++)
                verifiedChunks[j] = chunks[j];
            break;
        }
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
    return (
        "You are a strict fact-checker reviewing a multiple-choice quiz for accuracy against its source material.\n\n" +
        'For each question below, verify "correctIndex" truly points to the correct choice per the SOURCE MATERIAL. Fix it if wrong. Preserve $...$ math notation and \\n line breaks. Ensure every math symbol is wrapped in single $ signs.\n\n' +
        'Return a JSON array, same length and order, same keys ("question","choices","correctIndex","explanation"). Respond with ONLY the JSON array.\n\n' +
        "QUESTIONS TO VERIFY:\n" +
        JSON.stringify(questionChunk) +
        "\n\n" +
        'SOURCE MATERIAL:\n"""' +
        sourceText +
        '"""'
    );
}

function buildExpansionPrompt(sourceText) {
    return (
        'The text below is a short, dense list — likely law/act citations, acronym mappings (e.g. "RA 1234 -> Some Act Name"), memo/order numbers, or bare facts. On its own it is too brief to write many distinct, non-repetitive quiz questions from.\n\n' +
        "Expand it into a detailed study passage. For EVERY SINGLE item/pair in the list (do not skip any), write a full paragraph covering:\n" +
        "1. What it fully stands for and what it actually establishes, mandates, or covers.\n" +
        "2. Who it applies to (teachers, schools, students, institutions, etc.) and why it matters in the Philippine education/professional context.\n" +
        '3. A realistic scenario: a specific situation where a teacher, school administrator, or student would need to know or apply this — written as a short "For example..." case.\n\n' +
        "If an item is just an acronym-to-name mapping with no other detail given, use your own general knowledge of that specific Philippine law/policy to write an accurate, substantive paragraph about it — do not just restate the mapping.\n\n" +
        "Keep the source's language (English, unless otherwise indicated). Write as flowing paragraphs, one per item, in the same order as the list. This will be used as the sole source material for generating 50-150 quiz questions, so make it long and detailed enough to support that.\n\n" +
        "Respond with ONLY the expanded passage text — no JSON, no markdown headers, no meta-commentary.\n\n" +
        'SOURCE TEXT:\n"""' +
        sourceText +
        '"""'
    );
}

function buildExtractPrompt(mode, count, sourceText, avoidList) {
    const mathInstruction =
        "Write ALL math using LaTeX wrapped in single dollar signs (e.g. $x^2$, $\\infty$, $\\frac{a}{b}$), matching what appears in the source.";

    if (mode === "flashcard") {
        return (
            "The text below is an exam, worksheet, or study material that already contains its own questions and answers.\n\n" +
            "Extract up to " +
            count +
            " existing question-and-answer pairs VERBATIM from this text — do not invent, paraphrase, or rephrase. Only fix obvious OCR/extraction typos.\n\n" +
            mathInstruction +
            "\n\n" +
            "Do not repeat any of these already-used items: " +
            avoidList +
            "\n\n" +
            "If this excerpt has no extractable Q&A content, return an empty JSON array: []\n\n" +
            'Return a JSON array of objects: {"front": "exact original question/term", "back": "exact original answer/definition"}. Respond with ONLY the JSON array, no markdown, no commentary.\n\n' +
            'SOURCE TEXT:\n"""' +
            sourceText +
            '"""'
        );
    }

    return (
        "The text below is an exam, worksheet, or study material that already contains its own multiple-choice questions with answer choices.\n\n" +
        "Extract up to " +
        count +
        " existing multiple-choice questions VERBATIM — copy the exact original wording. Do NOT invent new questions. Only fix obvious typos.\n\n" +
        'For each: if a source answer key exists use it for "correctIndex"; otherwise use your own judgment. Write a brief "explanation".\n\n' +
        mathInstruction +
        "\n\n" +
        "Do not repeat any of these already-used questions: " +
        avoidList +
        "\n\n" +
        "If no extractable multiple-choice questions exist, return an empty JSON array: []\n\n" +
        'Return a JSON array of objects: {"question": "exact original question", "choices": [4 exact original choice strings], "correctIndex": 0-3, "explanation": "string"}. Respond with ONLY the JSON array, no markdown, no commentary.\n\n' +
        'SOURCE TEXT:\n"""' +
        sourceText +
        '"""'
    );
}

function buildPrompt(
    mode,
    count,
    sourceText,
    batchIndex,
    avoidList,
    usedExpansion,
) {
    const languageInstruction =
        "IMPORTANT LANGUAGE RULE: The source material below may mix languages (e.g. Filipino/Tagalog sentences next to English ones). For EACH question, write it in the same language as the specific sentence/paragraph it is based on.";

    const formattingInstruction =
        'FORMATTING RULE: If a question includes enumerated statements (e.g. "I. ... II. ..."), insert a literal newline (\\n) before each item.';

    const mathInstruction =
        "MATH FORMATTING RULE: Write ALL math using LaTeX wrapped in single dollar signs — every symbol. Examples: $x^2$, $\\frac{a}{b}$, $\\infty$, $\\pi$.";

    const selfContainedInstruction =
        'SELF-CONTAINED RULE — CRITICAL: Never write a question that references the source\'s own numbering/labeling (e.g. "problem 7," "page 2," "choice (C)"). Every question must be fully self-contained.';

    const noDiagramInstruction =
        'TEXT-ONLY RULE: No images/diagrams are available. Never reference "the diagram," "the graph," or "the figure."';

    const expansionNote = usedExpansion
        ? "NOTE: The source material below has been expanded from a short list into a full explanatory passage with per-item context and example scenarios — use the full richness of it to maximize question variety across ALL items covered, not just the first few."
        : "";

    const duplicateAvoidance =
        "Do NOT repeat or rephrase any of these already-used questions/fronts: " +
        avoidList;

    if (mode === "flashcard") {
        const flashcardTypeInstruction =
            'QUESTION TYPE PRIORITY FOR FLASHCARDS — IMPORTANT: Flashcards have no answer choices, so they work best as direct identification/enumeration items — e.g. "front": "What does RA 4670 stand for?" or "Enumerate the key provisions of RA 9155." or "What is [term]?", "back": the clear, specific fact/name/definition. PRIORITIZE covering every distinct fact, law, term, or item in the source with one clear identification-style flashcard FIRST. Only after every distinct item already has a straightforward identification flashcard, you may add a SMALL number of scenario-style fronts as bonus variety — but even then, the "back" must still be a short, specific, unambiguous answer, never an open-ended explanation. If the requested count is less than or equal to the number of distinct items in the source, use ONLY identification-style flashcards.';

        return (
            "You are creating study flashcards from the source material below.\n" +
            "Generate EXACTLY " +
            count +
            ' flashcards as a JSON array. Each item: {"front": string, "back": string}.\n\n' +
            languageInstruction +
            "\n" +
            formattingInstruction +
            "\n" +
            mathInstruction +
            "\n" +
            selfContainedInstruction +
            "\n" +
            noDiagramInstruction +
            "\n" +
            flashcardTypeInstruction +
            "\n" +
            expansionNote +
            "\n" +
            duplicateAvoidance +
            "\n\n" +
            "Base flashcards strictly on the SOURCE MATERIAL below. Spread coverage across ALL items in the source, not just the beginning.\n" +
            "Respond with ONLY a valid JSON array of exactly " +
            count +
            " items. No markdown, no commentary.\n\n" +
            'SOURCE MATERIAL:\n"""' +
            sourceText +
            '"""'
        );
    }

    const mcqTypeInstruction =
        "QUESTION TYPE MIX FOR MULTIPLE CHOICE — IMPORTANT: Use a mix of two styles: 1. IDENTIFICATION-STYLE MCQ: a direct question with 4 choices testing recall of a specific fact, law, term, or name. 2. SITUATIONAL/CASE-STYLE MCQ: a short realistic scenario requiring the reader to apply the relevant law/concept to choose the correct action among 4 choices. SEQUENCING RULE: First, ensure every distinct item/fact in the source has at least one identification-style question covering it. Only AFTER every distinct item has been covered should you add situational questions for additional variety, up to the requested count. If the requested count is less than or equal to the number of distinct items in the source, use MOSTLY identification-style questions with at most one or two situational ones. If the requested count is larger than the number of distinct items, situational questions should fill the remainder.";

    return (
        "You are creating a multiple-choice quiz from the source material below, in the style of a professional licensure/board examination.\n" +
        "Generate EXACTLY " +
        count +
        ' questions as a JSON array. Each item: {"question": string, "choices": [4 strings], "correctIndex": 0-3, "explanation": string}.\n\n' +
        languageInstruction +
        "\n" +
        formattingInstruction +
        "\n" +
        mathInstruction +
        "\n" +
        selfContainedInstruction +
        "\n" +
        noDiagramInstruction +
        "\n" +
        mcqTypeInstruction +
        "\n" +
        expansionNote +
        "\n\n" +
        'ACCURACY RULE: Double-check "correctIndex" truly points to the correct choice.\n\n' +
        duplicateAvoidance +
        "\n\n" +
        "Base questions strictly on the SOURCE MATERIAL below. Spread coverage across ALL items in the source, not just the beginning.\n" +
        "Respond with ONLY a valid JSON array of exactly " +
        count +
        " items. No markdown, no commentary.\n\n" +
        'SOURCE MATERIAL:\n"""' +
        sourceText +
        '"""'
    );
}

async function callGeminiWithRetry(apiKey, prompt, retries) {
    const attemptsLeft = typeof retries === "number" ? retries : 1;
    try {
        return await callGemini(apiKey, prompt);
    } catch (err) {
        if (attemptsLeft <= 0) throw err;
        await new Promise((r) => setTimeout(r, 600));
        return callGeminiWithRetry(apiKey, prompt, attemptsLeft - 1);
    }
}

function repairJsonEscapes(str) {
    return str.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
}

function safeParseJsonArray(rawText) {
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const attempts = [rawText, cleaned, repairJsonEscapes(cleaned)];
    for (const attempt of attempts) {
        try {
            const parsed = JSON.parse(attempt);
            if (Array.isArray(parsed)) return parsed;
        } catch (e) {
            // try next attempt
        }
    }
    throw new Error(
        "Could not parse Gemini response as valid JSON, even after repair.",
    );
}

async function callGemini(apiKey, prompt) {
    const url =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        MODEL +
        ":generateContent?key=" +
        apiKey;

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
            "Gemini API error (" +
                response.status +
                "): " +
                errText.slice(0, 300),
        );
    }

    const data = await response.json();
    const rawText =
        data &&
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0] &&
        data.candidates[0].content.parts[0].text;
    if (!rawText) throw new Error("Gemini returned an empty response.");
    return safeParseJsonArray(rawText);
}

async function callGeminiText(apiKey, prompt) {
    const url =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        MODEL +
        ":generateContent?key=" +
        apiKey;

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(
            "Gemini API error (" +
                response.status +
                "): " +
                errText.slice(0, 300),
        );
    }

    const data = await response.json();
    const rawText =
        data &&
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0] &&
        data.candidates[0].content.parts[0].text;
    if (!rawText) throw new Error("Gemini returned an empty response.");
    return rawText;
}
