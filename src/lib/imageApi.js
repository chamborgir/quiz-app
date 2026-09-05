import { supabase } from "../supabaseClient.js";

export async function uploadQuizImage(userId, file) {
    const ext = file.name.split(".").pop();
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
        .from("quiz-images")
        .upload(path, file);
    if (error) {
        if (error.message?.toLowerCase().includes("bucket not found")) {
            throw new Error(
                "Image storage isn't set up yet. Run the storage setup SQL in Supabase, then try again.",
            );
        }
        throw error;
    }
    const { data } = supabase.storage.from("quiz-images").getPublicUrl(path);
    return data.publicUrl;
}
