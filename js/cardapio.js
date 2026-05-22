// ─── CART STATE (persisted in sessionStorage per restaurant slug) ─────────────
const Cart = {
    items: [],
    restaurantSlug: null,
    restaurantData: null,

    load: function(slug) {
        this.restaurantSlug = slug;
        const saved = sessionStorage.getItem(`cart_${slug}`);
        this.items = saved ? JSON.parse(saved) : [];
    },

    save: function() {
        sessionStorage.setItem(`cart_${this.restaurantSlug}`, JSON.stringify(this.items));
    },

    add: function(product, qty = 1, notes = '', variation = null, addons = []) {
        // Check if same product+variation already in cart
        const existingIdx = this.items.findIndex(i =>
            i.product_id === product.id &&
            (variation ? i.variation_name === variation.name : !i.variation_name) &&
            i.notes === notes
        );

        const unitPrice = variation ? parseFloat(variation.price) : parseFloat(product.price);
        const addonTotal = addons.reduce((sum, a) => sum + parseFloat(a.price) * (a.qty || 1), 0);
        const itemPrice = unitPrice + addonTotal;

        if (existingIdx >= 0) {
            this.items[existingIdx].quantity += qty;
            this.items[existingIdx].total_price = this.items[existingIdx].unit_price * this.items[existingIdx].quantity;
        } else {
            this.items.push({
                product_id: product.id,
                product_name: product.name,
                image_url: product.image_url || null,
                variation_name: variation ? variation.name : null,
                addons: addons,
                quantity: qty,
                unit_price: itemPrice,
                total_price: itemPrice * qty,
                notes: notes
            });
        }
        this.save();
    },

    remove: function(idx) {
        this.items.splice(idx, 1);
        this.save();
    },

    updateQty: function(idx, delta) {
        this.items[idx].quantity = Math.max(1, this.items[idx].quantity + delta);
        this.items[idx].total_price = this.items[idx].unit_price * this.items[idx].quantity;
        this.save();
    },

    getSubtotal: function() {
        return this.items.reduce((sum, i) => sum + i.total_price, 0);
    },

    getTotalItems: function() {
        return this.items.reduce((sum, i) => sum + i.quantity, 0);
    },

    clear: function() {
        this.items = [];
        this.save();
    }
};

