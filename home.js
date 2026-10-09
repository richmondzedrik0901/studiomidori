/**
 * home.js – Studio Midori Homepage Interactive Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  initNavbarScroll();
  initMobileDrawer();
  initDynamicScheduleStatus();
  initActiveOrderAndCartPill();
  initCategoryTabs();
});

// 1. Navbar Shadow on Scroll
function initNavbarScroll() {
  const header = document.getElementById('home-nav-header');
  if (!header) return;

  const onScroll = () => {
    if (window.scrollY > 20) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// 2. Mobile Nav Drawer
function initMobileDrawer() {
  const hamburger = document.getElementById('home-nav-hamburger');
  const drawer = document.getElementById('mobile-nav-drawer');
  const closeBtn = document.getElementById('mobile-nav-close');
  const links = drawer?.querySelectorAll('a');

  if (!hamburger || !drawer) return;

  const openDrawer = () => drawer.classList.add('open');
  const closeDrawer = () => drawer.classList.remove('open');

  hamburger.addEventListener('click', openDrawer);
  closeBtn?.addEventListener('click', closeDrawer);
  drawer.addEventListener('click', (e) => {
    if (e.target === drawer) closeDrawer();
  });

  links?.forEach(link => {
    link.addEventListener('click', closeDrawer);
  });
}

// 3. Dynamic Schedule Status (Mon-Thu Advance vs Fri-Sun Live & 9 AM – 9 PM Hours)
function initDynamicScheduleStatus() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const isWeekendLive = (day === 0 || day === 5 || day === 6); // Fri, Sat, Sun
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const isWithinHours = currentTime >= '09:00' && currentTime <= '21:00';

  const liveBadge = document.getElementById('hero-schedule-badge');
  const announcementText = document.getElementById('top-announcement-text');
  const friSunPill = document.getElementById('schedule-status-frisun');
  const monThuPill = document.getElementById('schedule-status-monthu');
  const hoursPill = document.getElementById('schedule-status-hours');

  if (liveBadge) {
    if (isWeekendLive) {
      if (isWithinHours) {
        liveBadge.innerHTML = '<span class="status-dot green"></span> 🟢 Open Now: Accepting Orders (9 AM – 9 PM)';
      } else {
        liveBadge.innerHTML = '<span class="status-dot amber"></span> 🌙 Closed for Today (9 AM – 9 PM) · Advance Orders Open';
      }
    } else {
      liveBadge.innerHTML = '<span class="status-dot amber"></span> 📅 Mon–Thu: Advance Orders Open (Batch Prep)';
    }
  }

  if (announcementText) {
    if (isWeekendLive) {
      if (isWithinHours) {
        announcementText.innerHTML = '<strong>✨ Open Now (9 AM – 9 PM):</strong> Same-day pickup & delivery available in Bangued!';
      } else {
        announcementText.innerHTML = '<strong>🌙 Outside Hours (9 AM – 9 PM):</strong> Order Now opens at 9:00 AM · Advance orders welcome!';
      }
    } else {
      announcementText.innerHTML = '<strong>📌 Schedule Note:</strong> Mon–Thu advance orders only · Fri–Sun same-day (9 AM – 9 PM)';
    }
  }

  // Update Section 6 Weekly Schedule pills if present
  if (friSunPill) {
    if (isWeekendLive) {
      if (isWithinHours) {
        friSunPill.className = 'status-pill-green';
        friSunPill.textContent = 'Active Now (Open)';
      } else {
        friSunPill.className = 'status-pill-amber';
        friSunPill.textContent = 'Active (Closed for Night)';
      }
    } else {
      friSunPill.className = 'status-pill-amber';
      friSunPill.textContent = 'Opens Friday (9 AM)';
    }
  }

  if (monThuPill) {
    if (!isWeekendLive) {
      monThuPill.className = 'status-pill-green';
      monThuPill.textContent = 'Active Today (Advance)';
    } else {
      monThuPill.className = 'status-pill-amber';
      monThuPill.textContent = 'Advance Orders';
    }
  }

  if (hoursPill) {
    if (isWithinHours) {
      hoursPill.className = 'status-pill-green';
      hoursPill.textContent = 'Open Now';
    } else {
      hoursPill.className = 'status-pill-amber';
      hoursPill.textContent = 'Opens 9:00 AM';
    }
  }
}

// 4. Active Order & Cart Indicator in Header
function initActiveOrderAndCartPill() {
  const actionsContainer = document.getElementById('home-nav-actions');
  const mobileFooter = document.getElementById('mobile-nav-footer');
  if (!actionsContainer) return;

  let activeOrderId = null;
  try {
    activeOrderId = localStorage.getItem('midori_active_order_id');
  } catch (e) {}

  let cartCount = 0;
  try {
    const saved = JSON.parse(localStorage.getItem('midori_order_state') || '{}');
    if (saved && saved.items) {
      cartCount = Object.values(saved.items).reduce((sum, item) => sum + (item.qty || 1), 0);
    }
  } catch (e) {}

  let pillHtml = '';
  if (activeOrderId) {
    pillHtml = `
      <a href="/order" class="home-active-order-pill" title="Track your current order">
        <span>🔔</span> Track Order #${activeOrderId}
      </a>
    `;
  } else if (cartCount > 0) {
    pillHtml = `
      <a href="/order" class="home-active-order-pill" style="background:#dcfce7;border-color:#86efac;color:#166534;" title="Resume your order">
        <span>🛒</span> Cart (${cartCount} cups)
      </a>
    `;
  }

  if (pillHtml) {
    const existingPill = document.getElementById('nav-state-pill');
    if (existingPill) existingPill.remove();

    const pillWrap = document.createElement('div');
    pillWrap.id = 'nav-state-pill';
    pillWrap.innerHTML = pillHtml;
    actionsContainer.prepend(pillWrap);

    if (mobileFooter) {
      const mobilePill = pillWrap.cloneNode(true);
      mobileFooter.prepend(mobilePill);
    }
  }
}

// 5. Featured Drinks Category Filter Tabs
function initCategoryTabs() {
  const tabs = document.querySelectorAll('.home-menu-tab-btn');
  const drinkCards = document.querySelectorAll('.home-drink-card');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const cat = tab.getAttribute('data-category');
      drinkCards.forEach(card => {
        if (cat === 'all' || card.getAttribute('data-category') === cat) {
          card.style.display = 'flex';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });
}
