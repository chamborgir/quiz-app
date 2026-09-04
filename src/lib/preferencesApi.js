import { supabase } from "../supabaseClient.js";

export async function getPreferences(userId) {
    const { data, error } = await supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
    if (error) throw error;
    return data; // null if the user has never saved a preference yet
}

export async function upsertPreferences(userId, { theme_mode, theme_palette }) {
    const { error } = await supabase
        .from("user_preferences")
        .upsert({
            user_id: userId,
            theme_mode,
            theme_palette,
            updated_at: new Date().toISOString(),
        });
    if (error) throw error;
}
