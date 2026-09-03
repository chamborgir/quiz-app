const MODEL = "gemini-3.5-flash-lite";
const BATCH_SIZE = 50; // 50/100/150 all divide evenly into full-size batches
const MAX_CONCURRENT = 3; // enough to cover 150 items (3 batches) in a single round
const MAX_SOURCE_CHARS = 60000; // gemini-3.5-flash-lite has a 1M-token context, this is a cost/speed guard, not a hard limit
const MAX_OUTPUT_TOKENS = 16000; // generous for a 50-item batch with explanations, well under the 65,536 cap

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

        const batchSizes = [];
        let remaining = targetCount;
        while (remaining > 0) {
            const size = Math.min(BATCH_SIZE, remaining);
            batchSizes.push(size);
            remaining -= size;
        }

        const allQuestions = [];
        const errors = [];

        for (let i = 0; i < batchSizes.length; i += MAX_CONCURRENT) {
            const chunk = batchSizes.slice(i, i + MAX_CONCURRENT);
            const chunkPromises = chunk.map((size, j) => {
                const batchIndex = i + j;
                return callGeminiWithRetry(
                    apiKey,
                    buildPrompt(mode, size, sourceText, batchIndex),
                ).catch((err) => {
                    console.error(
                        `Batch ${batchIndex} failed permanently:`,
                        err.message,
                    );
                    errors.push(err.message);
                    return [];
                });
            });
            const chunkResults = await Promise.all(chunkPromises);
            allQuestions.push(...chunkResults.flat());
        }

        const seen = new Set();
        const deduped = allQuestions.filter((q) => {
            const key = mode === "flashcard" ? q.front : q.question;
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        if (deduped.length === 0) {
            res.status(500).json({
                error: errors.length
                    ? `The model did not return any questions. Details: ${errors[0]}`
                    : "The model did not return any questions. Try again.",
            });
            return;
        }

        res.status(200).json({ questions: deduped.slice(0, targetCount) });
    } catch (err) {
        console.error("Generation error:", err);
        res.status(500).json({
            error: err.message || "Failed to generate questions.",
        });
    }
}

function buildPrompt(mode, count, sourceText, batchIndex) {
    if (mode === "flashcard") {
        return `You are creating study flashcards from the source material below.
Generate exactly ${count} flashcards as a JSON array.
Each item must be an object with exactly these keys:
- "front": a short question or term (string)
- "back": the answer or definition (string)

This is batch #${batchIndex + 1} of a larger set — focus on a distinct slice/section of the material so batches don't overlap in topic.
Base every flashcard strictly on the source material.
Respond with ONLY a valid JSON array. No markdown, no commentary, no code fences.

SOURCE MATERIAL:
"""${sourceText}"""`;
    }

    return `You are creating a multiple-choice quiz from the source material below.
Generate exactly ${count} questions as a JSON array.
Each item must be an object with exactly these keys:
- "question": the question text (string)
- "choices": an array of exactly 4 answer strings
- "correctIndex": integer 0-3, the index of the correct choice in "choices"
- "explanation": a short 1-2 sentence explanation of why that answer is correct

Rules:
- Only one choice should be correct.
- Make wrong choices plausible, not obviously wrong.
- This is batch #${batchIndex + 1} of a larger set — focus on a distinct slice/section of the material so batches don't overlap in topic.
- Base every question strictly on the source material.
Respond with ONLY a valid JSON array. No markdown, no commentary, no code fences.

SOURCE MATERIAL:
"""${sourceText}"""`;
}

async function callGeminiWithRetry(apiKey, prompt, retries = 1) {
    try {
        return await callGemini(apiKey, prompt);
    } catch (err) {
        if (retries <= 0) throw err;
        console.warn("Batch failed, retrying once:", err.message);
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

    if (!rawText) {
        throw new Error("Gemini returned an empty response.");
    }

    let parsed;
    try {
        parsed = JSON.parse(rawText);
    } catch {
        const cleaned = rawText.replace(/```json|```/g, "").trim();
        parsed = JSON.parse(cleaned);
    }

    if (!Array.isArray(parsed)) {
        throw new Error("Gemini response was not a JSON array.");
    }

    return parsed;
}
