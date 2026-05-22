const Admin = {
    restaurantId: null,

    init: async function() {
        if (!App.state.userProfile) {
            console.warn("User profile not loaded");
            return;
        }
        this.restaurantId = App.state.userProfile.restaurant_id;
        console.log("Admin initialized for restaurant:", this.restaurantId);

        this.setupNavigation();
        this.loadDashboard();
    },

    setupNavigation: function() {
        const navItems = document.querySelectorAll('.nav-item[data-target]');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                navItems.forEach(n => n.classList.remove('active'));
                e.currentTarget.classList.add('active');
                
                const targetId = e.currentTarget.getAttribute('data-target');
                document.querySelectorAll('.admin-section').forEach(sec => sec.style.display = 'none');
                document.getElementById(targetId).style.display = 'block';

                if(targetId === 'section-menu') this.loadMenu();
                if(targetId === 'section-settings') this.loadSettings();
            });
        });
    },

    loadDashboard: async function() {
        // Load basic stats
        // We will implement this later. For now, it shows static HTML
    },

    // --- MENU MANAGEMENT ---
    loadMenu: async function() {
        const { data: categories, error } = await supabaseClient
            .from('categories')
            .select('*, products(*)')
            .eq('restaurant_id', this.restaurantId)
            .order('sort_order');
        
        if (error) {
            console.error(error);
            return;
        }

        const menuContainer = document.getElementById('menuList');
        menuContainer.innerHTML = '';

        if(categories.length === 0) {
            menuContainer.innerHTML = '<p style="color:var(--text-muted); padding: 16px;">Nenhuma categoria encontrada. Crie a primeira!</p>';
            return;
        }

        categories.forEach(cat => {
            let productsHtml = '';
            if(cat.products && cat.products.length > 0) {
                cat.products.forEach(prod => {
                    productsHtml += `
                        <div class="product-item" style="display:flex; justify-content:space-between; padding:12px; border-bottom:1px solid #eee;">
                            <div>
                                <strong>${prod.name}</strong><br>
                                <span style="font-size:0.85rem; color:#666;">R$ ${prod.price.toFixed(2)}</span>
                            </div>
                            <button class="btn btn-outline" style="padding:4px 8px; font-size:0.8rem;" onclick="Admin.deleteProduct('${prod.id}')">Excluir</button>
                        </div>
                    `;
                });
            } else {
                productsHtml = '<p style="font-size:0.85rem; color:#999; padding:12px;">Sem produtos.</p>';
            }

            menuContainer.innerHTML += `
                <div class="card" style="margin-bottom: 16px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:12px; margin-bottom:12px;">
                        <h3 style="margin:0">${cat.name}</h3>
                        <button class="btn btn-primary" style="padding:6px 12px; font-size:0.8rem;" onclick="Admin.showAddProductModal('${cat.id}')">+ Produto</button>
                    </div>
                    <div>${productsHtml}</div>
                </div>
            `;
        });
    },

    addCategory: async function(name) {
        if(!name) return;
        const { error } = await supabaseClient
            .from('categories')
            .insert([{ restaurant_id: this.restaurantId, name: name }]);
        
        if(error) alert(error.message);
        else this.loadMenu();
    },

    showAddProductModal: function(categoryId) {
        document.getElementById('modalCategoryId').value = categoryId;
        document.getElementById('productModal').style.display = 'flex';
    },

    closeProductModal: function() {
        document.getElementById('productModal').style.display = 'none';
        document.getElementById('productForm').reset();
    },

    saveProduct: async function(e) {
        e.preventDefault();
        const categoryId = document.getElementById('modalCategoryId').value;
        const name = document.getElementById('prodName').value;
        const price = document.getElementById('prodPrice').value;
        const desc = document.getElementById('prodDesc').value;

        const { error } = await supabaseClient
            .from('products')
            .insert([{ 
                restaurant_id: this.restaurantId,
                category_id: categoryId,
                name: name,
                price: parseFloat(price),
                description: desc
            }]);

        if(error) alert(error.message);
        else {
            this.closeProductModal();
            this.loadMenu();
        }
    },

    deleteProduct: async function(productId) {
        if(!confirm("Tem certeza que deseja excluir?")) return;
        await supabaseClient.from('products').delete().eq('id', productId);
        this.loadMenu();
    },

    // --- SETTINGS ---
    loadSettings: async function() {
        const { data: rest, error } = await supabaseClient
            .from('restaurants')
            .select('*')
            .eq('id', this.restaurantId)
            .single();
        
        if(rest) {
            document.getElementById('setRestName').value = rest.name || '';
            document.getElementById('setRestWpp').value = rest.whatsapp || '';
            document.getElementById('setRestSlug').value = rest.slug || '';
        }
    },

    saveSettings: async function(e) {
        e.preventDefault();
        const btn = document.getElementById('btnSaveSettings');
        btn.textContent = "Salvando...";

        const name = document.getElementById('setRestName').value;
        const wpp = document.getElementById('setRestWpp').value;
        const slug = document.getElementById('setRestSlug').value;

        const { error } = await supabaseClient
            .from('restaurants')
            .update({ name: name, whatsapp: wpp, slug: slug })
            .eq('id', this.restaurantId);
        
        if(error) alert(error.message);
        else alert("Salvo com sucesso!");
        
        btn.textContent = "Salvar Configurações";
    }
};

// Hook into App init
document.addEventListener('DOMContentLoaded', () => {
    // Wait slightly to ensure App.state.userProfile is loaded by app.js requireAuth
    setTimeout(() => {
        Admin.init();
    }, 500);
});
