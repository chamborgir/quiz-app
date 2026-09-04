import { supabase } from "../supabaseClient.js";

export async function saveQuiz({ userId, title, mode, questions, count }) {
    const { data, error } = await supabase
        .from("quizzes")
        .insert({ user_id: userId, title, mode, questions, count })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function listQuizzes(userId) {
    const { data, error } = await supabase
        .from("quizzes")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
}

export async function renameQuiz(quizId, title) {
    const { error } = await supabase
        .from("quizzes")
        .update({ title, updated_at: new Date().toISOString() })
        .eq("id", quizId);
    if (error) throw error;
}

export async function deleteQuiz(quizId) {
    const { error } = await supabase.from("quizzes").delete().eq("id", quizId);
    if (error) throw error;
}

export async function assignQuizToCollection(quizId, collectionId) {
    const { error } = await supabase
        .from("quizzes")
        .update({ collection_id: collectionId })
        .eq("id", quizId);
    if (error) throw error;
}

function generateShareCode() {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

export async function shareQuiz(quizId, existingCode) {
    const code = existingCode || generateShareCode();
    const { error } = await supabase
        .from("quizzes")
        .update({ is_public: true, share_code: code })
        .eq("id", quizId);
    if (error) throw error;
    return code;
}

export async function unshareQuiz(quizId) {
    const { error } = await supabase
        .from("quizzes")
        .update({ is_public: false })
        .eq("id", quizId);
    if (error) throw error;
}

export async function getQuizByShareCode(code) {
    const { data, error } = await supabase
        .from("quizzes")
        .select("*")
        .eq("share_code", code)
        .eq("is_public", true)
        .single();
    if (error) throw error;
    return data;
}

export async function cloneQuiz(quiz, userId) {
    const { data, error } = await supabase
        .from("quizzes")
        .insert({
            user_id: userId,
            title: `${quiz.title} (copy)`,
            mode: quiz.mode,
            questions: quiz.questions,
            count: quiz.count,
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function saveAttempt({ quizId, userId, score, total, answers }) {
    const { error } = await supabase
        .from("attempts")
        .insert({ quiz_id: quizId, user_id: userId, score, total, answers });
    if (error) throw error;
}

export async function listAttempts(quizId) {
    const { data, error } = await supabase
        .from("attempts")
        .select("*")
        .eq("quiz_id", quizId)
        .order("attempted_at", { ascending: false });
    if (error) throw error;
    return data;
}

// --- Collections ---

export async function listCollections(userId) {
    const { data, error } = await supabase
        .from("collections")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
}

export async function createCollection(userId, name) {
    const { data, error } = await supabase
        .from("collections")
        .insert({ user_id: userId, name })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function renameCollection(collectionId, name) {
    const { error } = await supabase
        .from("collections")
        .update({ name })
        .eq("id", collectionId);
    if (error) throw error;
}

export async function deleteCollection(collectionId) {
    const { error } = await supabase
        .from("collections")
        .delete()
        .eq("id", collectionId);
    if (error) throw error;
}

export async function getQuizById(quizId) {
    const { data, error } = await supabase
        .from("quizzes")
        .select("*")
        .eq("id", quizId)
        .single();
    if (error) throw error;
    return data;
}

export async function updateQuizContent(
    quizId,
    { title, mode, questions, count },
) {
    const { error } = await supabase
        .from("quizzes")
        .update({
            title,
            mode,
            questions,
            count,
            updated_at: new Date().toISOString(),
        })
        .eq("id", quizId);
    if (error) throw error;
}

export async function updateSingleQuestion(
    quizId,
    mode,
    matchKey,
    updatedItem,
) {
    const quiz = await getQuizById(quizId);
    const questions = [...quiz.questions];
    const idx = questions.findIndex(
        (q) => (mode === "mcq" ? q.question : q.front) === matchKey,
    );
    if (idx === -1)
        throw new Error("Could not locate this question in the saved quiz.");
    questions[idx] = updatedItem;
    await updateQuizContent(quizId, {
        title: quiz.title,
        mode: quiz.mode,
        questions,
        count: questions.length,
    });
}