// ─── CARDAPIO PAGE ────────────────────────────────────────────────────────────
const Cardapio = {
    restaurantData: null,
    categories: [],
    allProducts: [],
    currentProductId: null,
    selectedVariation: null,
    selectedAddons: [],
    currentQty: 1,

    init: async function() {
        const params = new URLSearchParams(window.location.search);
        const slug = params.get('slug');

        if (!slug) {
            document.body.innerHTML = `<div style="text-align:center;padding:40px;font-family:Inter,sans-serif;">
                <h2>Cardápio não encontrado</h2>
                <p>Acesse o link correto fornecido pelo restaurante.</p>
            </div>`;
            return;
        }

        Cart.load(slug);

        // Load restaurant by slug
        const { data: rest, error } = await supabaseClient
            .from('restaurants')
            .select('*')
            .eq('slug', slug)
            .single();

        if (error || !rest) {
            document.body.innerHTML = `<div style="text-align:center;padding:40px;font-family:Inter,sans-serif;">
                <h2>Restaurante não encontrado</h2>
                <p>Verifique o link e tente novamente.</p>
            </div>`;
            return;
        }

        this.restaurantData = rest;
        Cart.restaurantData = rest;

        // Update page title and header
        document.title = `${rest.name} - Cardápio`;
        document.getElementById('restName').textContent = rest.name;
        if (rest.logo_url) {
            document.getElementById('restLogo').src = rest.logo_url;
        } else {
            document.getElementById('restLogo').style.display = 'none';
        }
        if (rest.delivery_fee) {
            document.getElementById('restDeliveryFee').textContent = `Entrega R$ ${parseFloat(rest.delivery_fee).toFixed(2).replace('.', ',')}`;
        }
        if (rest.delivery_time) {
            document.getElementById('restDeliveryTime').textContent = rest.delivery_time;
        }

        // Toggle open/closed
        const statusEl = document.getElementById('restStatus');
        if (!rest.is_open) {
            statusEl.textContent = '🔴 Fechado no momento';
            statusEl.style.color = 'var(--danger-color)';
        } else {
            statusEl.style.display = 'none';
        }

        // Load menu
        await this.loadMenu(rest.id);

        // Setup search
        const searchInput = document.getElementById('menuSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterProducts(e.target.value));
        }

        // Update cart button
        this.updateCartButton();
    },

    loadMenu: async function(restaurantId) {
        const { data: categories, error } = await supabaseClient
            .from('categories')
            .select('*, products(*)')
            .eq('restaurant_id', restaurantId)
            .eq('is_active', true)
            .order('sort_order');

        if (error) { console.error(error); return; }

        this.categories = categories || [];
        this.allProducts = this.categories.flatMap(c => c.products || []).filter(p => p.is_active);

        if (this.categories.length === 0) {
            document.getElementById('menuSections').innerHTML = `
                <div style="text-align:center; padding:40px; color:var(--text-muted);">
                    <i class="ph ph-cooking-pot" style="font-size:3rem; display:block; margin-bottom:12px;"></i>
                    <strong>Cardápio em construção</strong>
                    <p>O restaurante ainda está preparando o cardápio.</p>
                </div>`;
            document.getElementById('categoriesWrapper').style.display = 'none';
            return;
        }

        this.renderCategories();
        this.renderMenuSections(this.categories);
    },

    renderCategories: function() {
        const wrapper = document.getElementById('categoriesWrapper');
        wrapper.innerHTML = `<div class="category-pill active" onclick="Cardapio.filterByCategory(null, this)">Todos</div>`;
        this.categories.forEach(cat => {
            wrapper.innerHTML += `<div class="category-pill" onclick="Cardapio.filterByCategory('${cat.id}', this)">${cat.name}</div>`;
        });
    },

    filterByCategory: function(catId, el) {
        document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
        el.classList.add('active');

        if (!catId) {
            this.renderMenuSections(this.categories);
        } else {
            const filtered = this.categories.filter(c => c.id === catId);
            this.renderMenuSections(filtered);
        }

        // Scroll to top of menu
        document.getElementById('menuSections').scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    filterProducts: function(query) {
        query = query.toLowerCase().trim();
        if (!query) {
            this.renderMenuSections(this.categories);
            return;
        }
        const filtered = this.categories.map(cat => ({
            ...cat,
            products: (cat.products || []).filter(p =>
                p.is_active && (
                    p.name.toLowerCase().includes(query) ||
                    (p.description && p.description.toLowerCase().includes(query))
                )
            )
        })).filter(cat => cat.products.length > 0);

        this.renderMenuSections(filtered);
    },

    renderMenuSections: function(cats) {
        const container = document.getElementById('menuSections');
        if (!cats || cats.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding:32px; color:var(--text-muted);">Nenhum produto encontrado.</div>`;
            return;
        }

        container.innerHTML = cats.map(cat => {
            const products = (cat.products || []).filter(p => p.is_active);
            if (products.length === 0) return '';
            return `
                <div class="menu-section">
                    <div class="section-header">
                        <h2 class="section-title">${cat.name}</h2>
                    </div>
                    ${products.map(p => this.renderProductCard(p)).join('')}
                </div>`;
        }).join('');
    },

    renderProductCard: function(product) {
        const price = parseFloat(product.price).toFixed(2).replace('.', ',');
        const imgHtml = product.image_url
            ? `<img src="${product.image_url}" alt="${product.name}" class="product-image" onerror="this.style.display='none'">`
            : `<div style="width:100%;height:100%;background:#F3F4F6;border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:2rem;"><i class="ph ph-fork-knife"></i></div>`;

        return `
            <div class="product-card" onclick="Cardapio.openProduct('${product.id}')">
                <div class="product-info">
                    <div class="product-name">${product.name}</div>
                    ${product.description ? `<div class="product-desc">${product.description}</div>` : ''}
                    <div class="product-price">R$ ${price}</div>
                </div>
                <div class="product-image-container">
                    ${imgHtml}
                    <div class="btn-add" onclick="event.stopPropagation(); Cardapio.quickAdd('${product.id}')">
                        <i class="ph ph-plus"></i>
                    </div>
                </div>
            </div>`;
    },

    quickAdd: function(productId) {
        const product = this.allProducts.find(p => p.id === productId);
        if (!product) return;
        Cart.add(product, 1);
        this.updateCartButton();
        this.showToast(`${product.name} adicionado!`);
    },

    openProduct: async function(productId) {
        const product = this.allProducts.find(p => p.id === productId);
        if (!product) return;

        this.currentProductId = productId;
        this.selectedVariation = null;
        this.selectedAddons = [];
        this.currentQty = 1;

        // Load variations and addons
        const [{ data: variations }, { data: addons }] = await Promise.all([
            supabaseClient.from('product_variations').select('*').eq('product_id', productId),
            supabaseClient.from('product_addons').select('*').eq('product_id', productId).eq('is_active', true)
        ]);

        const price = parseFloat(product.price).toFixed(2).replace('.', ',');

        // Build modal content
        document.getElementById('modalProductName').textContent = product.name;
        document.getElementById('modalProductDesc').textContent = product.description || '';
        document.getElementById('modalProductPrice').textContent = `R$ ${price}`;
        document.getElementById('modalProductImg').src = product.image_url || '';
        document.getElementById('modalProductImg').style.display = product.image_url ? 'block' : 'none';
        document.getElementById('modalQtyValue').textContent = '1';
        document.getElementById('modalNotes').value = '';
        this.currentQty = 1;

        // Variations
        const varSection = document.getElementById('modalVariations');
        if (variations && variations.length > 0) {
            varSection.style.display = 'block';
            document.getElementById('modalVariationsList').innerHTML = variations.map(v => {
                const vPrice = parseFloat(v.price).toFixed(2).replace('.', ',');
                return `<div class="radio-card" onclick="Cardapio.selectVariation(this, '${v.id}', '${v.name}', ${v.price})">
                    <div class="check-icon"><i class="ph-bold ph-check"></i></div>
                    <div class="radio-name">${v.name}</div>
                    <div class="radio-price">R$ ${vPrice}</div>
                </div>`;
            }).join('');
            // Select first variation by default
            const firstCard = document.querySelector('#modalVariationsList .radio-card');
            if (firstCard) {
                const firstVar = variations[0];
                firstCard.classList.add('selected');
                this.selectedVariation = firstVar;
            }
        } else {
            varSection.style.display = 'none';
        }

        // Addons
        const addonSection = document.getElementById('modalAddons');
        if (addons && addons.length > 0) {
            addonSection.style.display = 'block';
            document.getElementById('modalAddonsList').innerHTML = addons.map(a => {
                const aPrice = parseFloat(a.price).toFixed(2).replace('.', ',');
                return `<div class="addon-item" onclick="Cardapio.toggleAddon(this, '${a.id}', '${a.name.replace(/'/g, "\\'")}', ${a.price})">
                    <div class="addon-info">
                        <div class="custom-checkbox"><i class="ph-bold ph-check"></i></div>
                        <span class="addon-name">${a.name}</span>
                    </div>
                    <span class="addon-price">+ R$ ${aPrice}</span>
                </div>`;
            }).join('');
        } else {
            addonSection.style.display = 'none';
        }

        this.updateModalTotal();
        document.getElementById('productModal').style.display = 'flex';
    },

    selectVariation: function(el, varId, varName, varPrice) {
        document.querySelectorAll('#modalVariationsList .radio-card').forEach(c => c.classList.remove('selected'));
        el.classList.add('selected');
        this.selectedVariation = { id: varId, name: varName, price: varPrice };
        this.updateModalTotal();
    },

    toggleAddon: function(el, addonId, addonName, addonPrice) {
        el.classList.toggle('selected');
        const isSelected = el.classList.contains('selected');
        if (isSelected) {
            this.selectedAddons.push({ id: addonId, name: addonName, price: addonPrice, qty: 1 });
        } else {
            this.selectedAddons = this.selectedAddons.filter(a => a.id !== addonId);
        }
        this.updateModalTotal();
    },

    changeQty: function(delta) {
        this.currentQty = Math.max(1, this.currentQty + delta);
        document.getElementById('modalQtyValue').textContent = this.currentQty;
        this.updateModalTotal();
    },

    updateModalTotal: function() {
        const product = this.allProducts.find(p => p.id === this.currentProductId);
        if (!product) return;

        const basePrice = this.selectedVariation ? parseFloat(this.selectedVariation.price) : parseFloat(product.price);
        const addonTotal = this.selectedAddons.reduce((sum, a) => sum + parseFloat(a.price), 0);
        const unitTotal = basePrice + addonTotal;
        const grandTotal = unitTotal * this.currentQty;

        document.getElementById('modalAddToCartBtn').textContent = `Adicionar — R$ ${grandTotal.toFixed(2).replace('.', ',')}`;
    },

    addToCart: function() {
        const product = this.allProducts.find(p => p.id === this.currentProductId);
        if (!product) return;
        const notes = document.getElementById('modalNotes').value.trim();
        Cart.add(product, this.currentQty, notes, this.selectedVariation, this.selectedAddons);
        this.updateCartButton();
        this.closeProductModal();
        this.showToast(`${this.currentQty}x ${product.name} adicionado!`);
    },

    closeProductModal: function() {
        document.getElementById('productModal').style.display = 'none';
    },

    updateCartButton: function() {
        const total = Cart.getTotalItems();
        const subtotal = Cart.getSubtotal();
        const cartBtn = document.getElementById('floatingCart');

        if (total === 0) {
            cartBtn.style.display = 'none';
        } else {
            cartBtn.style.display = 'flex';
            document.getElementById('cartBadge').textContent = total;
            document.getElementById('cartSubtotalText').textContent = `${total} ${total === 1 ? 'item' : 'itens'} · R$ ${subtotal.toFixed(2).replace('.', ',')}`;
        }
    },

    showToast: function(msg) {
        let toast = document.getElementById('cartToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'cartToast';
            toast.style.cssText = 'position:fixed;bottom:120px;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:10px 20px;border-radius:100px;font-size:0.85rem;font-weight:600;z-index:9999;animation:fadeIn 0.3s ease;';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.style.display = 'block';
        clearTimeout(toast._timeout);
        toast._timeout = setTimeout(() => { toast.style.display = 'none'; }, 2000);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Cardapio.init();
});
