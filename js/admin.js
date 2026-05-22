const Admin = {
    restaurantId: null,
    restaurantData: null,

    init: async function() {
        // Wait until App.state.userProfile is populated by requireAuth
        let attempts = 0;
        while (!App.state.userProfile && attempts < 20) {
            await new Promise(r => setTimeout(r, 150));
            attempts++;
        }
        if (!App.state.userProfile) {
            console.warn("User profile not loaded, redirecting.");
            window.location.href = 'index.html';
            return;
        }
        this.restaurantId = App.state.userProfile.restaurant_id;
        console.log("Admin initialized for restaurant:", this.restaurantId);

        // Load restaurant data for slug-based public menu link
        const { data: rest } = await supabaseClient
            .from('restaurants')
            .select('*')
            .eq('id', this.restaurantId)
            .single();
        this.restaurantData = rest;

        // Update public menu link with slug
        if (rest && rest.slug) {
            const btn = document.getElementById('btnViewPublicMenu');
            if (btn) btn.onclick = () => window.open(`cardapio.html?slug=${rest.slug}`, '_blank');
        }

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

                if (targetId === 'section-menu') this.loadMenu();
                if (targetId === 'section-settings') this.loadSettings();
                if (targetId === 'section-crm') this.loadCRM();
                if (targetId === 'section-coupons') this.loadCoupons();
            });
        });
    },

    // ─── DASHBOARD ──────────────────────────────────────────────────────────────
    loadDashboard: async function() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();

        const { data: orders, error } = await supabaseClient
            .from('orders')
            .select('total, status')
            .eq('restaurant_id', this.restaurantId)
            .gte('created_at', todayISO)
            .neq('status', 'canceled');

        if (error) { console.error(error); return; }

        const totalOrders = orders ? orders.length : 0;
        const totalRevenue = orders ? orders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0) : 0;

        const statCards = document.querySelectorAll('.stat-card-value');
        if (statCards[0]) statCards[0].textContent = totalOrders;
        if (statCards[1]) statCards[1].textContent = `R$ ${totalRevenue.toFixed(2).replace('.', ',')}`;
    },

    // ─── MENU MANAGEMENT ────────────────────────────────────────────────────────
    loadMenu: async function() {
        const { data: categories, error } = await supabaseClient
            .from('categories')
            .select('*, products(*)')
            .eq('restaurant_id', this.restaurantId)
            .order('sort_order');

        if (error) { console.error(error); return; }

        const menuContainer = document.getElementById('menuList');
        menuContainer.innerHTML = '';

        if (!categories || categories.length === 0) {
            menuContainer.innerHTML = `
                <div style="text-align:center; padding: 40px; color:var(--text-muted);">
                    <i class="ph ph-books" style="font-size:2.5rem; display:block; margin-bottom:12px;"></i>
                    <strong>Nenhuma categoria ainda.</strong>
                    <p>Adicione a primeira categoria para começar a montar o seu cardápio!</p>
                </div>`;
            return;
        }

        categories.forEach(cat => {
            let productsHtml = '';
            if (cat.products && cat.products.length > 0) {
                cat.products.forEach(prod => {
                    const priceStr = parseFloat(prod.price).toFixed(2).replace('.', ',');
                    const active = prod.is_active;
                    productsHtml += `
                        <div class="product-item" style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid var(--border-color);">
                            <div style="flex:1;">
                                <strong>${prod.name}</strong><br>
                                <span style="font-size:0.85rem; color:var(--text-muted);">${prod.description || ''}</span>
                            </div>
                            <div style="display:flex; align-items:center; gap:12px;">
                                <span style="font-weight:700; color:var(--primary-color);">R$ ${priceStr}</span>
                                <label class="toggle-switch" title="${active ? 'Desativar' : 'Ativar'}">
                                    <input type="checkbox" ${active ? 'checked' : ''} onchange="Admin.toggleProduct('${prod.id}', this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <button class="btn btn-outline" style="padding:4px 10px; font-size:0.8rem;" onclick="Admin.deleteProduct('${prod.id}')">
                                    <i class="ph ph-trash"></i>
                                </button>
                            </div>
                        </div>`;
                });
            } else {
                productsHtml = `<p style="font-size:0.85rem; color:var(--text-muted); padding:12px;">Sem produtos nesta categoria.</p>`;
            }

            menuContainer.innerHTML += `
                <div class="card" style="margin-bottom: 16px; padding:0; overflow:hidden;">
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:16px; background:#F9FAFB; border-bottom:1px solid var(--border-color);">
                        <h3 style="margin:0; font-size:1rem;">${cat.name}</h3>
                        <div style="display:flex; gap:8px;">
                            <button class="btn btn-primary" style="padding:6px 14px; font-size:0.8rem; border-radius:var(--radius-sm);" onclick="Admin.showAddProductModal('${cat.id}')">
                                <i class="ph ph-plus"></i> Produto
                            </button>
                            <button class="btn btn-outline" style="padding:6px 10px; font-size:0.8rem; color:var(--danger-color); border-color:var(--danger-color);" onclick="Admin.deleteCategory('${cat.id}')">
                                <i class="ph ph-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div>${productsHtml}</div>
                </div>`;
        });
    },

    addCategory: async function(name) {
        name = name ? name.trim() : '';
        if (!name) { alert('Digite o nome da categoria.'); return; }
        const { error } = await supabaseClient
            .from('categories')
            .insert([{ restaurant_id: this.restaurantId, name: name }]);

        if (error) alert(error.message);
        else {
            document.getElementById('newCatName').value = '';
            this.loadMenu();
        }
    },

    deleteCategory: async function(categoryId) {
        if (!confirm('Excluir esta categoria e todos os produtos dela?')) return;
        const { error } = await supabaseClient.from('categories').delete().eq('id', categoryId);
        if (error) alert(error.message);
        else this.loadMenu();
    },

    showAddProductModal: function(categoryId) {
        document.getElementById('modalCategoryId').value = categoryId;
        document.getElementById('productModal').style.display = 'flex';
        document.getElementById('prodName').focus();
    },

    closeProductModal: function() {
        document.getElementById('productModal').style.display = 'none';
        document.getElementById('productForm').reset();
    },

    saveProduct: async function(e) {
        e.preventDefault();
        const btn = e.submitter;
        if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

        const categoryId = document.getElementById('modalCategoryId').value;
        const name = document.getElementById('prodName').value.trim();
        const price = document.getElementById('prodPrice').value;
        const desc = document.getElementById('prodDesc').value.trim();
        const imageUrl = document.getElementById('prodImageUrl') ? document.getElementById('prodImageUrl').value.trim() : '';

        const productData = {
            restaurant_id: this.restaurantId,
            category_id: categoryId,
            name: name,
            price: parseFloat(price),
            description: desc
        };
        if (imageUrl) productData.image_url = imageUrl;

        const { error } = await supabaseClient.from('products').insert([productData]);

        if (btn) { btn.disabled = false; btn.textContent = 'Salvar Produto'; }

        if (error) alert(error.message);
        else {
            this.closeProductModal();
            this.loadMenu();
        }
    },

    toggleProduct: async function(productId, isActive) {
        const { error } = await supabaseClient
            .from('products')
            .update({ is_active: isActive })
            .eq('id', productId);
        if (error) { alert(error.message); this.loadMenu(); }
    },

    deleteProduct: async function(productId) {
        if (!confirm('Excluir este produto?')) return;
        const { error } = await supabaseClient.from('products').delete().eq('id', productId);
        if (error) alert(error.message);
        else this.loadMenu();
    },

    // ─── CRM ────────────────────────────────────────────────────────────────────
    loadCRM: async function() {
        const { data: customers, error } = await supabaseClient
            .from('customers')
            .select('*')
            .eq('restaurant_id', this.restaurantId)
            .order('order_count', { ascending: false });

        const tbody = document.getElementById('crmList');
        if (!tbody) return;

        if (error) { tbody.innerHTML = `<tr><td colspan="5" style="padding:16px;color:var(--danger-color);">Erro ao carregar clientes.</td></tr>`; return; }

        if (!customers || customers.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="padding:24px; text-align:center; color:var(--text-muted);">Nenhum cliente ainda. Os clientes aparecem aqui após o primeiro pedido.</td></tr>`;
            return;
        }

        tbody.innerHTML = customers.map(c => `
            <tr style="border-bottom:1px solid var(--border-color);">
                <td style="padding:12px 8px; font-weight:600;">${c.name}</td>
                <td style="padding:12px 8px;">
                    <a href="https://wa.me/${c.phone}" target="_blank" style="color:var(--primary-color); font-weight:500;">
                        <i class="ph ph-whatsapp-logo"></i> ${c.phone}
                    </a>
                </td>
                <td style="padding:12px 8px;">${c.order_count || 0}</td>
                <td style="padding:12px 8px; font-weight:600;">R$ ${parseFloat(c.total_spent || 0).toFixed(2).replace('.', ',')}</td>
                <td style="padding:12px 8px; color:var(--text-muted); font-size:0.85rem;">${c.address || '-'}</td>
            </tr>`).join('');
    },

    // ─── COUPONS ────────────────────────────────────────────────────────────────
    loadCoupons: async function() {
        const { data: coupons, error } = await supabaseClient
            .from('coupons')
            .select('*')
            .eq('restaurant_id', this.restaurantId)
            .order('created_at', { ascending: false });

        const tbody = document.getElementById('couponList');
        if (!tbody) return;

        if (error) { tbody.innerHTML = `<tr><td colspan="5" style="padding:16px;color:var(--danger-color);">Erro ao carregar cupons.</td></tr>`; return; }

        if (!coupons || coupons.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="padding:24px; text-align:center; color:var(--text-muted);">Nenhum cupom criado ainda.</td></tr>`;
            return;
        }

        tbody.innerHTML = coupons.map(c => `
            <tr style="border-bottom:1px solid var(--border-color);">
                <td style="padding:12px 8px;">
                    <code style="background:#F3F4F6; padding:4px 8px; border-radius:6px; font-size:0.9rem; font-weight:700;">${c.code}</code>
                </td>
                <td style="padding:12px 8px;">${c.type === 'percent' ? 'Porcentagem' : 'Fixo'}</td>
                <td style="padding:12px 8px; font-weight:700; color:var(--primary-color);">
                    ${c.type === 'percent' ? c.value + '%' : 'R$ ' + parseFloat(c.value).toFixed(2).replace('.', ',')}
                </td>
                <td style="padding:12px 8px;">R$ ${parseFloat(c.min_order || 0).toFixed(2).replace('.', ',')}</td>
                <td style="padding:12px 8px;">
                    <button class="btn btn-outline" style="padding:4px 10px; font-size:0.8rem; color:var(--danger-color); border-color:var(--danger-color);" onclick="Admin.deleteCoupon('${c.id}')">
                        <i class="ph ph-trash"></i> Excluir
                    </button>
                </td>
            </tr>`).join('');
    },

    saveCoupon: async function(e) {
        e.preventDefault();
        const code = document.getElementById('cupCode').value.trim().toUpperCase();
        const type = document.getElementById('cupType').value;
        const value = parseFloat(document.getElementById('cupValue').value);
        const minOrder = parseFloat(document.getElementById('cupMinOrder').value) || 0;

        const { error } = await supabaseClient
            .from('coupons')
            .insert([{ restaurant_id: this.restaurantId, code, type, value, min_order: minOrder, is_active: true }]);

        if (error) alert(error.message.includes('unique') ? `Cupom "${code}" já existe!` : error.message);
        else {
            document.getElementById('couponForm').reset();
            this.loadCoupons();
        }
    },

    deleteCoupon: async function(couponId) {
        if (!confirm('Excluir este cupom?')) return;
        await supabaseClient.from('coupons').delete().eq('id', couponId);
        this.loadCoupons();
    },

    // ─── SETTINGS ───────────────────────────────────────────────────────────────
    loadSettings: async function() {
        const { data: rest } = await supabaseClient
            .from('restaurants')
            .select('*')
            .eq('id', this.restaurantId)
            .single();

        if (rest) {
            document.getElementById('setRestName').value = rest.name || '';
            document.getElementById('setRestWpp').value = rest.whatsapp || '';
            document.getElementById('setRestSlug').value = rest.slug || '';
            if (document.getElementById('setDeliveryFee')) document.getElementById('setDeliveryFee').value = rest.delivery_fee || '0.00';
            if (document.getElementById('setDeliveryTime')) document.getElementById('setDeliveryTime').value = rest.delivery_time || '';
            this.restaurantData = rest;
        }
    },

    saveSettings: async function(e) {
        e.preventDefault();
        const btn = document.getElementById('btnSaveSettings');
        btn.textContent = 'Salvando...';
        btn.disabled = true;

        const name = document.getElementById('setRestName').value.trim();
        const wpp = document.getElementById('setRestWpp').value.trim();
        const slug = document.getElementById('setRestSlug').value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
        const deliveryFee = document.getElementById('setDeliveryFee') ? parseFloat(document.getElementById('setDeliveryFee').value) : 0;
        const deliveryTime = document.getElementById('setDeliveryTime') ? document.getElementById('setDeliveryTime').value.trim() : '';

        const updates = { name, whatsapp: wpp, slug };
        if (document.getElementById('setDeliveryFee')) updates.delivery_fee = deliveryFee;
        if (document.getElementById('setDeliveryTime')) updates.delivery_time = deliveryTime;

        const { error } = await supabaseClient
            .from('restaurants')
            .update(updates)
            .eq('id', this.restaurantId);

        btn.disabled = false;
        btn.textContent = 'Salvar Configurações';

        if (error) alert(error.message);
        else {
            // Update slug field with cleaned value
            document.getElementById('setRestSlug').value = slug;
            this.restaurantData = { ...this.restaurantData, ...updates };
            alert('✅ Configurações salvas com sucesso!');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // App.init() runs first (via app.js), Admin.init waits for userProfile
    Admin.init();
});
