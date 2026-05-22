// Global App State and Utilities
const App = {
    state: {
        userProfile: null
    },

    init: async function() {
        console.log("App initialized.");

        if (document.getElementById('authForm')) {
            // Login/Register page
            this.setupAuthForm();
            this.checkSessionAndRedirect();
        } else {
            // Protected page — check auth and load profile
            await this.requireAuth();
        }
    },

    checkSessionAndRedirect: async function() {
        const session = await checkAuth();
        if (session) {
            // Already logged in — redirect based on role
            const { data: profile } = await supabaseClient
                .from('profiles')
                .select('role')
                .eq('id', session.user.id)
                .single();

            if (profile) {
                if (profile.role === 'admin') window.location.href = 'admin.html';
                else if (profile.role === 'caixa') window.location.href = 'caixa.html';
                else if (profile.role === 'driver') window.location.href = 'motoboy.html';
                else window.location.href = 'admin.html';
            }
        }
    },

    requireAuth: async function() {
        // Skip auth for public pages
        const publicPages = ['cardapio.html', 'carrinho.html'];
        const currentPage = window.location.pathname.split('/').pop();
        if (publicPages.includes(currentPage)) return;

        const session = await checkAuth();
        if (!session) {
            window.location.href = 'index.html';
            return;
        }

        // Load user profile
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        this.state.userProfile = profile;

        // Role-based page guard
        if (profile) {
            const path = window.location.pathname.split('/').pop();
            if (path === 'admin.html' && profile.role !== 'admin') {
                if (profile.role === 'caixa') window.location.href = 'caixa.html';
                else if (profile.role === 'driver') window.location.href = 'motoboy.html';
            }
            if (path === 'motoboy.html' && profile.role !== 'driver' && profile.role !== 'admin') {
                window.location.href = 'caixa.html';
            }
        }
    },

    setupAuthForm: function() {
        window.authMode = 'login';

        window.toggleAuthMode = (mode) => {
            window.authMode = mode;
            document.getElementById('tabLogin').classList.toggle('active', mode === 'login');
            document.getElementById('tabRegister').classList.toggle('active', mode === 'register');
            document.getElementById('registerFields').style.display = mode === 'register' ? 'block' : 'none';
            document.getElementById('authBtn').textContent = mode === 'register' ? 'Criar Conta' : 'Entrar';
            document.getElementById('errorMsg').style.display = 'none';
        };

        document.getElementById('authForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('authBtn');
            const errorMsg = document.getElementById('errorMsg');
            btn.disabled = true;
            btn.textContent = 'Aguarde...';
            errorMsg.style.display = 'none';

            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;

            try {
                if (window.authMode === 'login') {
                    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
                    if (error) throw error;

                    // Redirect based on role
                    const { data: profile } = await supabaseClient
                        .from('profiles')
                        .select('role')
                        .eq('id', data.user.id)
                        .single();

                    if (profile && profile.role === 'caixa') window.location.href = 'caixa.html';
                    else if (profile && profile.role === 'driver') window.location.href = 'motoboy.html';
                    else window.location.href = 'admin.html';

                } else {
                    const restaurantName = document.getElementById('restaurantName').value.trim();
                    const userName = document.getElementById('userName').value.trim();

                    if (!restaurantName || !userName) {
                        throw new Error('Preencha o nome do restaurante e seu nome.');
                    }

                    // 1. Sign Up
                    const { data: authData, error: authError } = await supabaseClient.auth.signUp({ email, password });
                    if (authError) throw authError;

                    const userId = authData.user.id;

                    // 2. Create Restaurant
                    const slug = restaurantName.toLowerCase()
                        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/^-|-$/g, '');

                    const { data: restData, error: restError } = await supabaseClient
                        .from('restaurants')
                        .insert([{ name: restaurantName, slug: slug }])
                        .select()
                        .single();

                    if (restError) throw restError;

                    // 3. Create Profile
                    const { error: profError } = await supabaseClient
                        .from('profiles')
                        .insert([{
                            id: userId,
                            restaurant_id: restData.id,
                            role: 'admin',
                            name: userName
                        }]);

                    if (profError) throw profError;

                    alert('✅ Conta criada! Seja bem-vindo ao Simply Delivery!');
                    window.location.href = 'admin.html';
                }
            } catch (err) {
                console.error(err);
                errorMsg.textContent = err.message || 'Ocorreu um erro na autenticação.';
                errorMsg.style.display = 'block';
                btn.disabled = false;
                btn.textContent = window.authMode === 'register' ? 'Criar Conta' : 'Entrar';
            }
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
