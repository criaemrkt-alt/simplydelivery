// Initialize Supabase Client
const _supabaseUrl = 'https://bsqwwmsqiejluzpoiucr.supabase.co';
const _supabaseKey = 'sb_publishable_hVdiqcsBYjIOqyyLffae0Q_QRa70QfZ';

// supabase is available globally via the CDN script in HTML files
const supabase = window.supabase.createClient(_supabaseUrl, _supabaseKey);

// Utility function to check authentication state
async function checkAuth() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
        console.error("Erro ao verificar sessão:", error);
        return null;
    }
    return session;
}
