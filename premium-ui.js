/**
 * premium-ui.js
 * Handles micro-interactions and animations for Studio Midori.
 */

export function initPremiumUI() {
  // Add ripple effect to buttons
  const buttons = document.querySelectorAll('.place-order-btn, .header-cart-btn, .category-tab-btn, .qty-btn, .sticky-cart-btn');
  
  buttons.forEach(btn => {
    btn.addEventListener('click', function (e) {
      const rect = this.getBoundingClientRect();
      const x = e.clientX ? e.clientX - rect.left : rect.width / 2;
      const y = e.clientY ? e.clientY - rect.top : rect.height / 2;

      const ripple = document.createElement('span');
      ripple.classList.add('ripple');
      
      const size = Math.max(rect.width, rect.height);
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${x - size / 2}px`;
      ripple.style.top = `${y - size / 2}px`;
      
      this.appendChild(ripple);
      
      setTimeout(() => {
        ripple.remove();
      }, 600);
    });
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPremiumUI);
} else {
  initPremiumUI();
}
