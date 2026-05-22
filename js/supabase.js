// Initialize Supabase Client
const _supabaseUrl = 'https://bsqwwmsqiejluzpoiucr.supabase.co';
const _supabaseKey = 'sb_publishable_hVdiqcsBYjIOqyyLffae0Q_QRa70QfZ';

// supabase is available globally via the CDN script in HTML files
const supabaseClient = window.supabase.createClient(_supabaseUrl, _supabaseKey);

// Utility function to check authentication state
async function checkAuth() {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) {
        console.error("Erro ao verificar sessão:", error);
        return null;
    }
    return session;
}
