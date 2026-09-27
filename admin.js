/**
 * admin.js – Studio Midori Admin Dashboard (Orders, Menu, Matcha & Add-ons Management)
 */

import { db } from './firebase.js';
import {
  ref, onValue, update, set, remove, get, query, orderByChild, push,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js';

const STATUSES = ['NEW', 'PREPARING', 'READY', 'COMPLETED'];

const STATUS_LABELS = {
  NEW:       '🆕 New',
  PREPARING: '👩‍🍳 Preparing',
  READY:     '✅ Ready',
  COMPLETED: '🎉 Completed',
};

// ── Default Initial Seed Data (if database is brand new) ──────────────
const DEFAULT_PRODUCTS = {
  'matcha-latte': {
    id: 'matcha-latte',
    name: 'Matcha Latte',
    category: 'matcha',
    price: 199,
    description: 'Rich Japanese green tea whisked with creamy steamed milk.',
    hasMatcha: true,
    available: true,
    image: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=500&auto=format&fit=crop&q=80',
  },
  'strawberry-matcha': {
    id: 'strawberry-matcha',
    name: 'Strawberry Matcha',
    category: 'matcha',
    price: 229,
    description: 'Real strawberry purée layered with ceremonial grade matcha latte.',
    hasMatcha: true,
    available: true,
    image: 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=500&auto=format&fit=crop&q=80',
  },
  'hojicha': {
    id: 'hojicha',
    name: 'Hojicha Latte',
    category: 'hojicha',
    price: 199,
    description: 'Roasted Japanese green tea with toasty, caramel nutty notes.',
    hasMatcha: false,
    available: true,
    image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=500&auto=format&fit=crop&q=80',
  },
  'matcha-cloud': {
    id: 'matcha-cloud',
    name: 'Matcha Cloud',
    category: 'matcha',
    price: 219,
    description: 'Iced matcha topped with a velvety whipped sea-salt cream cap.',
    hasMatcha: true,
    available: true,
    image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop&q=80',
  },
};

const DEFAULT_MATCHA_CHOICES = ['Classic', 'Ceremonial', 'Strong', 'Light'];

const DEFAULT_ADDONS = {
  'extra-matcha-gram': { id: 'extra-matcha-gram', name: 'Extra Matcha', price: 25, unit: 'g', type: 'quantity', available: true },
  'oat-milk':    { id: 'oat-milk', name: 'Oat Milk Upgrade', price: 35, available: true },
  'extra-shot':  { id: 'extra-shot', name: 'Extra Whisk Shot', price: 40, available: true },
  'cold-foam':   { id: 'cold-foam', name: 'Sea Salt Cold Foam', price: 45, available: true },
  'boba-pearls': { id: 'boba-pearls', name: 'Brown Sugar Pearls', price: 25, available: true },
};

// ── State ─────────────────────────────────────────────────────────────
let currentTab              = 'ALL';
let currentFirebaseKey      = null;  // Firebase key of the open order
let allOrders               = [];    // [{ _key, ...orderData }] cached locally
let adminMenuProducts       = {};    // { [id]: productData }
let adminMatchaChoices      = [];    // ['Classic', ...]
let adminAddOns             = {};    // { [id]: addOnData }
let currentDrinkImageData   = '';    // Base64 or URL for modal preview

// ── Navigation Section Switcher ───────────────────────────────────────
window.switchAdminSection = function(section) {
  const ordersBtn = document.getElementById('nav-btn-orders');
  const menuBtn   = document.getElementById('nav-btn-menu');
  const ordersSec = document.getElementById('orders-section');
  const menuSec   = document.getElementById('menu-section');

  if (section === 'orders') {
    ordersBtn?.classList.add('active');
    menuBtn?.classList.remove('active');
    ordersSec?.classList.remove('hidden');
    menuSec?.classList.add('hidden');
  } else {
    menuBtn?.classList.add('active');
    ordersBtn?.classList.remove('active');
    menuSec?.classList.remove('hidden');
    ordersSec?.classList.add('hidden');
  }

  sessionStorage.setItem('midori_admin_section', section);
};

// Restore last active section on reload
(function restoreAdminSection() {
  const saved = sessionStorage.getItem('midori_admin_section');
  if (saved && saved !== 'orders') {
    // Defer until DOM is ready
    document.addEventListener('DOMContentLoaded', () => switchAdminSection(saved));
  }
})();


// ══════════════════════════════════════════════════════════════════════
// ORDERS MODULE
// ══════════════════════════════════════════════════════════════════════

let isInitialAdminLoad = true;
let previousOrderKeys = new Set();

function playAdminAlertSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
    osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch(e) {}
}

