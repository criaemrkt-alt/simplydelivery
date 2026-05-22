const Caixa = {
    restaurantId: null,
    pollingInterval: null,

    init: async function() {
        let attempts = 0;
        while (!App.state.userProfile && attempts < 20) {
            await new Promise(r => setTimeout(r, 150));
            attempts++;
        }
        if (!App.state.userProfile) {
            window.location.href = 'index.html';
            return;
        }
        this.restaurantId = App.state.userProfile.restaurant_id;

        await this.loadOrders();
        this.setupNewOrderModal();
        this.setupRefreshButton();

        // Auto-refresh every 30 seconds
        this.pollingInterval = setInterval(() => this.loadOrders(), 30000);
    },

    setupRefreshButton: function() {
        const btn = document.getElementById('btnRefresh');
        if (btn) btn.addEventListener('click', () => this.loadOrders());
    },

    // ─── STATUS CONFIG ───────────────────────────────────────────────────────────
    statusConfig: {
        'new':        { label: 'Novos Pedidos',   color: '#EF4444', nextStatus: 'prep',       nextLabel: 'Aceitar' },
        'prep':       { label: 'Em Preparo',       color: '#F59E0B', nextStatus: 'ready',      nextLabel: 'Pronto' },
        'ready':      { label: 'Pronto p/ Saída', color: '#10B981', nextStatus: 'delivering', nextLabel: 'Despachar' },
        'delivering': { label: 'Saiu p/ Entrega', color: '#3B82F6', nextStatus: null,         nextLabel: null },
    },

    // ─── LOAD ORDERS ────────────────────────────────────────────────────────────
    loadOrders: async function() {
        const { data: orders, error } = await supabaseClient
            .from('orders')
            .select('*, order_items(*)')
            .eq('restaurant_id', this.restaurantId)
            .in('status', ['new', 'prep', 'ready', 'delivering'])
            .order('created_at', { ascending: true });

        if (error) { console.error(error); return; }

        // Group by status
        const grouped = { new: [], prep: [], ready: [], delivering: [] };
        (orders || []).forEach(o => { if (grouped[o.status]) grouped[o.status].push(o); });

        // Render each column
        Object.keys(grouped).forEach(status => {
            const col = document.getElementById(`col-${status}`);
            const countEl = document.getElementById(`count-${status}`);
            if (!col) return;

            countEl.textContent = grouped[status].length;

            if (grouped[status].length === 0) {
                col.innerHTML = `<div style="text-align:center; padding:24px; color:var(--text-muted); font-size:0.85rem;">
                    <i class="ph ph-tray" style="font-size:2rem; display:block; margin-bottom:8px;"></i>
                    Nenhum pedido
                </div>`;
                return;
            }

            col.innerHTML = grouped[status].map(order => this.renderOrderCard(order)).join('');
        });
    },

    renderOrderCard: function(order) {
        const cfg = this.statusConfig[order.status];
        const createdAt = new Date(order.created_at);
        const now = new Date();
        const diffMin = Math.floor((now - createdAt) / 60000);
        const timeLabel = diffMin < 1 ? 'Agora' : diffMin < 60 ? `${diffMin} min` : `${Math.floor(diffMin/60)}h${diffMin%60}min`;

        const itemsHtml = (order.order_items || [])
            .map(i => `${i.quantity}x ${i.product_name}`)
            .join('<br>');

        const typeLabel = order.type === 'pickup' ? '🏠 Retirada' : '🛵 Entrega';
        const total = parseFloat(order.total).toFixed(2).replace('.', ',');

        let actionBtn = '';
        if (cfg.nextStatus) {
            actionBtn = `<button class="btn-action" style="background:${cfg.color};color:#fff;border-color:${cfg.color};"
                onclick="Caixa.advanceOrder('${order.id}', '${cfg.nextStatus}')">${cfg.nextLabel}</button>`;
        }

        return `
            <div class="order-card" id="order-${order.id}">
                <div class="order-header">
                    <span class="order-id">#${order.id.slice(-4).toUpperCase()}</span>
                    <span class="order-time">${timeLabel}</span>
                </div>
                <div class="order-customer">${order.customer_name}</div>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:4px;">${typeLabel} · ${order.payment_method || 'Não informado'}</div>
                <div class="order-items">${itemsHtml || 'Sem itens'}</div>
                <div class="order-footer">
                    <span class="order-total">R$ ${total}</span>
                    <div style="display:flex; gap:6px; align-items:center;">
                        ${actionBtn}
                        <button class="btn-action" style="color:var(--danger-color);" onclick="Caixa.cancelOrder('${order.id}')">✕</button>
                    </div>
                </div>
                ${order.notes ? `<div style="font-size:0.8rem; color:var(--primary-color); margin-top:8px; padding-top:8px; border-top:1px solid var(--border-color);">📝 ${order.notes}</div>` : ''}
            </div>`;
    },

    advanceOrder: async function(orderId, newStatus) {
        const { error } = await supabaseClient
            .from('orders')
            .update({ status: newStatus })
            .eq('id', orderId);
        if (error) alert(error.message);
        else this.loadOrders();
    },

    cancelOrder: async function(orderId) {
        if (!confirm('Cancelar este pedido?')) return;
        const { error } = await supabaseClient
            .from('orders')
            .update({ status: 'canceled' })
            .eq('id', orderId);
        if (error) alert(error.message);
        else this.loadOrders();
    },

    // ─── MANUAL ORDER MODAL ─────────────────────────────────────────────────────
    setupNewOrderModal: function() {
        const btn = document.getElementById('btnNewOrder');
        if (btn) btn.addEventListener('click', () => this.openNewOrderModal());

        const form = document.getElementById('newOrderForm');
        if (form) form.addEventListener('submit', (e) => this.saveManualOrder(e));
    },

    openNewOrderModal: async function() {
        // Load products for selection
        const { data: products } = await supabaseClient
            .from('products')
            .select('id, name, price, categories(name)')
            .eq('restaurant_id', this.restaurantId)
            .eq('is_active', true)
            .order('name');

        const select = document.getElementById('manualProductSelect');
        if (select) {
            select.innerHTML = '<option value="">-- Selecione um produto --</option>';
            (products || []).forEach(p => {
                const price = parseFloat(p.price).toFixed(2);
                select.innerHTML += `<option value="${p.id}" data-price="${price}" data-name="${p.name}">${p.name} — R$ ${price.replace('.', ',')}</option>`;
            });
        }

        // Reset cart list
        this.manualCart = [];
        this.renderManualCart();

        document.getElementById('newOrderModal').style.display = 'flex';
    },

    manualCart: [],

    addToManualCart: function() {
        const select = document.getElementById('manualProductSelect');
        const qty = parseInt(document.getElementById('manualQty').value) || 1;
        if (!select.value) { alert('Selecione um produto.'); return; }

        const opt = select.options[select.selectedIndex];
        const price = parseFloat(opt.getAttribute('data-price'));
        const name = opt.getAttribute('data-name');

        const existing = this.manualCart.find(i => i.id === select.value);
        if (existing) {
            existing.qty += qty;
        } else {
            this.manualCart.push({ id: select.value, name, price, qty });
        }
        this.renderManualCart();
        select.value = '';
        document.getElementById('manualQty').value = 1;
    },

    renderManualCart: function() {
        const container = document.getElementById('manualCartItems');
        if (!container) return;

        if (this.manualCart.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem; text-align:center; padding:8px;">Nenhum item adicionado.</p>';
            document.getElementById('manualCartTotal').textContent = 'R$ 0,00';
            return;
        }

        container.innerHTML = this.manualCart.map((item, idx) => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--border-color);">
                <span style="font-size:0.9rem;">${item.qty}x ${item.name}</span>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-weight:600;">R$ ${(item.price * item.qty).toFixed(2).replace('.', ',')}</span>
                    <button onclick="Caixa.removeFromManualCart(${idx})" style="background:none;border:none;color:var(--danger-color);cursor:pointer;">✕</button>
                </div>
            </div>`).join('');

        const total = this.manualCart.reduce((sum, i) => sum + i.price * i.qty, 0);
        document.getElementById('manualCartTotal').textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
    },

    removeFromManualCart: function(idx) {
        this.manualCart.splice(idx, 1);
        this.renderManualCart();
    },

    saveManualOrder: async function(e) {
        e.preventDefault();
        if (this.manualCart.length === 0) { alert('Adicione pelo menos um produto.'); return; }

        const customerName = document.getElementById('manualCustomerName').value.trim();
        const customerPhone = document.getElementById('manualCustomerPhone').value.trim();
        const type = document.getElementById('manualOrderType').value;
        const paymentMethod = document.getElementById('manualPayment').value;
        const notes = document.getElementById('manualNotes').value.trim();

        if (!customerName || !customerPhone) { alert('Preencha nome e telefone do cliente.'); return; }

        const subtotal = this.manualCart.reduce((sum, i) => sum + i.price * i.qty, 0);
        const deliveryFee = type === 'delivery' ? 0 : 0; // Could fetch from restaurant settings
        const total = subtotal + deliveryFee;

        // Upsert customer
        const { data: custData } = await supabaseClient
            .from('customers')
            .upsert([{ restaurant_id: this.restaurantId, name: customerName, phone: customerPhone }], { onConflict: 'restaurant_id,phone' })
            .select()
            .single();

        // Create order
        const { data: orderData, error: orderError } = await supabaseClient
            .from('orders')
            .insert([{
                restaurant_id: this.restaurantId,
                customer_id: custData ? custData.id : null,
                customer_name: customerName,
                customer_phone: customerPhone,
                status: 'new',
                type,
                payment_method: paymentMethod,
                subtotal,
                delivery_fee: deliveryFee,
                discount: 0,
                total,
                notes
            }])
            .select()
            .single();

        if (orderError) { alert(orderError.message); return; }

        // Insert order items
        const items = this.manualCart.map(i => ({
            order_id: orderData.id,
            product_id: i.id,
            product_name: i.name,
            quantity: i.qty,
            unit_price: i.price,
            total_price: i.price * i.qty
        }));

        await supabaseClient.from('order_items').insert(items);

        document.getElementById('newOrderModal').style.display = 'none';
        document.getElementById('newOrderForm').reset();
        this.manualCart = [];
        this.loadOrders();
        alert('✅ Pedido criado com sucesso!');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Caixa.init();
});
