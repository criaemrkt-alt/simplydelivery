// Carrinho page logic — reads from sessionStorage Cart state, handles checkout
const CarrinhoPage = {
    restaurantData: null,
    cartSlug: null,
    orderType: 'delivery',
    selectedPayment: 'Dinheiro',
    discount: 0,
    appliedCoupon: null,

    init: async function() {
        const params = new URLSearchParams(window.location.search);
        const slug = params.get('slug');

        if (!slug) {
            document.getElementById('cartItemsContainer').innerHTML = `<p style="color:var(--danger-color); text-align:center; padding:32px;">Link inválido.</p>`;
            return;
        }

        this.cartSlug = slug;
        Cart.load(slug);

        // Load restaurant info (for whatsapp, delivery fee)
        const { data: rest } = await supabaseClient
            .from('restaurants')
            .select('*')
            .eq('slug', slug)
            .single();

        this.restaurantData = rest;

        this.renderCart();
        this.setupListeners();
    },

    setupListeners: function() {
        // Delivery / Pickup toggle
        document.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.orderType = e.currentTarget.dataset.type;
                const addressSection = document.getElementById('addressSection');
                if (addressSection) {
                    addressSection.style.display = this.orderType === 'delivery' ? 'block' : 'none';
                }
                this.updateSummary();
            });
        });

        // Payment selection
        document.querySelectorAll('.payment-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.payment-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.selectedPayment = e.currentTarget.dataset.payment;
            });
        });

        // Coupon
        document.getElementById('btnApplyCoupon').addEventListener('click', () => this.applyCoupon());

        // Clear cart
        document.getElementById('btnClearCart').addEventListener('click', () => {
            if (confirm('Esvaziar o carrinho?')) {
                Cart.clear();
                window.location.href = `cardapio.html?slug=${this.cartSlug}`;
            }
        });

        // Back button
        document.getElementById('btnBack').addEventListener('click', () => {
            window.history.length > 1
                ? window.history.back()
                : window.location.href = `cardapio.html?slug=${this.cartSlug}`;
        });

        // Finalize
        document.getElementById('btnFinalize').addEventListener('click', () => this.finalize());
    },

    renderCart: function() {
        const container = document.getElementById('cartItemsContainer');

        if (Cart.items.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:48px 16px; color:var(--text-muted);">
                    <i class="ph ph-shopping-cart-simple" style="font-size:3rem; display:block; margin-bottom:12px;"></i>
                    <strong>Seu carrinho está vazio</strong>
                    <p style="margin-top:8px;">Adicione produtos no cardápio.</p>
                    <a href="cardapio.html?slug=${this.cartSlug}" class="btn btn-primary" style="display:inline-flex; margin-top:16px;">Ver Cardápio</a>
                </div>`;
            document.getElementById('checkoutSection').style.display = 'none';
            document.getElementById('btnFinalize').style.display = 'none';
            return;
        }

        container.innerHTML = Cart.items.map((item, idx) => {
            const imgHtml = item.image_url
                ? `<img src="${item.image_url}" alt="${item.product_name}" class="cart-item-img" onerror="this.style.display='none'">`
                : `<div class="cart-item-img" style="background:#F3F4F6;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:1.5rem;"><i class="ph ph-fork-knife"></i></div>`;

            const addonStr = item.addons && item.addons.length > 0
                ? item.addons.map(a => `+ ${a.name}`).join(', ')
                : '';
            const varStr = item.variation_name ? `Variação: ${item.variation_name}` : '';
            const detailStr = [varStr, addonStr].filter(Boolean).join(' | ');
            const price = (item.unit_price * item.quantity).toFixed(2).replace('.', ',');

            return `
                <div class="cart-item">
                    ${imgHtml}
                    <div class="cart-item-info">
                        <div class="cart-item-header">
                            <span class="cart-item-title">${item.product_name}</span>
                        </div>
                        ${detailStr ? `<div class="cart-item-desc">${detailStr}</div>` : ''}
                        ${item.notes ? `<div class="cart-item-obs">📝 ${item.notes}</div>` : ''}
                        <div class="cart-item-bottom">
                            <div class="qty-control">
                                <button class="qty-btn" onclick="CarrinhoPage.changeQty(${idx}, -1)"><i class="ph ph-minus"></i></button>
                                <span class="qty-value">${item.quantity}</span>
                                <button class="qty-btn" onclick="CarrinhoPage.changeQty(${idx}, 1)"><i class="ph ph-plus"></i></button>
                            </div>
                            <div class="cart-item-price">R$ ${price}</div>
                        </div>
                    </div>
                </div>`;
        }).join('');

        this.updateSummary();
    },

    changeQty: function(idx, delta) {
        if (Cart.items[idx].quantity + delta <= 0) {
            if (confirm('Remover este item?')) {
                Cart.remove(idx);
                this.renderCart();
            }
            return;
        }
        Cart.updateQty(idx, delta);
        this.renderCart();
    },

    updateSummary: function() {
        const subtotal = Cart.getSubtotal();
        const deliveryFee = (this.orderType === 'delivery' && this.restaurantData)
            ? parseFloat(this.restaurantData.delivery_fee || 0)
            : 0;
        const total = subtotal + deliveryFee - this.discount;

        document.getElementById('summarySubtotal').textContent = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
        document.getElementById('summaryDelivery').textContent = deliveryFee > 0 ? `R$ ${deliveryFee.toFixed(2).replace('.', ',')}` : 'Grátis';
        document.getElementById('summaryDiscount').textContent = `- R$ ${this.discount.toFixed(2).replace('.', ',')}`;
        document.getElementById('summaryTotal').textContent = `R$ ${Math.max(0, total).toFixed(2).replace('.', ',')}`;
    },

    applyCoupon: async function() {
        const code = document.getElementById('couponInput').value.trim().toUpperCase();
        if (!code) return;

        const { data: coupon, error } = await supabaseClient
            .from('coupons')
            .select('*')
            .eq('restaurant_id', this.restaurantData.id)
            .eq('code', code)
            .eq('is_active', true)
            .single();

        const feedbackEl = document.getElementById('couponFeedback');

        if (error || !coupon) {
            feedbackEl.textContent = '❌ Cupom inválido ou expirado.';
            feedbackEl.style.color = 'var(--danger-color)';
            this.discount = 0;
            this.appliedCoupon = null;
        } else {
            const subtotal = Cart.getSubtotal();
            if (subtotal < parseFloat(coupon.min_order || 0)) {
                feedbackEl.textContent = `❌ Pedido mínimo: R$ ${parseFloat(coupon.min_order).toFixed(2).replace('.', ',')}`;
                feedbackEl.style.color = 'var(--danger-color)';
                this.discount = 0;
                this.appliedCoupon = null;
            } else {
                this.appliedCoupon = coupon;
                if (coupon.type === 'percent') {
                    this.discount = subtotal * (parseFloat(coupon.value) / 100);
                } else {
                    this.discount = parseFloat(coupon.value);
                }
                const discountStr = coupon.type === 'percent' ? `${coupon.value}%` : `R$ ${parseFloat(coupon.value).toFixed(2).replace('.', ',')}`;
                feedbackEl.textContent = `✅ Cupom aplicado! Desconto de ${discountStr}`;
                feedbackEl.style.color = 'var(--primary-color)';
            }
        }
        this.updateSummary();
    },

    finalize: async function() {
        if (Cart.items.length === 0) { alert('Seu carrinho está vazio.'); return; }
        if (!this.restaurantData) { alert('Erro ao carregar dados do restaurante.'); return; }

        const customerName = document.getElementById('customerName').value.trim();
        const customerPhone = document.getElementById('customerPhone').value.trim();
        const customerAddress = this.orderType === 'delivery'
            ? document.getElementById('customerAddress').value.trim()
            : 'Retirada no local';

        if (!customerName || !customerPhone) {
            alert('Por favor, informe seu nome e telefone.');
            return;
        }
        if (this.orderType === 'delivery' && !customerAddress) {
            alert('Por favor, informe o endereço de entrega.');
            return;
        }

        const btn = document.getElementById('btnFinalize');
        btn.disabled = true;
        btn.textContent = 'Enviando pedido...';

        const subtotal = Cart.getSubtotal();
        const deliveryFee = this.orderType === 'delivery' ? parseFloat(this.restaurantData.delivery_fee || 0) : 0;
        const total = Math.max(0, subtotal + deliveryFee - this.discount);

        try {
            // Upsert customer
            const { data: custData } = await supabaseClient
                .from('customers')
                .upsert([{
                    restaurant_id: this.restaurantData.id,
                    name: customerName,
                    phone: customerPhone,
                    address: customerAddress
                }], { onConflict: 'restaurant_id,phone' })
                .select()
                .single();

            // Create order
            const { data: orderData, error: orderError } = await supabaseClient
                .from('orders')
                .insert([{
                    restaurant_id: this.restaurantData.id,
                    customer_id: custData ? custData.id : null,
                    customer_name: customerName,
                    customer_phone: customerPhone,
                    customer_address: customerAddress,
                    status: 'new',
                    type: this.orderType,
                    payment_method: this.selectedPayment,
                    subtotal,
                    delivery_fee: deliveryFee,
                    discount: this.discount,
                    total
                }])
                .select()
                .single();

            if (orderError) throw orderError;

            // Insert order items
            const items = Cart.items.map(i => ({
                order_id: orderData.id,
                product_id: i.product_id,
                product_name: i.product_name,
                quantity: i.quantity,
                unit_price: i.unit_price,
                total_price: i.total_price,
                notes: i.notes || null,
                variation_name: i.variation_name || null,
                addons: i.addons && i.addons.length > 0 ? i.addons : null
            }));

            await supabaseClient.from('order_items').insert(items);

            // Build WhatsApp message
            const orderNum = orderData.id.slice(-4).toUpperCase();
            let wppMsg = `*🍔 Novo Pedido - ${this.restaurantData.name}*\n`;
            wppMsg += `*Pedido #${orderNum}*\n\n`;
            Cart.items.forEach(item => {
                wppMsg += `• ${item.quantity}x ${item.product_name}`;
                if (item.variation_name) wppMsg += ` (${item.variation_name})`;
                if (item.addons && item.addons.length > 0) wppMsg += `\n  Adicionais: ${item.addons.map(a => a.name).join(', ')}`;
                if (item.notes) wppMsg += `\n  Obs: ${item.notes}`;
                wppMsg += ` — R$ ${item.total_price.toFixed(2).replace('.', ',')}\n`;
            });
            wppMsg += `\n*Subtotal:* R$ ${subtotal.toFixed(2).replace('.', ',')}`;
            if (deliveryFee > 0) wppMsg += `\n*Taxa de entrega:* R$ ${deliveryFee.toFixed(2).replace('.', ',')}`;
            if (this.discount > 0) wppMsg += `\n*Desconto:* - R$ ${this.discount.toFixed(2).replace('.', ',')}`;
            wppMsg += `\n*Total: R$ ${total.toFixed(2).replace('.', ',')}*`;
            wppMsg += `\n\n*Tipo:* ${this.orderType === 'delivery' ? '🛵 Entrega' : '🏠 Retirada'}`;
            wppMsg += `\n*Endereço:* ${customerAddress}`;
            wppMsg += `\n*Pagamento:* ${this.selectedPayment}`;
            wppMsg += `\n*Cliente:* ${customerName} — ${customerPhone}`;

            // Clear cart
            Cart.clear();

            // Open WhatsApp
            const wppPhone = this.restaurantData.whatsapp || '';
            if (wppPhone) {
                window.open(`https://wa.me/${wppPhone}?text=${encodeURIComponent(wppMsg)}`, '_blank');
            }

            // Redirect to success page
            window.location.href = `cardapio.html?slug=${this.cartSlug}&pedido=${orderNum}`;

        } catch (err) {
            console.error(err);
            alert('Erro ao enviar pedido: ' + err.message);
            btn.disabled = false;
            btn.textContent = '✅ Finalizar Pedido';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    CarrinhoPage.init();
});