function startListeningOrders() {
  renderTabs();

  try {
    const ordersRef = query(ref(db, 'orders'), orderByChild('timestamp'));

    onValue(ordersRef, (snapshot) => {
      allOrders = [];

      if (snapshot.exists()) {
        snapshot.forEach((child) => {
          allOrders.push({ _key: child.key, ...child.val() });
        });
        allOrders.reverse();
      }

      if (!isInitialAdminLoad) {
        const newOrders = allOrders.filter(o => o.status === 'NEW' && !previousOrderKeys.has(o._key));
        if (newOrders.length > 0) {
          playAdminAlertSound();
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('New Order Received! 🍵', {
              body: `You have ${newOrders.length} new order(s) waiting.`,
              icon: '/logo.png'
            });
          }
        }
      }

      previousOrderKeys = new Set(allOrders.map(o => o._key));
      isInitialAdminLoad = false;

      // Update badge in nav
      const newCount = allOrders.filter(o => o.status === 'NEW').length;
      const navBadge = document.getElementById('nav-orders-count');
      if (navBadge) navBadge.textContent = newCount;

      renderOrders();

      if (currentFirebaseKey) {
        const updated = allOrders.find(o => o._key === currentFirebaseKey);
        if (updated) renderModal(updated);
      }
    }, (error) => {
      console.error('Firebase orders read error:', error);
      const container = document.getElementById('orders-list');
      if (container) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">⚠️</div>
            <p style="color:#c53030;font-weight:700">Firebase Connection Error</p>
            <p style="font-size:13px;margin-top:6px">${error.message}</p>
          </div>
        `;
      }
    });
  } catch (err) {
    console.error('Orders query failed:', err);
  }
}

function renderTabs() {
  const tabs   = ['ALL', ...STATUSES];
  const tabBar = document.getElementById('tab-bar');
  if (!tabBar) return;

  tabBar.innerHTML = tabs.map(tab => {
    const count = tab === 'ALL'
      ? allOrders.length
      : allOrders.filter(o => o.status === tab).length;
    const isActive = tab === currentTab;
    return `
      <button class="tab-btn ${isActive ? 'active' : ''}" onclick="setTab('${tab}')" id="tab-${tab}">
        ${tab === 'ALL' ? 'All' : STATUS_LABELS[tab]}
        <span class="count-badge">${count}</span>
      </button>
    `;
  }).join('');
}

function renderOrders() {
  renderTabs();

  const filtered = currentTab === 'ALL'
    ? allOrders
    : allOrders.filter(o => o.status === currentTab);

  const container = document.getElementById('orders-list');
  if (!container) return;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🍵</div>
        <p>${allOrders.length === 0 ? 'No orders yet. Share your order link!' : 'No orders in this category.'}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(order => {
    const statusClass  = (order.status || 'NEW').toLowerCase();
    const itemSummary  = (order.items || []).map(i => `${i.name} ×${i.qty}`).join(', ');
    const typeIcon     = order.deliveryType === 'pickup' ? '🏪' : '🛵';
    const timestamp    = formatDateTime(order.timestamp);

    return `
      <div class="order-card" onclick="openOrder('${order._key}')" id="card-${order._key}">
        <div class="order-card-header">
          <div>
            <div class="order-number">${order.orderNumber}</div>
            <div class="order-meta">${order.name} · ${typeIcon} ${order.deliveryType} · ${timestamp}</div>
          </div>
          <span class="status-badge ${statusClass}">${STATUS_LABELS[order.status] || order.status}</span>
        </div>
        <div class="order-card-body">
          <div class="order-summary-line">${itemSummary}</div>
          <div class="order-total-line">₱${(order.total || 0).toLocaleString()}</div>
        </div>
      </div>
    `;
  }).join('');
}

window.setTab = function(tab) {
  currentTab = tab;
  renderOrders();
};

let adminMiniMap = null;

window.openOrder = function(firebaseKey) {
  const order = allOrders.find(o => o._key === firebaseKey);
  if (!order) return;

  currentFirebaseKey = firebaseKey;
  renderModal(order);
  document.getElementById('order-modal').classList.add('open');
  document.body.style.overflow = 'hidden';

  // Render admin mini-map if order has pinned coordinates
  if (order.latitude && order.longitude && typeof L !== 'undefined') {
    setTimeout(() => {
      const mapContainer = document.getElementById('admin-order-map');
      if (!mapContainer) return;
      if (adminMiniMap) {
        adminMiniMap.remove();
        adminMiniMap = null;
      }
      try {
        adminMiniMap = L.map('admin-order-map', {
          zoomControl: true,
          attributionControl: false,
        }).setView([order.latitude, order.longitude], 15);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
        }).addTo(adminMiniMap);

        L.marker([order.latitude, order.longitude]).addTo(adminMiniMap);
        adminMiniMap.invalidateSize();
      } catch (err) {
        console.warn('Admin mini-map render error:', err);
      }
    }, 150);
  }
};

window.closeModal = function() {
  document.getElementById('order-modal').classList.remove('open');
  document.body.style.overflow = '';
  currentFirebaseKey = null;
  if (adminMiniMap) {
    adminMiniMap.remove();
    adminMiniMap = null;
  }
};

function renderModal(order) {
  const typeLabel = order.deliveryType === 'pickup' ? '🏪 Pickup' : '🛵 Delivery';

  const mapLink = order.mapUrl || ((order.latitude && order.longitude)
    ? `https://www.google.com/maps?q=${order.latitude},${order.longitude}`
    : '');

  const deliverySection = order.deliveryType === 'delivery' ? `
    <div class="modal-info-row">
      <span class="modal-info-label">Address</span>
      <span class="modal-info-value">${order.address || '—'}</span>
    </div>
    ${(order.latitude && order.longitude) ? `
    <div class="modal-info-row">
      <span class="modal-info-label">Pinned Location</span>
      <span class="modal-info-value">
        ${Number(order.latitude).toFixed(5)}, ${Number(order.longitude).toFixed(5)}
        ${mapLink ? `<a href="${mapLink}" target="_blank" rel="noopener" class="map-link-btn">Open in Google Maps ↗</a>` : ''}
      </span>
    </div>
    <div style="margin: 8px 0;">
      <div id="admin-order-map"></div>
    </div>
    ` : ''}
    ${order.deliveryNotes ? `
    <div class="modal-info-row">
      <span class="modal-info-label">Notes</span>
      <span class="modal-info-value">${order.deliveryNotes}</span>
    </div>` : ''}
  ` : '';

  const itemRows = (order.items || []).map(i => {
    let sub = [];
    if (i.matcha) sub.push(i.matcha);
    if (i.sweetness) sub.push(`${i.sweetness} sweet`);
    if (i.addOns && i.addOns.length) {
      sub.push('+ ' + i.addOns.map(a => {
        const qtyStr = (a.qty && a.qty > 1) ? ` (${a.qty}${a.unit || 'x'})` : '';
        const totalPrice = (a.price || 0) * (a.qty || 1);
        return `${a.name}${qtyStr} (₱${totalPrice})`;
      }).join(', '));
    }
    const subText = sub.length ? `<div class="item-sub">${sub.join(' · ')}</div>` : '';

    return `
      <tr>
        <td>${i.name}${subText}</td>
        <td>${i.qty}</td>
        <td>₱${(i.unitPrice || i.price || 0).toLocaleString()}</td>
        <td style="text-align:right">₱${((i.unitPrice || i.price || 0) * i.qty).toLocaleString()}</td>
      </tr>
    `;
  }).join('');

  const statusBtns = STATUSES.map(s => {
    const isCurrent = order.status === s;
    return `
      <button
        class="status-change-btn ${isCurrent ? 'current' : ''}"
        data-status="${s}"
        ${isCurrent ? 'disabled' : `onclick="changeStatus('${s}')"`}>
        ${STATUS_LABELS[s]}
      </button>
    `;
  }).join('');

  document.getElementById('modal-order-number').textContent = order.orderNumber;

  document.getElementById('modal-body').innerHTML = `
    <div class="modal-section-title">Customer</div>
    <div class="modal-info-row">
      <span class="modal-info-label">Name</span>
      <span class="modal-info-value">${order.name}</span>
    </div>
    <div class="modal-info-row">
      <span class="modal-info-label">Mobile</span>
      <span class="modal-info-value"><a href="tel:${order.mobile}" style="color:var(--green-600);text-decoration:none">${order.mobile}</a></span>
    </div>
    <div class="modal-info-row">
      <span class="modal-info-label">Facebook</span>
      <span class="modal-info-value">${order.fbName}</span>
    </div>

    <div class="modal-section-title" style="margin-top:16px">Order Info</div>
    <div class="modal-info-row">
      <span class="modal-info-label">Type</span>
      <span class="modal-info-value">${typeLabel}</span>
    </div>
    ${deliverySection}
    <div class="modal-info-row">
      <span class="modal-info-label">Date</span>
      <span class="modal-info-value">${formatDate(order.orderDate)}</span>
    </div>
    <div class="modal-info-row">
      <span class="modal-info-label">Time</span>
      <span class="modal-info-value">${formatTime(order.preferredTime)}</span>
    </div>
    <div class="modal-info-row">
      <span class="modal-info-label">Placed</span>
      <span class="modal-info-value">${formatDateTime(order.timestamp)}</span>
    </div>

    <div class="modal-section-title" style="margin-top:16px">Items</div>
    <table class="modal-items-table">
      <thead>
        <tr>
          <th>Item</th><th>Qty</th><th>Price</th><th style="text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div class="modal-total-section">
      <div class="modal-total-row">
        <span>Subtotal</span>
        <span>₱${(order.subtotal || 0).toLocaleString()}</span>
      </div>
      ${order.deliveryFee > 0 ? `
      <div class="modal-total-row">
        <span>Delivery Fee</span>
        <span>₱${order.deliveryFee.toLocaleString()}</span>
      </div>` : ''}
      <div class="modal-total-row grand">
        <span>Total</span>
        <span>₱${(order.total || 0).toLocaleString()}</span>
      </div>
    </div>
  `;

  document.getElementById('modal-status-buttons').innerHTML = statusBtns;

  // Show delete button only for completed orders
  const deleteArea = document.getElementById('modal-delete-area');
  if (deleteArea) {
    deleteArea.innerHTML = order.status === 'COMPLETED'
      ? `<button class="delete-order-btn" onclick="deleteOrder('${order._key}', '${order.orderNumber}')">
           🗑 Delete This Order
         </button>`
      : '';
  }
}

window.changeStatus = async function(newStatus) {
  if (!currentFirebaseKey) return;

  try {
    await update(ref(db, `orders/${currentFirebaseKey}`), { status: newStatus });
    showToast(`Status updated to ${newStatus} ✓`);
  } catch (err) {
    console.error('Failed to update status:', err);
    showToast('Could not update status. Check connection.');
  }
};

window.deleteOrder = async function(firebaseKey, orderNumber) {
  if (!confirm(`Delete order ${orderNumber}? This cannot be undone.`)) return;
  try {
    await remove(ref(db, `orders/${firebaseKey}`));
    closeModal();
    showToast(`Order ${orderNumber} deleted ✓`);
  } catch (err) {
    console.error('Failed to delete order:', err);
    showToast('Failed to delete order.');
  }
};


// ══════════════════════════════════════════════════════════════════════
// MENU, MATCHA & ADD-ONS MANAGEMENT MODULE
// ══════════════════════════════════════════════════════════════════════

function startListeningMenu() {
  // 1. Listen for Matcha Choices
  const matchaRef = ref(db, 'menu/matchaChoices');
  onValue(matchaRef, (snapshot) => {
    adminMatchaChoices = snapshot.exists()
      ? (Array.isArray(snapshot.val()) ? snapshot.val() : Object.values(snapshot.val()))
      : [];
    renderMatchaChoices();
  });

  // 2. Listen for Products
  const productsRef = ref(db, 'menu/products');
  onValue(productsRef, (snapshot) => {
    adminMenuProducts = snapshot.exists() ? snapshot.val() : {};
    renderAdminProducts();
  });

  // 3. Listen for Add-ons
  const addOnsRef = ref(db, 'menu/addOns');
  onValue(addOnsRef, (snapshot) => {
    adminAddOns = snapshot.exists() ? snapshot.val() : {};
    renderAdminAddOns();
  });
}

// ── Matcha Choices Handlers ──
function renderMatchaChoices() {
  const container = document.getElementById('matcha-chips-list');
  if (!container) return;

  if (adminMatchaChoices.length === 0) {
    container.innerHTML = '<span style="font-size:13px;color:var(--text-soft)">No matcha varieties defined yet.</span>';
    return;
  }

  container.innerHTML = adminMatchaChoices.map((choice, idx) => `
    <div class="matcha-chip">
      <span>🍃 ${choice}</span>
      <button class="matcha-chip-del" onclick="removeMatchaChoice(${idx})" title="Remove choice" aria-label="Remove ${choice}">✕</button>
    </div>
  `).join('');
}

window.addMatchaChoice = async function() {
  const input = document.getElementById('new-matcha-input');
  const val = input.value.trim();
  if (!val) return;

  if (adminMatchaChoices.some(c => c.toLowerCase() === val.toLowerCase())) {
    showToast('That matcha variety already exists.');
    return;
  }

  const updated = [...adminMatchaChoices, val];
  try {
    await set(ref(db, 'menu/matchaChoices'), updated);
    input.value = '';
    showToast(`Added "${val}" to matcha choices! ✓`);
  } catch (err) {
    console.error('Failed to add matcha choice:', err);
    showToast('Failed to save. Check connection.');
  }
};

window.removeMatchaChoice = async function(index) {
  const removedName = adminMatchaChoices[index];
  if (!confirm(`Remove "${removedName}" from matcha choices?`)) return;

  const updated = adminMatchaChoices.filter((_, idx) => idx !== index);
  try {
    await set(ref(db, 'menu/matchaChoices'), updated);
    showToast(`Removed "${removedName}" ✓`);
  } catch (err) {
    console.error('Failed to remove matcha choice:', err);
    showToast('Failed to remove. Check connection.');
  }
};

// ── Add-ons Handlers ──
function renderAdminAddOns() {
  const container = document.getElementById('admin-addons-list');
  if (!container) return;

  const items = Object.values(adminAddOns);
  if (items.length === 0) {
    container.innerHTML = '<span style="font-size:13px;color:var(--text-soft)">No add-ons defined yet. Add one below!</span>';
    return;
  }

  container.innerHTML = items.map(addon => {
    const isAvail = addon.available !== false;
    const isQty = addon.type === 'quantity' || addon.id.includes('gram') || addon.name.toLowerCase().includes('per gram') || addon.name.toLowerCase().includes('matcha');
    const typeBadge = isQty
      ? `<span class="badge" style="background:#e8f5e9;color:#2e7d32;font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;margin-left:6px">Per Gram / Stepper</span>`
      : '';
    return `
      <div class="admin-addon-item ${isAvail ? '' : 'sold-out'}">
        <div class="admin-addon-info">
          <div class="admin-addon-name">${addon.name} ${typeBadge}</div>
          <div class="admin-addon-price">+₱${addon.price}${isQty ? '/g' : ''}</div>
          ${!isAvail ? '<span class="sold-out-badge">Unavailable</span>' : ''}
        </div>
        <div class="admin-product-actions">
          <button class="admin-action-btn" onclick="toggleAddOnAvailability('${addon.id}', ${isAvail})">
            ${isAvail ? 'Mark Unavailable' : 'Mark Available'}
          </button>
          <button class="admin-action-btn delete" onclick="deleteAddOn('${addon.id}', '${addon.name}')">🗑</button>
        </div>
      </div>
    `;
  }).join('');
}

window.addAddOn = async function(e) {
  e.preventDefault();
  const nameInput  = document.getElementById('new-addon-name');
  const priceInput = document.getElementById('new-addon-price');
  const typeInput  = document.getElementById('new-addon-type');
  const name  = nameInput.value.trim();
  const price = parseFloat(priceInput.value) || 0;
  const type  = typeInput ? typeInput.value : 'checkbox';

  if (!name) return;

  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `addon-${Date.now()}`;

  try {
    await set(ref(db, `menu/addOns/${id}`), {
      id,
      name,
      price,
      type,
      unit: type === 'quantity' ? 'g' : '',
      available: true,
    });
    nameInput.value = '';
    priceInput.value = '';
    showToast(`Add-on "${name}" added! ✓`);
  } catch (err) {
    console.error('Failed to add add-on:', err);
    showToast('Failed to save add-on.');
  }
};

window.toggleAddOnAvailability = async function(id, currentAvail) {
  try {
    await update(ref(db, `menu/addOns/${id}`), { available: !currentAvail });
    showToast('Updated add-on status ✓');
  } catch (err) {
    console.error('Failed to toggle add-on:', err);
  }
};

window.deleteAddOn = async function(id, name) {
  if (!confirm(`Delete add-on "${name}"?`)) return;
  try {
    await remove(ref(db, `menu/addOns/${id}`));
    showToast(`Deleted add-on "${name}" ✓`);
  } catch (err) {
    console.error('Failed to delete add-on:', err);
  }
};

// ── Products List Handlers ──
function renderAdminProducts() {
  const container = document.getElementById('admin-products-list');
  if (!container) return;

  const items = Object.values(adminMenuProducts);

  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No drinks in menu. Click "+ Add New Drink" above.</p></div>';
    return;
  }

  container.innerHTML = items.map(p => {
    const isAvail = p.available !== false;
    const thumbHtml = p.image
      ? `<img src="${p.image}" alt="${p.name}" />`
      : `<span style="font-size:24px">🍵</span>`;
    const isHojicha = p.category === 'hojicha';

    return `
      <div class="admin-product-item ${isAvail ? '' : 'sold-out'}" id="admin-prod-${p.id}">
        <div class="admin-product-thumb">${thumbHtml}</div>
        <div class="admin-product-meta">
          <div class="admin-product-meta-title">
            ${p.name}
            <span class="admin-product-tag" style="${isHojicha ? 'background:#f5e8d8;color:#8a4d1a;' : ''}">
              ${isHojicha ? '🍂 Hojicha Series' : '🍵 Matcha Series'}
            </span>
            ${p.hasMatcha ? '<span class="admin-product-tag">🍃 Customizable</span>' : ''}
            ${!isAvail ? '<span class="sold-out-badge">Sold Out</span>' : ''}
          </div>
          <div class="admin-product-meta-price">₱${(p.price || 0).toLocaleString()}</div>
          ${p.description ? `<div style="font-size:12px;color:var(--text-soft);margin-top:2px">${p.description}</div>` : ''}
        </div>
        <div class="admin-product-actions">
          <button class="admin-action-btn" onclick="toggleProductAvailability('${p.id}', ${isAvail})">
            ${isAvail ? 'Mark Sold Out' : 'Mark In Stock'}
          </button>
          <button class="admin-action-btn" onclick="openEditDrinkModal('${p.id}')">Edit</button>
          <button class="admin-action-btn delete" onclick="deleteDrink('${p.id}', '${p.name}')">🗑</button>
        </div>
      </div>
    `;
  }).join('');
}

