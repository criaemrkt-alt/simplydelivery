// Global App State and Utilities
const App = {
    state: {
        cart: [],
        currentRestaurant: null,
        userProfile: null
    },

    init: async function() {
        console.log("App initialized.");
        // We will load restaurant data and check session here later
    },

    addToCart: function(item) {
        this.state.cart.push(item);
        console.log("Added to cart:", item);
        this.updateCartUI();
    },

    updateCartUI: function() {
        // Will update floating cart badge
        const badge = document.querySelector('.cart-badge');
        if (badge) {
            badge.textContent = this.state.cart.length;
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
