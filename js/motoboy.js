const Motoboy = {
    restaurantId: null,
    driverId: null,
    driverName: null,
    activeTab: 'pending',

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
        this.driverId = App.state.userProfile.id;
        this.driverName = App.state.userProfile.name || 'Entregador';

        // Show driver name
        const nameEl = document.getElementById('driverName');
        if (nameEl) nameEl.textContent = `Olá, ${this.driverName}`;

        this.setupTabs();
        this.loadDeliveries();
    },

    setupTabs: function() {
        document.getElementById('tabPending').addEventListener('click', () => {
            this.activeTab = 'pending';
            document.getElementById('tabPending').classList.add('active');
            document.getElementById('tabDone').classList.remove('active');
            this.loadDeliveries();
        });
        document.getElementById('tabDone').addEventListener('click', () => {
            this.activeTab = 'done';
            document.getElementById('tabDone').classList.add('active');
            document.getElementById('tabPending').classList.remove('active');
            this.loadDeliveries();
        });
    },

    loadDeliveries: async function() {
        const container = document.getElementById('deliveryList');
        container.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-muted);"><i class="ph ph-spinner" style="font-size:2rem; display:block; margin-bottom:8px;"></i>Carregando...</div>`;

        let query = supabaseClient
            .from('orders')
            .select('*, order_items(*)')
            .eq('restaurant_id', this.restaurantId)
            .order('created_at', { ascending: false });

        if (this.activeTab === 'pending') {
            // Show ready + delivering orders assigned to this driver OR unassigned ready orders
            query = query.in('status', ['ready', 'delivering']);
        } else {
            // Completed deliveries for today
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            query = query
                .eq('status', 'delivered')
                .gte('created_at', today.toISOString());
        }

        const { data: orders, error } = await query;

        // Update tab counts
        if (this.activeTab === 'pending') {
            document.getElementById('tabPending').textContent = `Pendentes (${orders ? orders.length : 0})`;
        } else {
            document.getElementById('tabDone').textContent = `Entregues hoje (${orders ? orders.length : 0})`;
        }

        if (error) {
            container.innerHTML = `<div style="text-align:center; padding:40px; color:var(--danger-color);">Erro ao carregar entregas.</div>`;
            return;
        }

        if (!orders || orders.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:40px; color:var(--text-muted);">
                    <i class="ph ph-moped" style="font-size:3rem; display:block; margin-bottom:12px;"></i>
                    <strong>${this.activeTab === 'pending' ? 'Nenhuma entrega pendente no momento.' : 'Nenhuma entrega concluída hoje.'}</strong>
                </div>`;
            return;
        }

        container.innerHTML = orders.map(order => this.renderDeliveryCard(order)).join('');
    },

    renderDeliveryCard: function(order) {
        const createdAt = new Date(order.created_at);
        const now = new Date();
        const diffMin = Math.floor((now - createdAt) / 60000);
        const timeLabel = diffMin < 60 ? `Há ${diffMin} min` : `Há ${Math.floor(diffMin/60)}h`;

        const itemsHtml = (order.order_items || [])
            .map(i => `${i.quantity}x ${i.product_name}`)
            .join(', ');

        const total = parseFloat(order.total).toFixed(2).replace('.', ',');
        const statusBadge = order.status === 'delivering'
            ? '<span style="background:#EFF6FF;color:#3B82F6;padding:2px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;">Em rota</span>'
            : '<span style="background:#ECFDF5;color:#10B981;padding:2px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;">Pronto</span>';

        const address = order.customer_address || 'Endereço não informado';
        const phone = order.customer_phone || '';
        const mapsUrl = encodeURIComponent(address);
        const wppUrl = `https://wa.me/${phone}`;

        let actionBtn = '';
        if (order.status === 'ready') {
            actionBtn = `<button class="btn-confirm" onclick="Motoboy.acceptDelivery('${order.id}')">
                <i class="ph-bold ph-moped"></i> Aceitar Entrega
            </button>`;
        } else if (order.status === 'delivering') {
            actionBtn = `<button class="btn-confirm" onclick="Motoboy.confirmDelivery('${order.id}')">
                <i class="ph-bold ph-check"></i> Confirmar Entrega
            </button>`;
        }

        return `
            <div class="delivery-card">
                <div class="delivery-header">
                    <span class="delivery-id">Pedido #${order.id.slice(-4).toUpperCase()}</span>
                    <div style="display:flex; align-items:center; gap:8px;">
                        ${statusBadge}
                        <span class="delivery-time">${timeLabel}</span>
                    </div>
                </div>

                <div class="customer-info">
                    <div class="customer-icon"><i class="ph-fill ph-map-pin"></i></div>
                    <div class="customer-details">
                        <h3>${order.customer_name}</h3>
                        <p>${address}</p>
                        <p style="margin-top: 6px; color: var(--text-main); font-weight: 500;">
                            Pagamento: ${order.payment_method || 'Não informado'}
                        </p>
                        ${itemsHtml ? `<p style="margin-top:4px; font-size:0.8rem; color:var(--text-muted);">${itemsHtml}</p>` : ''}
                    </div>
                </div>

                <div class="action-buttons">
                    <button class="btn-map" onclick="window.open('https://www.google.com/maps/search/?api=1&query=${mapsUrl}', '_blank')">
                        <i class="ph-fill ph-navigation-arrow"></i> Ver Rota
                    </button>
                    ${phone ? `<button class="btn-wpp" onclick="window.open('${wppUrl}', '_blank')">
                        <i class="ph-fill ph-whatsapp-logo"></i> Mensagem
                    </button>` : ''}
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <span style="font-size:0.85rem; color:var(--text-muted);">Total do pedido</span>
                    <span style="font-weight:700; font-size:1.1rem; color:var(--primary-color);">R$ ${total}</span>
                </div>

                ${actionBtn}
            </div>`;
    },

    acceptDelivery: async function(orderId) {
        const { error } = await supabaseClient
            .from('orders')
            .update({ status: 'delivering', driver_id: this.driverId })
            .eq('id', orderId);
        if (error) alert(error.message);
        else this.loadDeliveries();
    },

    confirmDelivery: async function(orderId) {
        if (!confirm('Confirmar entrega realizada?')) return;
        const { error } = await supabaseClient
            .from('orders')
            .update({ status: 'delivered' })
            .eq('id', orderId);

        if (error) { alert(error.message); return; }

        // Update customer stats
        const { data: order } = await supabaseClient.from('orders').select('customer_id, total').eq('id', orderId).single();
        if (order && order.customer_id) {
            const { data: cust } = await supabaseClient.from('customers').select('order_count, total_spent').eq('id', order.customer_id).single();
            if (cust) {
                await supabaseClient.from('customers').update({
                    order_count: (cust.order_count || 0) + 1,
                    total_spent: parseFloat(cust.total_spent || 0) + parseFloat(order.total || 0)
                }).eq('id', order.customer_id);
            }
        }

        this.loadDeliveries();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Motoboy.init();
});