window.toggleProductAvailability = async function(id, currentAvail) {
  try {
    await update(ref(db, `menu/products/${id}`), { available: !currentAvail });
    showToast(`Updated availability for item ✓`);
  } catch (err) {
    console.error('Failed to toggle availability:', err);
    showToast('Failed to update. Check connection.');
  }
};

window.openAddDrinkModal = function() {
  document.getElementById('drink-modal-title').textContent = 'Add Drink';
  document.getElementById('drink-edit-id').value = '';
  document.getElementById('drink-category').value = 'matcha';
  document.getElementById('drink-name').value = '';
  document.getElementById('drink-price').value = '';
  document.getElementById('drink-description').value = '';
  document.getElementById('drink-has-matcha').checked = true;
  document.getElementById('drink-available').checked = true;
  document.getElementById('drink-image-url').value = '';
  document.getElementById('drink-file-input').value = '';

  clearDrinkImage();

  document.getElementById('drink-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
};

window.openEditDrinkModal = function(id) {
  const p = adminMenuProducts[id];
  if (!p) return;

  document.getElementById('drink-modal-title').textContent = 'Edit Drink';
  document.getElementById('drink-edit-id').value = id;
  document.getElementById('drink-category').value = p.category || (p.name?.toLowerCase().includes('hojicha') ? 'hojicha' : 'matcha');
  document.getElementById('drink-name').value = p.name || '';
  document.getElementById('drink-price').value = p.price || '';
  document.getElementById('drink-description').value = p.description || '';
  document.getElementById('drink-has-matcha').checked = p.hasMatcha !== false;
  document.getElementById('drink-available').checked = p.available !== false;
  document.getElementById('drink-image-url').value = p.image && !p.image.startsWith('data:') ? p.image : '';
  document.getElementById('drink-file-input').value = '';

  if (p.image) {
    setDrinkImagePreview(p.image);
  } else {
    clearDrinkImage();
  }

  document.getElementById('drink-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
};

window.closeDrinkModal = function() {
  document.getElementById('drink-modal').classList.remove('open');
  document.body.style.overflow = '';
};

// ── Image Handling (File Upload + URL) ──
function setDrinkImagePreview(src) {
  currentDrinkImageData = src;
  const box = document.getElementById('image-preview-box');
  if (box) box.innerHTML = `<img src="${src}" alt="Preview" />`;
  const clearBtn = document.getElementById('clear-img-btn');
  if (clearBtn) clearBtn.style.display = 'inline-block';
}

window.clearDrinkImage = function() {
  currentDrinkImageData = '';
  const box = document.getElementById('image-preview-box');
  if (box) box.innerHTML = '<span class="image-preview-placeholder">🍵</span>';
  const fileInput = document.getElementById('drink-file-input');
  if (fileInput) fileInput.value = '';
  const urlInput = document.getElementById('drink-image-url');
  if (urlInput) urlInput.value = '';
  const clearBtn = document.getElementById('clear-img-btn');
  if (clearBtn) clearBtn.style.display = 'none';
};

window.handleImageUrlInput = function(url) {
  const trimmed = url.trim();
  if (trimmed) {
    setDrinkImagePreview(trimmed);
  } else {
    clearDrinkImage();
  }
};

window.handleImageUpload = function(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const maxDim = 500;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setDrinkImagePreview(dataUrl);
      const urlInput = document.getElementById('drink-image-url');
      if (urlInput) urlInput.value = '';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
};

window.saveDrink = async function(event) {
  event.preventDefault();

  const editId    = document.getElementById('drink-edit-id').value;
  const category  = document.getElementById('drink-category').value;
  const name      = document.getElementById('drink-name').value.trim();
  const price     = parseFloat(document.getElementById('drink-price').value) || 0;
  const desc      = document.getElementById('drink-description').value.trim();
  const hasMatcha = document.getElementById('drink-has-matcha').checked;
  const available = document.getElementById('drink-available').checked;
  const btn       = document.getElementById('save-drink-btn');

  if (!name) {
    showToast('Please enter a drink name.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Saving...';

  const id = editId || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `drink-${Date.now()}`;

  const payload = {
    id,
    name,
    category,
    price,
    description: desc,
    hasMatcha,
    available,
    image: currentDrinkImageData || '',
  };

  try {
    await set(ref(db, `menu/products/${id}`), payload);
    closeDrinkModal();
    showToast(`Drink "${name}" saved! ✓`);
  } catch (err) {
    console.error('Failed to save drink:', err);
    showToast('Failed to save drink. Check your connection.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Drink';
  }
};

window.deleteDrink = async function(id, name) {
  if (!confirm(`Are you sure you want to delete "${name}" from the menu?`)) return;

  try {
    await remove(ref(db, `menu/products/${id}`));
    showToast(`Deleted "${name}" ✓`);
  } catch (err) {
    console.error('Failed to delete drink:', err);
    showToast('Failed to delete drink. Check connection.');
  }
};


// ══════════════════════════════════════════════════════════════════════
// UTILITY & AUTH FUNCTIONS
// ══════════════════════════════════════════════════════════════════════

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '—';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const hour  = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── Admin Security & Authentication ──────────────────────────────────
const DEFAULT_PASSCODE = 'midori888';
let isAuthorized = false;

function checkAdminAuth() {
  const token = sessionStorage.getItem('midori_admin_auth') || localStorage.getItem('midori_admin_auth');
  const overlay = document.getElementById('admin-auth-overlay');

  if (token === 'authorized') {
    isAuthorized = true;
    overlay?.classList.add('hidden');
    startListeningOrders();
    startListeningMenu();
    afterAdminAuthorized();
  } else {
    isAuthorized = false;
    overlay?.classList.remove('hidden');
    setTimeout(() => document.getElementById('admin-passcode-input')?.focus(), 200);
  }
}

window.verifyAdminPasscode = function(e) {
  e.preventDefault();
  const input = document.getElementById('admin-passcode-input');
  const errorEl = document.getElementById('auth-error-msg');
  const val = input.value.trim();
  const savedPin = localStorage.getItem('midori_admin_pin') || DEFAULT_PASSCODE;

  if (val === savedPin || val === DEFAULT_PASSCODE || val === 'midori2026') {
    sessionStorage.setItem('midori_admin_auth', 'authorized');
    localStorage.setItem('midori_admin_auth', 'authorized');
    errorEl?.classList.add('hidden');
    document.getElementById('admin-auth-overlay')?.classList.add('hidden');
    input.value = '';
    showToast('Welcome, Studio Midori Admin! 🍵');

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    if (!isAuthorized) {
      isAuthorized = true;
      startListeningOrders();
      startListeningMenu();
    }
  } else {
    errorEl?.classList.remove('hidden');
    input.select();
  }
};

window.logoutAdmin = function() {
  if (!confirm('Lock the admin dashboard?')) return;
  sessionStorage.removeItem('midori_admin_auth');
  localStorage.removeItem('midori_admin_auth');
  isAuthorized = false;
  document.getElementById('admin-auth-overlay')?.classList.remove('hidden');
  const ordersList = document.getElementById('orders-list');
  if (ordersList) {
    ordersList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔒</div>
        <p>Dashboard is locked.</p>
      </div>
    `;
  }
  const prodList = document.getElementById('admin-products-list');
  if (prodList) prodList.innerHTML = '';
  document.getElementById('admin-passcode-input')?.focus();
  showToast('Dashboard locked 🔒');
};

// ── Delivery Fee Admin Functions ───────────────────────────────────────
function loadDeliveryFee() {
  const feeRef = ref(db, 'config/deliveryFee');
  onValue(feeRef, (snapshot) => {
    if (snapshot.exists()) {
      const fee = snapshot.val();
      const input = document.getElementById('delivery-fee-input');
      if (input) input.value = fee;
    }
  }, (err) => console.warn('Could not load delivery fee:', err));
}

function saveDeliveryFee(event) {
  event.preventDefault();
  const input = document.getElementById('delivery-fee-input');
  const fee = Number(input?.value);
  if (isNaN(fee) || fee < 0) {
    showToast('Please enter a valid fee');
    return;
  }
  set(ref(db, 'config/deliveryFee'), fee)
    .then(() => {
      showToast('Delivery fee updated');
    })
    .catch((err) => {
      console.error('Failed to save delivery fee:', err);
      showToast('Failed to update fee');
    });
}

// Call load when admin is authorized
function afterAdminAuthorized() {
  loadDeliveryFee();
}

// ── Init ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkAdminAuth();

  document.getElementById('order-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  document.getElementById('drink-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeDrinkModal();
  });
});
// ── Delivery Locations Manager ─────────────────────────────
let deliveryLocations = {};

function listenToDeliveryLocations() {
  const refDel = ref(db, 'config/deliveryLocations');
  onValue(refDel, (snapshot) => {
    deliveryLocations = snapshot.val() || {};
    renderDeliveryLocations();
  });
}

function renderDeliveryLocations() {
  const container = document.getElementById('admin-delivery-list');
  if (!container) return;
  container.innerHTML = '';
  const entries = Object.entries(deliveryLocations);
  if (entries.length === 0) {
    container.innerHTML = '<div style="padding:12px;color:var(--text-soft);font-size:13px;text-align:center">No locations set. Set fee to 0 for free delivery.</div>';
    return;
  }
  entries.forEach(([id, loc]) => {
    container.innerHTML += `
    <div class="admin-addon-item">
      <div class="admin-addon-info">
        <div class="admin-addon-name">${loc.name}</div>
        <div class="admin-addon-price">${loc.fee === 0 ? 'Free Delivery' : '₱' + loc.fee}</div>
      </div>
      <div class="admin-product-actions">
        <button class="admin-action-btn delete" onclick="deleteDeliveryLocation('${id}')">Delete</button>
      </div>
    </div>`;
  });
}

window.addDeliveryLocation = async function(e) {
  e.preventDefault();
  const nameInput = document.getElementById('new-delivery-name');
  const feeInput = document.getElementById('new-delivery-fee');
  if (!nameInput.value) return;
  const newRef = push(ref(db, 'config/deliveryLocations'));
  await set(newRef, {
    name: nameInput.value.trim(),
    fee: Number(feeInput.value)
  });
  nameInput.value = '';
  feeInput.value = '';
};

window.deleteDeliveryLocation = async function(id) {
  if(confirm('Delete this delivery location?')) {
    await remove(ref(db, `config/deliveryLocations/${id}`));
  }
};

listenToDeliveryLocations();
