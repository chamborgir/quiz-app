const MODEL = "gemini-3.5-flash-lite";
const BATCH_SIZE = 50;
const MAX_CONCURRENT = 3;
const MAX_SOURCE_CHARS = 60000;
const MAX_OUTPUT_TOKENS = 16000;
const MAX_TOPUP_ROUNDS = 5; // safety cap so a stubborn shortfall can't loop forever

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

        async function runBatches(sizes) {
            const collected = [];
            for (let i = 0; i < sizes.length; i += MAX_CONCURRENT) {
                const chunk = sizes.slice(i, i + MAX_CONCURRENT);
                const chunkPromises = chunk.map((size) => {
                    const batchIndex = batchCounter++;
                    return callGeminiWithRetry(
                        apiKey,
                        buildPrompt(mode, size, sourceText, batchIndex),
                    ).catch((err) => {
                        console.error(
                            `Batch ${batchIndex} failed permanently:`,
                            err.message,
                        );
                        return [];
                    });
                });
                const chunkResults = await Promise.all(chunkPromises);
                collected.push(...chunkResults.flat());
            }
            return collected;
        }

        function mergeUnique(newItems) {
            for (const q of newItems) {
                const key = mode === "flashcard" ? q.front : q.question;
                if (!key || seen.has(key)) continue;
                seen.add(key);
                deduped.push(q);
            }
        }

        // Initial full pass
        const initialSizes = [];
        let remaining = targetCount;
        while (remaining > 0) {
            const size = Math.min(BATCH_SIZE, remaining);
            initialSizes.push(size);
            remaining -= size;
        }
        mergeUnique(await runBatches(initialSizes));

        // Top-up passes: keep requesting exactly the shortfall until we hit the target
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
            mergeUnique(await runBatches(topupSizes));
            topupRound++;
        }

        if (deduped.length === 0) {
            res.status(500).json({
                error: "The model did not return any questions. Try again.",
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
    const languageInstruction = `IMPORTANT LANGUAGE RULE: The source material may be in a single language or a mix of languages (e.g. Filipino/Tagalog and English). For each question you generate, write it in the SAME language as the specific part of the source material it is based on. Do not translate — if the sentence or paragraph you're basing a question on is in Filipino, write that question, its choices/answer, and explanation entirely in Filipino. If it's in English, write in English. If the source material mixes languages throughout, your generated questions should naturally mix too, matching each question to its source language.`;

    if (mode === "flashcard") {
        return `You are creating study flashcards from the source material below.
Generate EXACTLY ${count} flashcards — not fewer, not more — as a JSON array. Count your output before responding and confirm it has exactly ${count} items.
Each item must be an object with exactly these keys:
- "front": a short question or term (string)
- "back": the answer or definition (string)

${languageInstruction}

This is batch #${batchIndex + 1} of a larger set — focus on a distinct slice/section of the material so batches don't overlap in topic.
Base every flashcard strictly on the source material.
Respond with ONLY a valid JSON array of exactly ${count} items. No markdown, no commentary, no code fences.

SOURCE MATERIAL:
"""${sourceText}"""`;
    }

    return `You are creating a multiple-choice quiz from the source material below.
Generate EXACTLY ${count} questions — not fewer, not more — as a JSON array. Count your output before responding and confirm it has exactly ${count} items.
Each item must be an object with exactly these keys:
- "question": the question text (string)
- "choices": an array of exactly 4 answer strings
- "correctIndex": integer 0-3, the index of the correct choice in "choices"
- "explanation": a short 1-2 sentence explanation of why that answer is correct

${languageInstruction}

Rules:
- Only one choice should be correct.
- Make wrong choices plausible, not obviously wrong.
- This is batch #${batchIndex + 1} of a larger set — focus on a distinct slice/section of the material so batches don't overlap in topic.
- Base every question strictly on the source material.
Respond with ONLY a valid JSON array of exactly ${count} items. No markdown, no commentary, no code fences.

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
