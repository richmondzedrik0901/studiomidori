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

const DEFAULT_INVENTORY = {
  'uji-matcha-ceremonial': {
    id: 'uji-matcha-ceremonial',
    name: 'Ceremonial Uji Matcha Powder',
    category: 'tea',
    qty: 500,
    unit: 'g',
    threshold: 150,
    lastUpdated: Date.now()
  },
  'classic-matcha-powder': {
    id: 'classic-matcha-powder',
    name: 'Classic Barista Matcha Powder',
    category: 'tea',
    qty: 750,
    unit: 'g',
    threshold: 200,
    lastUpdated: Date.now()
  },
  'roasted-hojicha-powder': {
    id: 'roasted-hojicha-powder',
    name: 'Roasted Hojicha Powder',
    category: 'tea',
    qty: 450,
    unit: 'g',
    threshold: 120,
    lastUpdated: Date.now()
  },
  'barista-oat-milk': {
    id: 'barista-oat-milk',
    name: 'Barista Oat Milk',
    category: 'dairy',
    qty: 12,
    unit: 'cartons',
    threshold: 4,
    lastUpdated: Date.now()
  },
  'whole-fresh-milk': {
    id: 'whole-fresh-milk',
    name: 'Fresh Dairy Milk',
    category: 'dairy',
    qty: 16,
    unit: 'cartons',
    threshold: 5,
    lastUpdated: Date.now()
  },
  'strawberry-puree': {
    id: 'strawberry-puree',
    name: 'Real Strawberry Purée',
    category: 'syrups',
    qty: 1200,
    unit: 'ml',
    threshold: 350,
    lastUpdated: Date.now()
  },
  'brown-sugar-boba': {
    id: 'brown-sugar-boba',
    name: 'Brown Sugar Tapioca Pearls',
    category: 'toppings',
    qty: 800,
    unit: 'g',
    threshold: 250,
    lastUpdated: Date.now()
  },
  'cups-16oz-lids': {
    id: 'cups-16oz-lids',
    name: '16oz Cold Cups & Dome Lids',
    category: 'packaging',
    qty: 140,
    unit: 'pcs',
    threshold: 40,
    lastUpdated: Date.now()
  },
  'bamboo-paper-straws': {
    id: 'bamboo-paper-straws',
    name: 'Eco Paper Straws',
    category: 'packaging',
    qty: 180,
    unit: 'pcs',
    threshold: 50,
    lastUpdated: Date.now()
  }
};

// ── State ─────────────────────────────────────────────────────────────
let currentTab              = 'ALL';
let currentFirebaseKey      = null;  // Firebase key of the open order
let allOrders               = [];    // [{ _key, ...orderData }] cached locally
let adminMenuProducts       = {};    // { [id]: productData }
let adminMatchaChoices      = [];    // ['Classic', ...]
let adminAddOns             = {};    // { [id]: addOnData }
let adminBlackoutDates      = [];    // ['YYYY-MM-DD', ...]
let currentDrinkImageData   = '';    // Base64 or URL for modal preview
let adminVouchers           = {};    // { [code]: voucherData }
let livePresence            = {};    // { [sessionId]: presenceData }
let dailyVisitors           = {};    // { [dateStr]: { [visitorId]: visitorData } }
let adminInventory          = {};    // { [id]: inventoryItemData }
let activeInventoryFilter   = 'all';
let activeAnalyticsPreset   = 'today';

// -- Navigation Section Switcher -------------------------------------------
window.switchAdminSection = function(section) {
  ['orders', 'menu', 'store', 'inventory', 'reports'].forEach(id => {
    const btn = document.getElementById('nav-btn-' + id);
    const sec = document.getElementById(id + '-section');
    if (btn) btn.classList.remove('active');
    if (sec) sec.classList.add('hidden');
  });

  const activeBtn = document.getElementById('nav-btn-' + section);
  const activeSec = document.getElementById(section + '-section');
  if (activeBtn) activeBtn.classList.add('active');
  if (activeSec) activeSec.classList.remove('hidden');

  if (section === 'reports' && window.generateReports) window.generateReports();
  if (section === 'inventory' && window.renderInventory) window.renderInventory();

  sessionStorage.setItem('midori_admin_section', section);
};

window.switchMenuTab = function(tab) {
  const panels = { drinks: 'menu-panel-drinks', custom: 'menu-panel-custom' };
  const tabs   = { drinks: 'sub-tab-drinks',   custom: 'sub-tab-custom'   };

  Object.keys(panels).forEach(key => {
    const panel = document.getElementById(panels[key]);
    const btn   = document.getElementById(tabs[key]);
    if (panel) panel.style.display = key === tab ? '' : 'none';
    if (btn) {
      if (key === tab) {
        btn.style.color = 'var(--green-700)';
        btn.style.fontWeight = '800';
        btn.style.borderBottomColor = 'var(--green-600)';
      } else {
        btn.style.color = 'var(--text-soft)';
        btn.style.fontWeight = '700';
        btn.style.borderBottomColor = 'transparent';
      }
    }
  });
};

// Restore last active section on reload
(function restoreAdminSection() {
  const saved = sessionStorage.getItem('midori_admin_section');
  if (saved && saved !== 'orders') {
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

      // Refresh reports if that section is currently visible
      const reportsSec = document.getElementById('reports-section');
      if (reportsSec && !reportsSec.classList.contains('hidden') && window.generateReports) {
        window.generateReports();
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

  // Group by date
  const groups = {};
  filtered.forEach(o => {
    // prioritize user selected order date, fallback to timestamp
    const d = o.orderDate || new Date(o.timestamp || Date.now()).toISOString().split('T')[0];
    if (!groups[d]) groups[d] = [];
    groups[d].push(o);
  });

  // Sort dates descending
  const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  let html = '';
  sortedDates.forEach(dateStr => {
    // parse without timezone shift
    const [y, m, d] = dateStr.split('-');
    const dateObj = new Date(y, m - 1, d);
    
    // Check if it's today
    const isToday = dateStr === new Date().toISOString().split('T')[0];
    let headerTitle = dateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
    if (isToday) headerTitle = `Today (${headerTitle})`;
    
    html += `<div class="order-date-group-header">
               <span style="font-size:18px">📅</span> <span>${headerTitle}</span>
             </div>`;
    
    html += groups[dateStr].map(order => {
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
            <div class="order-total-line">
              ₱${(order.total || 0).toLocaleString()}
              ${(order.discountAmount && order.discountAmount > 0) ? `<span style="font-size:11px;background:#dcfce7;color:#166534;padding:2px 7px;border-radius:4px;font-weight:800;margin-left:8px;border:1px solid #bbf7d0;">🎟️ ${order.voucherCode || 'Voucher'} (-₱${order.discountAmount.toLocaleString()})</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  });

  container.innerHTML = html;
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

let adminChatUnsubscribe = null;

window.closeModal = function() {
  document.getElementById('order-modal').classList.remove('open');
  document.body.style.overflow = '';
  currentFirebaseKey = null;
  if (adminMiniMap) {
    adminMiniMap.remove();
    adminMiniMap = null;
  }
  if (adminChatUnsubscribe) {
    adminChatUnsubscribe();
    adminChatUnsubscribe = null;
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
    if (i.size) sub.push(i.size);
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
      <span class="modal-info-label">Payment</span>
      <span class="modal-info-value" style="font-weight:700; color: ${order.paymentMethod === 'GCash' ? 'var(--green-700)' : 'inherit'}">
        ${order.paymentMethod === 'GCash' ? '📱 GCash' : '💵 Cash / COD'}
      </span>
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
      <span class="modal-info-label">${order.deliveryType === 'delivery' ? 'Delivery Time' : 'Pick-up Time'}</span>
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
      ${(order.discountAmount && order.discountAmount > 0) ? `
      <div class="modal-total-row" style="color:#15803d; font-weight:700;">
        <span>Voucher Discount (${order.voucherCode || 'Voucher'})</span>
        <span>-₱${order.discountAmount.toLocaleString()}</span>
      </div>` : ''}
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

    <div class="modal-section-title" style="margin-top:24px">Chat with Customer</div>
    <div class="order-chat-card">
      <div class="chat-body" id="admin-chat-body">
        <div class="chat-messages" id="admin-chat-messages" style="height:200px">
          <div class="chat-msg admin-msg">Loading chat...</div>
        </div>
        <div class="chat-input-row">
          <input type="text" id="admin-chat-input" placeholder="Type a message..." autocomplete="off" onkeypress="if(event.key === 'Enter') sendAdminMessage('${order._key}')">
          <button type="button" onclick="sendAdminMessage('${order._key}')">Send</button>
        </div>
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

  // Init chat
  initAdminChat(order._key);
}

function initAdminChat(orderKey) {
  const messagesContainer = document.getElementById('admin-chat-messages');
  if (!messagesContainer) return;

  if (adminChatUnsubscribe) {
    adminChatUnsubscribe();
  }

  const chatRef = ref(db, `chats/${orderKey}`);
  adminChatUnsubscribe = onValue(chatRef, (snapshot) => {
    messagesContainer.innerHTML = '';
    
    if (snapshot.exists()) {
      const messages = snapshot.val();
      Object.keys(messages).forEach(key => {
        const msg = messages[key];
        const div = document.createElement('div');
        div.className = `chat-msg ${msg.sender === 'admin' ? 'customer-msg' : 'admin-msg'}`; 
        // We reuse the customer-msg class for the "self" styled bubble.
        // On admin side, admin is green (customer-msg style), customer is grey (admin-msg style).
        div.textContent = msg.text;
        messagesContainer.appendChild(div);
      });
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } else {
      messagesContainer.innerHTML = `<div class="chat-msg admin-msg" style="text-align:center; width:100%">No messages yet.</div>`;
    }
  });
}

window.sendAdminMessage = function(orderKey) {
  const inputEl = document.getElementById('admin-chat-input');
  const text = inputEl.value.trim();
  if (!text) return;
  
  inputEl.disabled = true;
  push(ref(db, `chats/${orderKey}`), {
    sender: 'admin',
    text: text,
    timestamp: Date.now(),
    read: false
  }).then(() => {
    inputEl.value = '';
  }).catch(err => {
    console.error(err);
    showToast('Failed to send message.');
  }).finally(() => {
    inputEl.disabled = false;
    inputEl.focus();
  });
};

window.changeStatus = async function(newStatus) {
  if (!currentFirebaseKey) return;

  try {
    await update(ref(db, `orders/${currentFirebaseKey}`), { status: newStatus });
    showToast(`Status updated to ${newStatus} ✓`);

    const order = allOrders.find(o => o._key === currentFirebaseKey);
    const isDelivery = order && order.deliveryType === 'delivery';

    let autoMessage = '';
    if (newStatus === 'PREPARING') {
      autoMessage = 'We have started preparing your order! 👩‍🍳 Est. (25-30mins)';
    } else if (newStatus === 'READY') {
      autoMessage = isDelivery ? 'Your order is on the way! 🛵' : 'Your order is ready for pickup! ✅';
    } else if (newStatus === 'COMPLETED') {
      autoMessage = 'Order completed! Thanks for ordering from Studio Midori! 💚';
    }

    if (autoMessage) {
      push(ref(db, `chats/${currentFirebaseKey}`), {
        sender: 'admin',
        text: autoMessage,
        timestamp: Date.now(),
        read: false,
        isAuto: true
      }).catch(err => console.error('Failed to send auto message:', err));
    }
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

  // 4. Listen for Settings
  const settingsRef = ref(db, 'menu/settings');
  onValue(settingsRef, (snapshot) => {
    const settings = snapshot.exists() ? snapshot.val() : {};
    const forceOrderNow = document.getElementById('admin-force-order-now');
    if (forceOrderNow) {
      forceOrderNow.checked = !!settings.forceOrderNow;
    }
    const allowAdvanceDelivery = document.getElementById('admin-allow-advance-delivery');
    if (allowAdvanceDelivery) {
      allowAdvanceDelivery.checked = !!settings.allowAdvanceDelivery;
    }
    adminBlackoutDates = settings.blackoutDates || [];
    window.adminBlackoutDates = adminBlackoutDates;
    if (window.renderBlackoutDates) window.renderBlackoutDates();

    const limitDelivery = document.getElementById('admin-limit-delivery-area');
    const limitSettings = document.getElementById('admin-delivery-limit-settings');
    const maxKmSlider = document.getElementById('admin-delivery-max-km');
    const maxKmDisplay = document.getElementById('admin-delivery-max-km-display');
    if (limitDelivery && limitSettings && maxKmSlider && maxKmDisplay) {
      limitDelivery.checked = !!settings.limitDeliveryArea;
      limitSettings.style.display = settings.limitDeliveryArea ? 'block' : 'none';
      const maxKm = settings.deliveryMaxKm || 5;
      maxKmSlider.value = maxKm;
      maxKmDisplay.textContent = maxKm + ' km';
    }
  });

  // 5. Listen for Vouchers
  const vouchersRef = ref(db, 'vouchers');
  onValue(vouchersRef, (snapshot) => {
    adminVouchers = snapshot.exists() ? snapshot.val() : {};
    if (window.renderAdminVouchers) window.renderAdminVouchers();
  });

  // 6. Listen for Live Presence & Active Website Users
  const presenceRef = ref(db, 'presence');
  onValue(presenceRef, (snapshot) => {
    livePresence = snapshot.exists() ? snapshot.val() : {};
    renderLivePresence();
  });

  // 7. Listen for Daily Visitors
  const visitorsRef = ref(db, 'analytics/dailyVisitors');
  onValue(visitorsRef, (snapshot) => {
    dailyVisitors = snapshot.exists() ? snapshot.val() : {};
    if (window.generateReports) window.generateReports();
  });

  // 8. Listen for Inventory
  const inventoryRef = ref(db, 'inventory');
  onValue(inventoryRef, (snapshot) => {
    if (snapshot.exists()) {
      adminInventory = snapshot.val();
    } else {
      adminInventory = DEFAULT_INVENTORY;
      set(inventoryRef, DEFAULT_INVENTORY).catch(err => console.warn('Could not seed inventory:', err));
    }
    if (window.renderInventory) window.renderInventory();
  });
}

// ── Settings Handlers ──
window.toggleForceOrderNow = async function(e) {
  try {
    await update(ref(db, 'menu/settings'), { forceOrderNow: e.target.checked });
    showToast('Updated store settings ✓');
  } catch (err) {
    console.error('Failed to update settings:', err);
    showToast('Failed to update settings.');
  }
};

window.toggleAllowAdvanceDelivery = async function(e) {
  try {
    await update(ref(db, 'menu/settings'), { allowAdvanceDelivery: e.target.checked });
    showToast('Updated store settings ✓');
  } catch (err) {
    console.error('Failed to update settings:', err);
    showToast('Failed to update settings.');
  }
};

window.toggleDeliveryLimit = async function(e) {
  const isEnabled = e.target.checked;
  const limitSettings = document.getElementById('admin-delivery-limit-settings');
  if (limitSettings) {
    limitSettings.style.display = isEnabled ? 'block' : 'none';
  }
  try {
    await update(ref(db, 'menu/settings'), { limitDeliveryArea: isEnabled });
    showToast('Updated delivery limit setting ✓');
  } catch (err) {
    console.error('Failed to update setting:', err);
    showToast('Failed to update setting.');
  }
};

window.updateDeliveryMaxKmDisplay = function(val) {
  const maxKmDisplay = document.getElementById('admin-delivery-max-km-display');
  if (maxKmDisplay) {
    maxKmDisplay.textContent = val + ' km';
  }
};

window.saveDeliveryMaxKm = async function(val) {
  try {
    await update(ref(db, 'menu/settings'), { deliveryMaxKm: parseFloat(val) });
    showToast('Updated maximum delivery distance ✓');
  } catch (err) {
    console.error('Failed to update distance:', err);
    showToast('Failed to update setting.');
  }
};

window.renderBlackoutDates = function() {
  const container = document.getElementById('blackout-dates-list');
  if (!container) return;

  if (!adminBlackoutDates || adminBlackoutDates.length === 0) {
    container.innerHTML = '<span style="font-size:13px;color:var(--text-soft)">No blackout dates set.</span>';
    return;
  }

  const sorted = [...adminBlackoutDates].sort();
  container.innerHTML = sorted.map((dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    const display = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    return `<div class="matcha-chip" style="background:#fef3e2;border-color:#f5c98a;color:#8a4d1a;"><span>&#128197; ${display}</span><button class="matcha-chip-del" onclick="removeBlackoutDate('${dateStr}')" style="color:#8a4d1a;" title="Remove">&times;</button></div>`;
  }).join('');
};

window.addBlackoutDate = async function() {
  const input = document.getElementById('new-blackout-date');
  const val = input.value;
  if (!val) return;

  if (adminBlackoutDates.includes(val)) {
    showToast('Date is already blacked out.');
    return;
  }

  const updated = [...adminBlackoutDates, val];
  try {
    await update(ref(db, 'menu/settings'), { blackoutDates: updated });
    input.value = '';
    showToast('Added ' + val + ' to blackout dates! ✓');
  } catch (err) {
    console.error('Failed to add blackout date:', err);
    showToast('Failed to save. Check connection.');
  }
};

window.removeBlackoutDate = async function(dateStr) {
  if (!confirm('Remove ' + dateStr + ' from blackout dates?')) return;

  const updated = adminBlackoutDates.filter(function(d) { return d !== dateStr; });
  try {
    await update(ref(db, 'menu/settings'), { blackoutDates: updated });
    showToast('Removed ' + dateStr + ' ✓');
  } catch (err) {
    console.error('Failed to remove blackout date:', err);
    showToast('Failed to remove. Check connection.');
  }
};

// ── Vouchers & Promo Codes Management Module ──
let editingVoucherCode = null;

function getAllAdminVouchers() {
  const result = {};
  if (adminVouchers && typeof adminVouchers === 'object') {
    Object.entries(adminVouchers).forEach(([k, v]) => {
      if (v && v.code && !v.deleted) {
        const usedByObj = v.usedBy || {};
        const usedDevicesObj = v.usedDevices || {};
        const count = typeof v.redemptionCount === 'number'
          ? v.redemptionCount
          : (Object.keys(usedDevicesObj).length || Object.keys(usedByObj).filter(id => !id.startsWith('dev_')).length);

        result[v.code.toUpperCase()] = {
          code: v.code.toUpperCase(),
          type: v.type || 'fixed',
          value: parseFloat(v.value) || 0,
          minSpend: parseFloat(v.minSpend) || 0,
          description: v.description || '',
          validDays: v.validDays ? parseInt(v.validDays) : null,
          validUntil: v.validUntil || null,
          createdAt: v.createdAt || null,
          active: v.active !== false,
          limitPerCustomer: v.limitPerCustomer !== false,
          strictMobileLimit: !!v.strictMobileLimit,
          usedBy: usedByObj,
          usedDevices: usedDevicesObj,
          usedMobiles: v.usedMobiles || {},
          redemptionCount: count
        };
      }
    });
  }
  return result;
}

window.renderAdminVouchers = function() {
  const container = document.getElementById('admin-vouchers-list');
  if (!container) return;

  const allV = getAllAdminVouchers();
  const list = Object.values(allV);

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No vouchers created yet. Click "+ Add New Voucher" above to add one.</p>
      </div>
    `;
    return;
  }

  const now = new Date();

  container.innerHTML = list.map(v => {
    let typeLabel = '';
    if (v.type === 'percent') typeLabel = `${v.value}% OFF`;
    else if (v.type === 'fixed') typeLabel = `₱${v.value} OFF`;
    else if (v.type === 'delivery') typeLabel = 'FREE DELIVERY';

    const minSpendLabel = v.minSpend > 0 ? `Min. spend: ₱${v.minSpend.toLocaleString()}` : 'No min. spend';
    
    let validityHtml = '<span style="color:var(--text-soft)">📅 Never expires</span>';
    let isExpired = false;

    if (v.validUntil) {
      const expiry = new Date(v.validUntil + 'T23:59:59');
      const d = new Date(v.validUntil + 'T00:00:00');
      const dateText = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      if (now > expiry) {
        isExpired = true;
        validityHtml = `<span style="color:#b91c1c; font-weight:700;">⌛ Expired on ${dateText}</span>`;
      } else {
        const msLeft = expiry - now;
        const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
        validityHtml = `<span style="color:#047857; font-weight:700;">⏳ Valid until ${dateText} (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)</span>`;
      }
    }

    const isActive = v.active !== false && !isExpired;
    const isPaused = v.active === false && !isExpired;

    let badgeStyle = '';
    let badgeText = 'Active';
    if (isExpired) {
      badgeStyle = 'background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;';
      badgeText = 'Expired';
    } else if (isPaused) {
      badgeStyle = 'background:#f3f4f6;color:#6b7280;border:1px solid #d1d5db;';
      badgeText = 'Paused';
    } else {
      badgeStyle = 'background:#dcfce7;color:#166534;border:1px solid #86efac;';
      badgeText = 'Active';
    }

    const usedCount = v.redemptionCount || 0;
    const limitPill = v.limitPerCustomer !== false
      ? `<span class="admin-voucher-limit-pill" title="Limited to 1 redemption per customer mobile/device">🛡️ 1 use/customer (${usedCount} redeemed)</span>`
      : `<span class="admin-voucher-limit-pill unlimited" title="Unlimited redemptions per customer">♾️ Unlimited uses (${usedCount} redeemed)</span>`;

    return `
      <div class="admin-voucher-card ${isActive ? '' : 'inactive'}" id="admin-voucher-${v.code}">
        <div class="admin-voucher-left">
          <div class="admin-voucher-code-badge">🎟️ ${v.code}</div>
          <div class="admin-voucher-details">
            <div class="admin-voucher-title">${typeLabel} — ${v.description || 'Custom Promotion'}</div>
            <div class="admin-voucher-sub">
              <span>${minSpendLabel}</span>
              &middot; <span>${validityHtml}</span>
              &middot; ${limitPill}
            </div>
          </div>
        </div>
        <div class="admin-voucher-actions">
          <span class="admin-voucher-status-badge" style="${badgeStyle}">
            ${badgeText}
          </span>
          ${usedCount > 0 ? `
          <button type="button" class="admin-voucher-toggle-btn" onclick="resetVoucherUsage('${v.code}')" title="Reset redemptions so customers can reuse this voucher">
            🔄 Reset
          </button>
          ` : ''}
          <button type="button" class="admin-voucher-toggle-btn" onclick="openEditVoucherModal('${v.code}')" title="Edit voucher details">
            ✏️ Edit
          </button>
          <button type="button" class="admin-voucher-toggle-btn" onclick="toggleVoucherActive('${v.code}', ${v.active !== false})">
            ${v.active !== false ? '⏸ Pause' : '▶ Activate'}
          </button>
          <button type="button" class="admin-voucher-del-btn" onclick="deleteVoucher('${v.code}')" title="Delete voucher">
            🗑️
          </button>
        </div>
      </div>
    `;
  }).join('');
};

window.generateRandomVoucherCode = function() {
  const codeInput = document.getElementById('voucher-code-input');
  if (!codeInput) return;
  const prefixes = ['MIDORI', 'MATCHA', 'SPECIAL', 'SAVE', 'VIP', 'WELCOME', 'DEAL'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const discounts = [10, 15, 20, 25, 50];
  const val = discounts[Math.floor(Math.random() * discounts.length)];
  codeInput.value = `${prefix}${val}`;
  codeInput.dispatchEvent(new Event('input', { bubbles: true }));
  codeInput.focus();
};

window.toggleStrictMobileCard = function(show) {
  const card = document.getElementById('voucher-strict-mobile-card');
  if (card) card.style.display = show ? 'flex' : 'none';
};

window.openAddVoucherModal = function() {
  editingVoucherCode = null;
  const form = document.getElementById('voucher-form');
  if (form) form.reset();

  const title = document.getElementById('voucher-modal-title');
  if (title) title.textContent = 'Add New Voucher';

  const saveBtn = document.getElementById('save-voucher-btn');
  if (saveBtn) {
    saveBtn.textContent = 'Save Voucher';
    saveBtn.disabled = false;
  }

  const preview = document.getElementById('voucher-validity-preview');
  if (preview) {
    preview.innerHTML = '📅 Voucher will never expire (no time limit)';
    preview.className = 'voucher-validity-banner';
    preview.style.color = '';
  }

  const dateInput = document.getElementById('voucher-expiry-date');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;
  }

  const limitInput = document.getElementById('voucher-limit-per-customer');
  if (limitInput) limitInput.checked = true;

  const strictInput = document.getElementById('voucher-strict-mobile-limit');
  if (strictInput) strictInput.checked = false;
  window.toggleStrictMobileCard(true);

  // Set default chip to Never Expires
  document.querySelectorAll('.validity-chip').forEach(btn => {
    const d = parseInt(btn.getAttribute('data-days'));
    btn.classList.toggle('active', d === 0);
  });

  const modal = document.getElementById('voucher-modal');
  if (modal) {
    modal.classList.add('open');
    modal.classList.add('active');
  }
  window.updateVoucherTypeUI();
};

window.openEditVoucherModal = function(code) {
  const all = getAllAdminVouchers();
  const v = all[code] || (adminVouchers && adminVouchers[code]);
  if (!v) {
    showToast(`Voucher "${code}" not found.`);
    return;
  }

  editingVoucherCode = code;

  const form = document.getElementById('voucher-form');
  if (form) form.reset();

  const title = document.getElementById('voucher-modal-title');
  if (title) title.textContent = `Edit Voucher: ${code}`;

  const saveBtn = document.getElementById('save-voucher-btn');
  if (saveBtn) {
    saveBtn.textContent = 'Update Voucher';
    saveBtn.disabled = false;
  }

  const codeInput = document.getElementById('voucher-code-input');
  if (codeInput) codeInput.value = v.code;

  const typeInput = document.getElementById('voucher-type-input');
  if (typeInput) typeInput.value = v.type || 'fixed';

  const valueInput = document.getElementById('voucher-value-input');
  if (valueInput) valueInput.value = v.value || 0;

  const minSpendInput = document.getElementById('voucher-min-spend-input');
  if (minSpendInput) minSpendInput.value = v.minSpend || 0;

  const descInput = document.getElementById('voucher-desc-input');
  if (descInput) descInput.value = v.description || '';

  const activeInput = document.getElementById('voucher-active-input');
  if (activeInput) activeInput.checked = v.active !== false;

  const limitInput = document.getElementById('voucher-limit-per-customer');
  if (limitInput) limitInput.checked = v.limitPerCustomer !== false;

  const strictInput = document.getElementById('voucher-strict-mobile-limit');
  if (strictInput) strictInput.checked = !!v.strictMobileLimit;
  window.toggleStrictMobileCard(v.limitPerCustomer !== false);

  const dateInput = document.getElementById('voucher-expiry-date');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;
  }

  if (v.validUntil) {
    if (dateInput) dateInput.value = v.validUntil;
    window.onExpiryDateChange();
  } else if (v.validDays && v.validDays > 0) {
    window.setQuickValidity(v.validDays);
  } else {
    window.setQuickValidity(0);
  }

  window.updateVoucherTypeUI();

  const modal = document.getElementById('voucher-modal');
  if (modal) {
    modal.classList.add('open');
    modal.classList.add('active');
  }
};

window.closeVoucherModal = function() {
  editingVoucherCode = null;
  const modal = document.getElementById('voucher-modal');
  if (modal) {
    modal.classList.remove('open');
    modal.classList.remove('active');
  }
};

window.setQuickValidity = function(days) {
  const daysInput = document.getElementById('voucher-validity-days');
  if (daysInput) {
    daysInput.value = days > 0 ? days : '';
  }
  document.querySelectorAll('.validity-chip').forEach(btn => {
    const d = parseInt(btn.getAttribute('data-days'));
    btn.classList.toggle('active', d === days);
  });
  window.updateValidityPreview();
};

window.updateValidityPreview = function() {
  const daysInput = document.getElementById('voucher-validity-days');
  const dateInput = document.getElementById('voucher-expiry-date');
  const preview = document.getElementById('voucher-validity-preview');
  if (!preview) return;

  const days = parseInt(daysInput?.value);

  // Sync active chip
  document.querySelectorAll('.validity-chip').forEach(btn => {
    const d = parseInt(btn.getAttribute('data-days'));
    if (!days && d === 0) {
      btn.classList.add('active');
    } else {
      btn.classList.toggle('active', d === days);
    }
  });

  if (days && days > 0) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    if (dateInput) dateInput.value = dateStr;
    const dateFormatted = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    preview.innerHTML = `✓ Voucher will be valid for <strong>${days} days</strong> (Expires: ${dateFormatted})`;
    preview.className = 'voucher-validity-banner has-date';
    preview.style.color = '#166534';
  } else {
    if (dateInput) dateInput.value = '';
    preview.innerHTML = '📅 Voucher will never expire (no time limit)';
    preview.className = 'voucher-validity-banner';
    preview.style.color = 'var(--text-soft)';
  }
};

window.onExpiryDateChange = function() {
  const daysInput = document.getElementById('voucher-validity-days');
  const dateInput = document.getElementById('voucher-expiry-date');
  const preview = document.getElementById('voucher-validity-preview');
  if (!dateInput || !preview) return;

  if (dateInput.value) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = dateInput.value.split('-').map(Number);
    const chosen = new Date(y, m - 1, d);
    const diffTime = chosen - today;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) {
      preview.innerHTML = '⚠️ Warning: Selected date is today or in the past!';
      preview.className = 'voucher-validity-banner';
      preview.style.color = '#dc2626';
      if (daysInput) daysInput.value = '0';
    } else {
      if (daysInput) daysInput.value = diffDays;
      const dateFormatted = chosen.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      preview.innerHTML = `✓ Voucher will be valid for <strong>${diffDays} days</strong> (Expires: ${dateFormatted})`;
      preview.className = 'voucher-validity-banner has-date';
      preview.style.color = '#166534';
    }
  } else {
    if (daysInput) daysInput.value = '';
    preview.innerHTML = '📅 Voucher will never expire (no time limit)';
    preview.className = 'voucher-validity-banner';
    preview.style.color = 'var(--text-soft)';
  }

  // Update chip active state
  const currentDays = parseInt(daysInput?.value) || 0;
  document.querySelectorAll('.validity-chip').forEach(btn => {
    const d = parseInt(btn.getAttribute('data-days'));
    btn.classList.toggle('active', d === currentDays);
  });
};

window.updateVoucherTypeUI = function() {
  const typeSelect = document.getElementById('voucher-type-input');
  const valueLabel = document.getElementById('voucher-value-label');
  const valueInput = document.getElementById('voucher-value-input');
  const valueGroup = document.getElementById('voucher-value-group');
  const unitBadge = document.getElementById('voucher-value-unit');
  if (!typeSelect || !valueLabel || !valueInput) return;

  if (typeSelect.value === 'percent') {
    valueGroup.style.display = '';
    valueLabel.innerHTML = 'Discount Value (%) <span class="required">*</span>';
    valueInput.placeholder = 'e.g. 10 for 10%';
    valueInput.min = '1';
    valueInput.max = '100';
    if (unitBadge) unitBadge.textContent = '%';
  } else if (typeSelect.value === 'fixed') {
    valueGroup.style.display = '';
    valueLabel.innerHTML = 'Discount Value (₱) <span class="required">*</span>';
    valueInput.placeholder = 'e.g. 50 for ₱50';
    valueInput.min = '1';
    valueInput.removeAttribute('max');
    if (unitBadge) unitBadge.textContent = '₱';
  } else if (typeSelect.value === 'delivery') {
    valueGroup.style.display = '';
    valueLabel.innerHTML = 'Delivery Discount (%) <span class="required">*</span>';
    valueInput.placeholder = '100 for 100% Free Delivery';
    valueInput.value = '100';
    valueInput.min = '1';
    valueInput.max = '100';
    if (unitBadge) unitBadge.textContent = '%';
  }
};

window.saveVoucher = async function(e) {
  if (e && e.preventDefault) e.preventDefault();
  const codeInput = document.getElementById('voucher-code-input');
  const typeInput = document.getElementById('voucher-type-input');
  const valueInput = document.getElementById('voucher-value-input');
  const minSpendInput = document.getElementById('voucher-min-spend-input');
  const descInput = document.getElementById('voucher-desc-input');
  const activeInput = document.getElementById('voucher-active-input');
  const limitInput = document.getElementById('voucher-limit-per-customer');
  const strictInput = document.getElementById('voucher-strict-mobile-limit');
  const saveBtn = document.getElementById('save-voucher-btn');

  const code = (codeInput?.value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!code) {
    showToast('Please enter a valid voucher code');
    return;
  }

  const daysVal = parseInt(document.getElementById('voucher-validity-days')?.value) || 0;
  const expiryDateVal = document.getElementById('voucher-expiry-date')?.value || '';

  let validUntil = null;
  let validDays = null;

  if (expiryDateVal) {
    validUntil = expiryDateVal;
    validDays = daysVal > 0 ? daysVal : null;
  } else if (daysVal > 0) {
    const d = new Date();
    d.setDate(d.getDate() + daysVal);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    validUntil = `${yyyy}-${mm}-${dd}`;
    validDays = daysVal;
  }

  const isEditing = !!editingVoucherCode;
  const oldCode = editingVoucherCode;
  const existingVoucher = (oldCode && adminVouchers && adminVouchers[oldCode])
    || (adminVouchers && adminVouchers[code])
    || {};

  const payload = {
    code,
    type: typeInput?.value || 'percent',
    value: parseFloat(valueInput?.value) || 0,
    minSpend: parseFloat(minSpendInput?.value) || 0,
    description: (descInput?.value || '').trim(),
    createdAt: existingVoucher.createdAt || new Date().toISOString(),
    active: activeInput ? activeInput.checked : true,
    limitPerCustomer: limitInput ? limitInput.checked : true,
    strictMobileLimit: limitInput && limitInput.checked && strictInput ? strictInput.checked : false,
    usedBy: existingVoucher.usedBy || {},
    usedDevices: existingVoucher.usedDevices || {},
    usedMobiles: existingVoucher.usedMobiles || {},
    redemptionCount: existingVoucher.redemptionCount || 0,
    updatedAt: Date.now()
  };

  if (validDays) payload.validDays = validDays;
  if (validUntil) payload.validUntil = validUntil;

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = isEditing ? 'Updating...' : 'Saving...';
  }

  try {
    // If editing and code was renamed, delete the old node
    if (isEditing && oldCode && oldCode !== code) {
      await remove(ref(db, `vouchers/${oldCode}`));
    }

    await set(ref(db, `vouchers/${code}`), payload);
    editingVoucherCode = null;
    window.closeVoucherModal();
    showToast(`Voucher "${code}" ${isEditing ? 'updated' : 'saved'} successfully! ✓`);
  } catch (err) {
    console.error('Failed to save voucher:', err);
    showToast('Failed to save voucher. Check connection.');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = isEditing ? 'Update Voucher' : 'Save Voucher';
    }
  }
};

window.toggleVoucherActive = async function(code, currentActive) {
  try {
    const all = getAllAdminVouchers();
    const current = all[code] || { code, active: true };
    await update(ref(db, `vouchers/${code}`), {
      active: !currentActive,
      updatedAt: Date.now()
    });
    showToast(`Voucher ${code} ${!currentActive ? 'activated' : 'paused'} ✓`);
  } catch (err) {
    console.error('Failed to toggle voucher:', err);
    showToast('Failed to update voucher status.');
  }
};

window.deleteVoucher = async function(code) {
  if (!confirm(`Are you sure you want to delete voucher "${code}"?`)) return;
  try {
    await remove(ref(db, `vouchers/${code}`));
    showToast(`Voucher ${code} removed ✓`);
  } catch (err) {
    console.error('Failed to delete voucher:', err);
    showToast('Failed to delete voucher.');
  }
};

window.resetVoucherUsage = async function(code) {
  if (!confirm(`Reset redemption history for voucher "${code}"?\n\nThis will allow previously redeemed customers/devices to use it again.`)) return;
  try {
    await update(ref(db, `vouchers/${code}`), {
      usedBy: null,
      usedDevices: null,
      usedMobiles: null,
      redemptionCount: 0,
      updatedAt: Date.now()
    });
    showToast(`Redemption history for "${code}" was reset ✓`);
  } catch (err) {
    console.error('Failed to reset voucher usage:', err);
    showToast('Failed to reset voucher usage.');
  }
};

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

let currentCropper = null;

window.closeCropModal = function() {
  document.getElementById('crop-modal').classList.remove('open');
  if (currentCropper) {
    currentCropper.destroy();
    currentCropper = null;
  }
};

window.confirmCrop = function() {
  if (!currentCropper) return;
  const canvas = currentCropper.getCroppedCanvas({
    width: 500,
    height: 500,
  });
  if (canvas) {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setDrinkImagePreview(dataUrl);
    const urlInput = document.getElementById('drink-image-url');
    if (urlInput) urlInput.value = '';
    closeCropModal();
  }
};

window.handleImageUpload = function(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const cropModal = document.getElementById('crop-modal');
    const cropperImage = document.getElementById('cropper-image');
    
    if (currentCropper) {
      currentCropper.destroy();
      currentCropper = null;
    }

    // Must remove src and set it again for Cropper to catch it nicely sometimes
    cropperImage.src = '';
    cropperImage.src = e.target.result;
    cropModal.classList.add('open');

    // Initialize Cropper after modal is visible to ensure correct dimensions
    setTimeout(() => {
      currentCropper = new Cropper(cropperImage, {
        aspectRatio: 1, 
        viewMode: 1,
        autoCropArea: 1,
        background: false,
        dragMode: 'move'
      });
    }, 100);
  };
  reader.readAsDataURL(file);
  // Reset input so the same file can trigger change again if needed
  event.target.value = '';
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
// MANUAL ORDER MODULE
// ══════════════════════════════════════════════════════════════════════

let manualOrderCart = [];

window.openManualOrderModal = function() {
  manualOrderCart = [];
  document.getElementById('manual-customer-name').value = '';
  document.getElementById('manual-order-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('manual-delivery-type').value = 'pickup';
  renderManualOrderCart();
  document.getElementById('manual-order-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
};

window.closeManualOrderModal = function() {
  document.getElementById('manual-order-modal').classList.remove('open');
  document.body.style.overflow = '';
};

function renderManualOrderCart() {
  const container = document.getElementById('manual-order-items-list');
  const totalEl = document.getElementById('manual-order-grand-total');
  
  if (manualOrderCart.length === 0) {
    container.innerHTML = '<div style="font-size:13px; color:var(--text-soft); font-style:italic;">No items added yet.</div>';
    totalEl.textContent = '₱0';
    return;
  }
  
  let grandTotal = 0;
  container.innerHTML = manualOrderCart.map((item, index) => {
    grandTotal += item.price * item.qty;
    
    let sub = [];
    if (item.size) sub.push(item.size);
    if (item.matcha) sub.push(item.matcha);
    if (item.sweetness) sub.push(`${item.sweetness} sweet`);
    if (item.addOns && item.addOns.length) {
       sub.push('+ ' + item.addOns.map(a => `${a.name} ${a.qty > 1 ? `(x${a.qty})` : ''}`).join(', '));
    }
    
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding:8px 0;">
        <div>
          <div style="font-weight:bold; font-size:14px; color:var(--green-900);">${item.name} <span style="color:var(--text-soft); font-weight:normal;">x${item.qty}</span></div>
          <div style="font-size:12px; color:var(--text-soft);">${sub.join(' · ')}</div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="font-weight:bold; color:var(--green-700);">₱${(item.price * item.qty).toLocaleString()}</div>
          <button type="button" onclick="removeManualCartItem(${index})" style="background:none; border:none; color:#dc2626; cursor:pointer; font-size:18px; line-height:1; padding:4px;">&times;</button>
        </div>
      </div>
    `;
  }).join('');
  
  totalEl.textContent = `₱${grandTotal.toLocaleString()}`;
}

window.removeManualCartItem = function(index) {
  manualOrderCart.splice(index, 1);
  renderManualOrderCart();
};

window.openManualItemBuilder = function() {
  const select = document.getElementById('manual-item-select');
  select.innerHTML = '<option value="">-- Choose Drink --</option>' + 
    Object.values(adminMenuProducts)
      .filter(p => p.available !== false)
      .map(p => `<option value="${p.id}">${p.name} (₱${p.price})</option>`)
      .join('');
      
  document.getElementById('manual-item-options').style.display = 'none';
  document.getElementById('manual-item-builder-modal').classList.add('open');
};

window.closeManualItemBuilder = function() {
  document.getElementById('manual-item-builder-modal').classList.remove('open');
};

window.onManualDrinkSelect = function() {
  const select = document.getElementById('manual-item-select');
  const val = select.value;
  const optionsDiv = document.getElementById('manual-item-options');
  
  if (!val) {
    optionsDiv.style.display = 'none';
    return;
  }
  
  const product = adminMenuProducts[val];
  optionsDiv.style.display = 'block';
  
  // Setup Matcha Variety
  const matchaGroup = document.getElementById('manual-matcha-group');
  if (product.hasMatcha !== false && adminMatchaChoices.length > 0) {
    matchaGroup.style.display = 'block';
    const matchaSelect = document.getElementById('manual-item-matcha');
    matchaSelect.innerHTML = adminMatchaChoices.map(c => `<option value="${c}">${c}</option>`).join('');
  } else {
    matchaGroup.style.display = 'none';
  }
  
  // Setup Add-ons
  const addonsList = document.getElementById('manual-item-addons-list');
  const availableAddons = Object.values(adminAddOns).filter(a => a.available !== false);
  addonsList.innerHTML = availableAddons.map(a => {
    if (a.type === 'quantity' || a.unit === 'g') {
      return `
        <div style="display:flex; justify-content:space-between; margin-bottom:6px; align-items:center;">
          <label style="font-size:13px; margin:0;"><input type="checkbox" class="manual-addon-cb" value="${a.id}" data-type="qty" onchange="toggleManualAddonQty('${a.id}')"> ${a.name} (+₱${a.price}/${a.unit || 'x'})</label>
          <input type="number" id="manual-addon-qty-${a.id}" min="1" value="1" style="width:60px; padding:4px; border:1px solid var(--border); border-radius:4px; display:none;" />
        </div>
      `;
    } else {
      return `
        <div style="margin-bottom:6px;">
          <label style="font-size:13px; margin:0;"><input type="checkbox" class="manual-addon-cb" value="${a.id}" data-type="bool"> ${a.name} (+₱${a.price})</label>
        </div>
      `;
    }
  }).join('');
  
  document.getElementById('manual-item-sweetness').value = '100%';
  if (document.getElementById('manual-item-size')) document.getElementById('manual-item-size').value = '12 oz';
  document.getElementById('manual-item-qty').value = '1';
};

window.toggleManualAddonQty = function(id) {
  const cb = document.querySelector(`.manual-addon-cb[value="${id}"]`);
  const qtyInput = document.getElementById(`manual-addon-qty-${id}`);
  if (cb && qtyInput) {
    qtyInput.style.display = cb.checked ? 'block' : 'none';
  }
};

window.confirmManualItem = function() {
  const select = document.getElementById('manual-item-select');
  const productId = select.value;
  if (!productId) return;
  const product = adminMenuProducts[productId];
  
  let itemPrice = product.price || 0;
  
  const sizeSelect = document.getElementById('manual-item-size');
  const size = sizeSelect ? sizeSelect.value : '12 oz';
  if (size === '16 oz') {
    itemPrice += 40;
  }

  let matcha = null;
  if (product.hasMatcha !== false && adminMatchaChoices.length > 0) {
    matcha = document.getElementById('manual-item-matcha').value;
  }
  
  const sweetness = document.getElementById('manual-item-sweetness').value;
  
  const addOns = [];
  document.querySelectorAll('.manual-addon-cb:checked').forEach(cb => {
    const a = adminAddOns[cb.value];
    if (!a) return;
    let qty = 1;
    if (cb.dataset.type === 'qty') {
      qty = parseInt(document.getElementById(`manual-addon-qty-${a.id}`).value) || 1;
    }
    addOns.push({
      id: a.id,
      name: a.name,
      price: a.price,
      qty: qty,
      unit: a.unit
    });
    itemPrice += a.price * qty;
  });
  
  const qty = parseInt(document.getElementById('manual-item-qty').value) || 1;
  
  manualOrderCart.push({
    id: product.id,
    name: product.name,
    category: product.category,
    price: itemPrice,
    unitPrice: itemPrice,
    qty: qty,
    size,
    matcha,
    sweetness,
    addOns
  });
  
  closeManualItemBuilder();
  renderManualOrderCart();
};

window.saveManualOrder = async function(event) {
  event.preventDefault();
  
  if (manualOrderCart.length === 0) {
    showToast('Please add at least one item to the order.');
    return;
  }
  
  const name = document.getElementById('manual-customer-name').value.trim();
  const date = document.getElementById('manual-order-date').value;
  const type = document.getElementById('manual-delivery-type').value;
  const btn = document.getElementById('save-manual-order-btn');

  if (!name) return;

  btn.disabled = true;
  btn.textContent = 'Creating...';

  // Generate a random order number like SM-XXXX
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const orderNumber = 'SM-M' + randomNum; // M for manual

  let grandTotal = 0;
  manualOrderCart.forEach(item => {
    grandTotal += item.price * item.qty;
  });

  const newOrder = {
    orderNumber,
    name,
    mobile: 'N/A',
    paymentMethod: 'Cash / COD',
    deliveryType: type,
    orderDate: date,
    preferredTime: 'Anytime',
    status: 'NEW',
    timestamp: Date.now(),
    subtotal: grandTotal,
    deliveryFee: 0,
    total: grandTotal,
    items: manualOrderCart
  };

  try {
    // Strip out any undefined values using JSON stringify, which Firebase strictly rejects
    const cleanOrder = JSON.parse(JSON.stringify(newOrder));
    const newRef = push(ref(db, 'orders'));
    await set(newRef, cleanOrder);
    closeManualOrderModal();
    showToast(`Manual order ${orderNumber} created! ✓`);
  } catch (err) {
    console.error('Failed to create manual order:', err);
    showToast('Failed to create order. Check connection.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Order';
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

  document.getElementById('manual-order-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeManualOrderModal();
  });

  document.getElementById('voucher-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) window.closeVoucherModal();
  });

  document.getElementById('inventory-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) window.closeInventoryModal();
  });

  document.getElementById('voucher-form')?.addEventListener('submit', window.saveVoucher);
});


// ── Live Presence & Real-time Traffic Tracking ──────────────────────
function renderLivePresence() {
  const now = Date.now();
  // Filter active presence records within the last 3 minutes (180,000 ms)
  const validUsers = Object.values(livePresence).filter(u => u && (now - (u.lastSeen || 0)) < 180000);

  // 1. Update Header Live Badge
  const headerCount = document.getElementById('header-live-visitors-count');
  if (headerCount) headerCount.textContent = validUsers.length;

  // 2. Update Live Card Header Badges
  const badge = document.getElementById('live-users-badge');
  if (badge) badge.textContent = `${validUsers.length} Active`;

  const cartCount = document.getElementById('live-cart-count');
  const usersWithCart = validUsers.filter(u => (u.cartQty || 0) > 0 || (u.stage && u.stage.toLowerCase().includes('cart')));
  if (cartCount) cartCount.textContent = usersWithCart.length;

  const container = document.getElementById('live-users-list');
  if (!container) return;

  if (validUsers.length === 0) {
    container.innerHTML = `
      <div class="live-empty-hint">
        🍃 No active shoppers on the website right now. Real-time active visitors will appear here automatically as they browse drinks or order!
      </div>
    `;
    return;
  }

  container.innerHTML = validUsers.map((u) => {
    const isMobile = u.device === 'Mobile';
    const icon = isMobile ? '📱' : '💻';
    const stage = u.stage || 'Browsing Menu';
    const secondsAgo = Math.max(0, Math.floor((now - (u.lastSeen || now)) / 1000));
    const timeText = secondsAgo < 20 ? 'Active now' : `${secondsAgo}s ago`;

    let stageBadgeColor = '#059669';
    if (stage.includes('Checkout')) {
      stageBadgeColor = '#7c3aed';
    } else if (stage.includes('Cart')) {
      stageBadgeColor = '#d97706';
    } else if (stage.includes('Placed Order')) {
      stageBadgeColor = '#0284c7';
    }

    return `
      <div class="live-user-pill">
        <div class="live-user-icon">${icon}</div>
        <div class="live-user-details">
          <div class="live-user-stage" style="color:${stageBadgeColor};" title="${stage}">${stage}</div>
          <div class="live-user-meta">${u.device || 'Visitor'} &middot; <span style="color:#059669;font-weight:700;">${timeText}</span></div>
        </div>
      </div>
    `;
  }).join('');
}

// ── Analytics Time Filter Presets ────────────────────────────────────
window.setAnalyticsPreset = function(preset) {
  activeAnalyticsPreset = preset;
  document.querySelectorAll('.analytics-preset-btn').forEach(b => {
    b.classList.toggle('active', b.id === `preset-${preset}`);
  });

  const startInput = document.getElementById('report-date-start');
  const endInput = document.getElementById('report-date-end');
  if (!startInput || !endInput) return;

  const now = new Date();
  const formatD = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const todayStr = formatD(now);

  if (preset === 'today') {
    startInput.value = todayStr;
    endInput.value = todayStr;
  } else if (preset === 'yesterday') {
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    const yestStr = formatD(yest);
    startInput.value = yestStr;
    endInput.value = yestStr;
  } else if (preset === '7days') {
    const past7 = new Date(now);
    past7.setDate(past7.getDate() - 6);
    startInput.value = formatD(past7);
    endInput.value = todayStr;
  } else if (preset === 'month') {
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startInput.value = formatD(firstOfMonth);
    endInput.value = todayStr;
  } else if (preset === 'all') {
    startInput.value = '2024-01-01';
    endInput.value = todayStr;
  }

  window.generateReports();
};

window.onCustomDateChange = function() {
  document.querySelectorAll('.analytics-preset-btn').forEach(b => b.classList.remove('active'));
  window.generateReports();
};

// ── Analytics Report Engine ──────────────────────────────────────────
window.generateReports = function() {
  const startInput = document.getElementById('report-date-start');
  const endInput = document.getElementById('report-date-end');
  if (!startInput || !endInput) return;

  renderLivePresence();

  // Default: Today if not set
  if (!startInput.value) {
    const d = new Date();
    startInput.value = d.toISOString().split('T')[0];
  }
  if (!endInput.value) {
    endInput.value = new Date().toISOString().split('T')[0];
  }

  const startStr = startInput.value;
  const endStr = endInput.value;

  // Filter orders in date range
  const rangeOrders = allOrders.filter(o => {
    const d = o.orderDate || new Date(o.timestamp || Date.now()).toISOString().split('T')[0];
    return d >= startStr && d <= endStr;
  });

  const completedOrders = rangeOrders.filter(o => o.status === 'COMPLETED');

  // 1. Sales & Order Totals
  const totalSales = completedOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalOrdersCount = rangeOrders.length;
  const completedOrdersCount = completedOrders.length;
  const avgOrderValue = completedOrdersCount > 0 ? Math.round(totalSales / completedOrdersCount) : 0;

  // 2. Unique Visitors Calculation from dailyVisitors
  const uniqueVisitorKeys = new Set();
  if (dailyVisitors && typeof dailyVisitors === 'object') {
    Object.entries(dailyVisitors).forEach(([dateStr, visitorsObj]) => {
      if (dateStr >= startStr && dateStr <= endStr && visitorsObj && typeof visitorsObj === 'object') {
        Object.keys(visitorsObj).forEach(id => uniqueVisitorKeys.add(id));
      }
    });
  }
  const uniqueVisitorsCount = Math.max(uniqueVisitorKeys.size, rangeOrders.length);
  const conversionRate = uniqueVisitorsCount > 0 ? ((completedOrdersCount / uniqueVisitorsCount) * 100).toFixed(1) : 0;

  // 3. Total Items Sold & Discounts Given
  let totalItemsCount = 0;
  let totalDiscountsGiven = 0;
  const itemCounts = {};
  const voucherUsageMap = {};

  rangeOrders.forEach(o => {
    if (o.discountAmount && o.discountAmount > 0) {
      totalDiscountsGiven += Number(o.discountAmount) || 0;
    }
    if (o.voucherCode) {
      const vCode = String(o.voucherCode).toUpperCase();
      if (!voucherUsageMap[vCode]) voucherUsageMap[vCode] = { count: 0, savings: 0 };
      voucherUsageMap[vCode].count++;
      voucherUsageMap[vCode].savings += Number(o.discountAmount) || 0;
    }

    if (o.status === 'COMPLETED') {
      (o.items || []).forEach(item => {
        const qty = item.qty || 1;
        totalItemsCount += qty;
        if (!itemCounts[item.name]) {
          itemCounts[item.name] = { qty: 0, revenue: 0 };
        }
        itemCounts[item.name].qty += qty;
        itemCounts[item.name].revenue += ((item.unitPrice || item.price || 0) * qty);
      });
    }
  });

  // Update KPI Cards
  const tsEl = document.getElementById('report-total-sales');
  if (tsEl) tsEl.textContent = `₱${totalSales.toLocaleString()}`;
  const ssEl = document.getElementById('report-sales-sub');
  if (ssEl) ssEl.textContent = `${completedOrdersCount} completed order${completedOrdersCount === 1 ? '' : 's'}`;

  const toEl = document.getElementById('report-total-orders');
  if (toEl) toEl.textContent = totalOrdersCount;
  const osEl = document.getElementById('report-orders-sub');
  if (osEl) osEl.textContent = `${rangeOrders.filter(o => o.status === 'NEW').length} new · ${rangeOrders.filter(o => o.status === 'PREPARING').length} preparing`;

  const tvEl = document.getElementById('report-total-visitors');
  if (tvEl) tvEl.textContent = uniqueVisitorsCount.toLocaleString();
  const vsEl = document.getElementById('report-visitors-sub');
  if (vsEl) vsEl.textContent = `${startStr === endStr ? "Today's" : 'Date range'} unique visitors`;

  const crEl = document.getElementById('report-conversion-rate');
  if (crEl) crEl.textContent = `${conversionRate}%`;

  const aovEl = document.getElementById('report-avg-order-value');
  if (aovEl) aovEl.textContent = `₱${avgOrderValue.toLocaleString()}`;

  const tiEl = document.getElementById('report-total-items');
  if (tiEl) tiEl.textContent = totalItemsCount.toLocaleString();

  const tdEl = document.getElementById('report-total-discounts');
  if (tdEl) tdEl.textContent = totalDiscountsGiven > 0 ? `-₱${totalDiscountsGiven.toLocaleString()}` : '₱0';

  // 4. Peak Ordering Hours Chart
  const hourBuckets = {
    '09:00 - 11:00 AM': 0,
    '11:00 AM - 01:00 PM': 0,
    '01:00 - 03:00 PM': 0,
    '03:00 - 05:00 PM': 0,
    '05:00 - 07:00 PM': 0,
    '07:00 - 09:00 PM': 0,
  };

  rangeOrders.forEach(o => {
    let t = o.preferredTime;
    if (!t && o.timestamp) {
      const d = new Date(o.timestamp);
      t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    if (!t) return;
    const h = parseInt(t.split(':')[0]);
    if (h >= 9 && h < 11) hourBuckets['09:00 - 11:00 AM']++;
    else if (h >= 11 && h < 13) hourBuckets['11:00 AM - 01:00 PM']++;
    else if (h >= 13 && h < 15) hourBuckets['01:00 - 03:00 PM']++;
    else if (h >= 15 && h < 17) hourBuckets['03:00 - 05:00 PM']++;
    else if (h >= 17 && h < 19) hourBuckets['05:00 - 07:00 PM']++;
    else if (h >= 19 && h <= 21) hourBuckets['07:00 - 09:00 PM']++;
  });

  const maxHourOrders = Math.max(1, ...Object.values(hourBuckets));
  const peakHoursContainer = document.getElementById('report-peak-hours');
  if (peakHoursContainer) {
    peakHoursContainer.innerHTML = Object.entries(hourBuckets).map(([label, count]) => {
      const pct = Math.round((count / maxHourOrders) * 100);
      return `
        <div class="hourly-chart-bar-wrap">
          <div class="hourly-chart-label">${label.split(' - ')[0]}</div>
          <div class="hourly-chart-track">
            <div class="hourly-chart-fill" style="width:${pct}%"></div>
          </div>
          <div class="hourly-chart-val">${count} ${count === 1 ? 'order' : 'orders'}</div>
        </div>
      `;
    }).join('');
  }

  // 5. Fulfillment & Payment Mix
  const deliveryCount = rangeOrders.filter(o => o.deliveryType === 'delivery').length;
  const pickupCount = rangeOrders.filter(o => o.deliveryType !== 'delivery').length;
  const delTotal = deliveryCount + pickupCount;
  const delPct = delTotal > 0 ? Math.round((deliveryCount / delTotal) * 100) : 50;
  const pickPct = 100 - delPct;

  const barDel = document.getElementById('bar-delivery');
  if (barDel) barDel.style.width = `${delPct}%`;
  const barPick = document.getElementById('bar-pickup');
  if (barPick) barPick.style.width = `${pickPct}%`;
  const lblDel = document.getElementById('label-delivery-pct');
  if (lblDel) lblDel.textContent = `🛵 Delivery: ${delPct}% (${deliveryCount})`;
  const lblPick = document.getElementById('label-pickup-pct');
  if (lblPick) lblPick.textContent = `🏪 Pickup: ${pickPct}% (${pickupCount})`;

  const gcashCount = rangeOrders.filter(o => o.paymentMethod === 'GCash').length;
  const codCount = rangeOrders.filter(o => o.paymentMethod !== 'GCash').length;
  const payTotal = gcashCount + codCount;
  const gcashPct = payTotal > 0 ? Math.round((gcashCount / payTotal) * 100) : 50;
  const codPct = 100 - gcashPct;

  const barGcash = document.getElementById('bar-gcash');
  if (barGcash) barGcash.style.width = `${gcashPct}%`;
  const barCod = document.getElementById('bar-cod');
  if (barCod) barCod.style.width = `${codPct}%`;
  const lblGcash = document.getElementById('label-gcash-pct');
  if (lblGcash) lblGcash.textContent = `📱 GCash: ${gcashPct}% (${gcashCount})`;
  const lblCod = document.getElementById('label-cod-pct');
  if (lblCod) lblCod.textContent = `💵 COD / Cash: ${codPct}% (${codCount})`;

  const statusBreakdown = document.getElementById('order-status-breakdown');
  if (statusBreakdown) {
    statusBreakdown.innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
        <span style="background:#e0f2fe;color:#0369a1;padding:3px 8px;border-radius:6px;">🆕 ${rangeOrders.filter(o => o.status === 'NEW').length} New</span>
        <span style="background:#fef3c7;color:#b45309;padding:3px 8px;border-radius:6px;">👩‍🍳 ${rangeOrders.filter(o => o.status === 'PREPARING').length} Preparing</span>
        <span style="background:#dcfce7;color:#15803d;padding:3px 8px;border-radius:6px;">✅ ${rangeOrders.filter(o => o.status === 'READY').length} Ready</span>
        <span style="background:#f3f4f6;color:#374151;padding:3px 8px;border-radius:6px;">🎉 ${completedOrdersCount} Completed</span>
      </div>
    `;
  }

  // 6. Top Selling Drinks
  const topItemsList = document.getElementById('report-top-items');
  if (topItemsList) {
    if (Object.keys(itemCounts).length === 0) {
      topItemsList.innerHTML = '<div class="empty-state"><p>No completed drink orders in this period.</p></div>';
    } else {
      const sortedItems = Object.entries(itemCounts).sort((a, b) => b[1].qty - a[1].qty);
      const medals = ['🥇', '🥈', '🥉'];
      topItemsList.innerHTML = sortedItems.map(([name, data], idx) => {
        const medalOrNum = idx < 3 ? medals[idx] : `#${idx + 1}`;
        return `
          <div class="admin-addon-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;">
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="font-size:16px;width:28px;text-align:center;">${medalOrNum}</div>
              <div class="admin-addon-name" style="margin:0;font-weight:700;">${name}</div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:900;color:var(--green-700);font-size:14px">${data.qty} sold</div>
              <div style="font-size:11.5px;color:var(--text-soft)">₱${data.revenue.toLocaleString()} sales</div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 7. Voucher Stats
  const voucherStatsContainer = document.getElementById('report-voucher-stats');
  if (voucherStatsContainer) {
    const voucherEntries = Object.entries(voucherUsageMap);
    if (voucherEntries.length === 0) {
      voucherStatsContainer.innerHTML = '<div class="empty-state"><p>No vouchers redeemed in this date range.</p></div>';
    } else {
      voucherStatsContainer.innerHTML = voucherEntries.map(([code, data]) => `
        <div class="admin-addon-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-family:monospace;font-weight:900;background:var(--green-50);padding:2px 8px;border-radius:6px;border:1px solid var(--green-300);color:var(--green-800);">🎟️ ${code}</span>
          </div>
          <div style="text-align:right">
            <div style="font-weight:800;color:var(--green-700);font-size:13px">${data.count} redeemed</div>
            <div style="font-size:11.5px;color:#b91c1c;">-₱${data.savings.toLocaleString()} saved</div>
          </div>
        </div>
      `).join('');
    }
  }
};


// ══════════════════════════════════════════════════════════════════════
// CSV EXPORT MODULE
// ══════════════════════════════════════════════════════════════════════

function downloadCSV(csvContent, filename) {
  // UTF-8 BOM ensures Excel displays UTF-8 (₱ symbols, emojis, etc.) properly
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCSV(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

window.exportOrdersCSV = function() {
  if (!allOrders || allOrders.length === 0) {
    showToast('No orders available to export.');
    return;
  }

  const rows = [
    [
      'Order Number',
      'Date',
      'Time / Preferred',
      'Customer Name',
      'Mobile',
      'Fulfillment',
      'Delivery Address',
      'Payment Method',
      'Status',
      'Items Ordered',
      'Total Cups',
      'Subtotal (PHP)',
      'Delivery Fee (PHP)',
      'Discount Amount (PHP)',
      'Voucher Code',
      'Grand Total (PHP)'
    ]
  ];

  allOrders.forEach(o => {
    const dateStr = o.orderDate || (o.timestamp ? new Date(o.timestamp).toISOString().split('T')[0] : '');
    const timeStr = o.preferredTime || '';
    const itemsSummary = (o.items || []).map(i => {
      const size = i.size ? ` [${i.size}]` : '';
      const matcha = i.matcha ? ` [${i.matcha}]` : '';
      const sweetness = i.sweetness ? ` (${i.sweetness})` : '';
      return `${i.qty || 1}x ${i.name}${size}${matcha}${sweetness}`;
    }).join('; ');
    const totalQty = (o.items || []).reduce((sum, i) => sum + (i.qty || 1), 0);

    rows.push([
      o.orderNumber || '',
      dateStr,
      timeStr,
      o.name || '',
      o.mobile || '',
      o.deliveryType === 'delivery' ? 'Delivery' : 'Pickup',
      o.address || '',
      o.paymentMethod || 'COD',
      o.status || 'NEW',
      itemsSummary,
      totalQty,
      o.subtotal || 0,
      o.deliveryFee || 0,
      o.discountAmount || 0,
      o.voucherCode || '',
      o.total || 0
    ]);
  });

  const csvContent = rows.map(r => r.map(escapeCSV).join(',')).join('\r\n');
  const today = new Date().toISOString().split('T')[0];
  downloadCSV(csvContent, `studio-midori-orders-${today}.csv`);
  showToast('Orders exported to CSV! 📥');
};

window.exportAnalyticsCSV = function() {
  const startInput = document.getElementById('report-date-start');
  const endInput = document.getElementById('report-date-end');
  const startStr = startInput?.value || new Date().toISOString().split('T')[0];
  const endStr = endInput?.value || startStr;

  const rangeOrders = allOrders.filter(o => {
    const d = o.orderDate || new Date(o.timestamp || Date.now()).toISOString().split('T')[0];
    return d >= startStr && d <= endStr;
  });

  const completedOrders = rangeOrders.filter(o => o.status === 'COMPLETED');
  const totalSales = completedOrders.reduce((sum, o) => sum + (o.total || 0), 0);

  const itemCounts = {};
  rangeOrders.forEach(o => {
    if (o.status === 'COMPLETED') {
      (o.items || []).forEach(item => {
        const qty = item.qty || 1;
        if (!itemCounts[item.name]) itemCounts[item.name] = { qty: 0, revenue: 0 };
        itemCounts[item.name].qty += qty;
        itemCounts[item.name].revenue += ((item.unitPrice || item.price || 0) * qty);
      });
    }
  });

  const rows = [
    ['Studio Midori - Analytics & Sales Report'],
    ['Date Range', `${startStr} to ${endStr}`],
    ['Report Generated', new Date().toLocaleString('en-PH')],
    [''],
    ['Executive Summary Metric', 'Value'],
    ['Total Completed Sales (PHP)', totalSales],
    ['Total Orders in Range', rangeOrders.length],
    ['Completed Orders', completedOrders.length],
    ['New / Pending Orders', rangeOrders.filter(o => o.status === 'NEW').length],
    ['Preparing Orders', rangeOrders.filter(o => o.status === 'PREPARING').length],
    ['Average Order Value (PHP)', completedOrders.length > 0 ? Math.round(totalSales / completedOrders.length) : 0],
    [''],
    ['Product Sales Breakdown'],
    ['Drink Name', 'Cups Sold', 'Total Sales (PHP)']
  ];

  Object.entries(itemCounts)
    .sort((a, b) => b[1].qty - a[1].qty)
    .forEach(([name, data]) => {
      rows.push([name, data.qty, data.revenue]);
    });

  const csvContent = rows.map(r => r.map(escapeCSV).join(',')).join('\r\n');
  downloadCSV(csvContent, `studio-midori-sales-${startStr}-to-${endStr}.csv`);
  showToast('Sales report exported to CSV! 📥');
};

window.exportInventoryCSV = function() {
  const items = Object.values(adminInventory || {});
  if (items.length === 0) {
    showToast('No inventory records to export.');
    return;
  }

  const rows = [
    ['Item Name', 'Category', 'Current Stock', 'Unit', 'Threshold', 'Status', 'Last Updated']
  ];

  items.forEach(item => {
    const qty = Number(item.qty || 0);
    const threshold = Number(item.threshold || 0);
    let status = 'In Stock';
    if (qty <= 0) status = 'Out of Stock';
    else if (qty <= threshold) status = 'Low Stock';

    const lastUpdated = item.lastUpdated ? new Date(item.lastUpdated).toLocaleString('en-PH') : '—';
    rows.push([
      item.name || '',
      item.category || '',
      qty,
      item.unit || '',
      threshold,
      status,
      lastUpdated
    ]);
  });

  const csvContent = rows.map(r => r.map(escapeCSV).join(',')).join('\r\n');
  const today = new Date().toISOString().split('T')[0];
  downloadCSV(csvContent, `studio-midori-inventory-${today}.csv`);
  showToast('Inventory exported to CSV! 📥');
};


// ══════════════════════════════════════════════════════════════════════
// INVENTORY MANAGEMENT MODULE
// ══════════════════════════════════════════════════════════════════════

const CATEGORY_META = {
  tea:       { label: 'Matcha & Teas', icon: '🍵' },
  dairy:     { label: 'Milks & Dairy', icon: '🥛' },
  syrups:    { label: 'Syrups & Purées', icon: '🍯' },
  toppings:  { label: 'Toppings', icon: '🧋' },
  packaging: { label: 'Cups & Packaging', icon: '🥤' },
  other:     { label: 'Other', icon: '📦' },
};

window.renderInventory = function() {
  const container = document.getElementById('inventory-items-container');
  if (!container) return;

  const items = Object.values(adminInventory || {});

  // Compute KPI counts
  let healthyCount = 0;
  let lowCount = 0;
  let outCount = 0;

  items.forEach(item => {
    const qty = Number(item.qty || 0);
    const threshold = Number(item.threshold || 0);
    if (qty <= 0) outCount++;
    else if (qty <= threshold) lowCount++;
    else healthyCount++;
  });

  const totalEl = document.getElementById('inv-kpi-total');
  const healthyEl = document.getElementById('inv-kpi-healthy');
  const lowEl = document.getElementById('inv-kpi-low');
  const outEl = document.getElementById('inv-kpi-out');
  if (totalEl) totalEl.textContent = items.length;
  if (healthyEl) healthyEl.textContent = healthyCount;
  if (lowEl) lowEl.textContent = lowCount;
  if (outEl) outEl.textContent = outCount;

  // Update nav badge with total needing attention
  const badge = document.getElementById('nav-inventory-badge');
  const attentionCount = lowCount + outCount;
  if (badge) {
    badge.textContent = attentionCount;
    badge.classList.toggle('hidden', attentionCount === 0);
  }

  // Update filter pill counters
  const allCountEl = document.getElementById('inv-filter-all-count');
  const lowCountEl = document.getElementById('inv-filter-low-count');
  const outCountEl = document.getElementById('inv-filter-out-count');
  if (allCountEl) allCountEl.textContent = items.length;
  if (lowCountEl) lowCountEl.textContent = lowCount;
  if (outCountEl) outCountEl.textContent = outCount;

  // Filter items based on active filter and search text
  const searchInput = document.getElementById('inv-search-input');
  const queryText = (searchInput?.value || '').trim().toLowerCase();

  const filtered = items.filter(item => {
    const qty = Number(item.qty || 0);
    const threshold = Number(item.threshold || 0);

    if (activeInventoryFilter === 'low' && (qty <= 0 || qty > threshold)) return false;
    if (activeInventoryFilter === 'out' && qty > 0) return false;

    if (queryText) {
      const name = (item.name || '').toLowerCase();
      const cat = (item.category || '').toLowerCase();
      return name.includes(queryText) || cat.includes(queryText);
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🍃</div>
        <p style="font-weight:700;">No items found matching the current filter.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="inv-grid">
      ${filtered.map(item => {
        const qty = Number(item.qty || 0);
        const threshold = Number(item.threshold || 0);
        const cat = CATEGORY_META[item.category] || CATEGORY_META.other;

        let statusClass = 'inv-status-healthy';
        let statusText = '🟢 In Stock';
        let cardAlertClass = '';

        if (qty <= 0) {
          statusClass = 'inv-status-out';
          statusText = '🔴 Out of Stock';
          cardAlertClass = 'out-of-stock';
        } else if (qty <= threshold) {
          statusClass = 'inv-status-low';
          statusText = '🟡 Low Stock';
          cardAlertClass = 'low-stock';
        }

        // Stepper step size based on unit
        const bigStep = (item.unit === 'cartons' || item.unit === 'L' || item.unit === 'kg') ? 5 : 10;

        return `
          <div class="inv-card ${cardAlertClass}">
            <div class="inv-card-header">
              <div>
                <div class="inv-card-title">${item.name}</div>
                <div class="inv-card-category">${cat.icon} ${cat.label}</div>
              </div>
              <span class="inv-status-badge ${statusClass}">${statusText}</span>
            </div>

            <div class="inv-qty-box">
              <div>
                <span class="inv-qty-num">${qty}</span>
                <span class="inv-qty-unit">${item.unit || ''}</span>
              </div>
              <div class="inv-threshold-hint">Min alert: <b>${threshold}${item.unit || ''}</b></div>
            </div>

            <div class="inv-controls">
              <div class="inv-stepper">
                <button type="button" class="inv-step-btn" onclick="adjustInventoryQty('${item.id}', -${bigStep})" title="Subtract ${bigStep}">-${bigStep}</button>
                <button type="button" class="inv-step-btn" onclick="adjustInventoryQty('${item.id}', -1)" title="Subtract 1">-1</button>
                <button type="button" class="inv-step-btn" onclick="adjustInventoryQty('${item.id}', 1)" title="Add 1">+1</button>
                <button type="button" class="inv-step-btn" onclick="adjustInventoryQty('${item.id}', ${bigStep})" title="Add ${bigStep}">+${bigStep}</button>
              </div>
              <div class="inv-action-btns">
                <button type="button" class="inv-btn-icon" onclick="openEditInventoryModal('${item.id}')" title="Edit Item Details">✏️</button>
                <button type="button" class="inv-btn-icon delete" onclick="deleteInventoryItem('${item.id}', '${item.name.replace(/'/g, "\\'")}')" title="Delete Item">🗑️</button>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
};

window.filterInventoryList = function() {
  window.renderInventory();
};

window.setInventoryFilter = function(filter) {
  activeInventoryFilter = filter;
  ['all', 'low', 'out'].forEach(f => {
    const btn = document.getElementById(`inv-filter-${f}`);
    if (btn) btn.classList.toggle('active', f === filter);
  });
  window.renderInventory();
};

window.adjustInventoryQty = async function(id, delta) {
  const item = adminInventory[id];
  if (!item) return;

  const currentQty = Number(item.qty || 0);
  const newQty = Math.max(0, Math.round((currentQty + delta) * 100) / 100);

  try {
    await update(ref(db, `inventory/${id}`), {
      qty: newQty,
      lastUpdated: Date.now()
    });
  } catch (err) {
    console.error('Failed to update inventory quantity:', err);
    showToast('Failed to update stock. Check connection.');
  }
};

window.openAddInventoryModal = function() {
  const modal = document.getElementById('inventory-modal');
  const title = document.getElementById('inventory-modal-title');
  const idInput = document.getElementById('inv-edit-id');
  const nameInput = document.getElementById('inv-name-input');
  const catInput = document.getElementById('inv-category-input');
  const qtyInput = document.getElementById('inv-qty-input');
  const unitInput = document.getElementById('inv-unit-input');
  const threshInput = document.getElementById('inv-threshold-input');

  if (title) title.textContent = 'Add Inventory Item';
  if (idInput) idInput.value = '';
  if (nameInput) nameInput.value = '';
  if (catInput) catInput.value = 'tea';
  if (qtyInput) qtyInput.value = '';
  if (unitInput) unitInput.value = 'g';
  if (threshInput) threshInput.value = '50';

  modal?.classList.add('open');
  nameInput?.focus();
};

window.openEditInventoryModal = function(id) {
  const item = adminInventory[id];
  if (!item) return;

  const modal = document.getElementById('inventory-modal');
  const title = document.getElementById('inventory-modal-title');
  const idInput = document.getElementById('inv-edit-id');
  const nameInput = document.getElementById('inv-name-input');
  const catInput = document.getElementById('inv-category-input');
  const qtyInput = document.getElementById('inv-qty-input');
  const unitInput = document.getElementById('inv-unit-input');
  const threshInput = document.getElementById('inv-threshold-input');

  if (title) title.textContent = 'Edit Inventory Item';
  if (idInput) idInput.value = id;
  if (nameInput) nameInput.value = item.name || '';
  if (catInput) catInput.value = item.category || 'other';
  if (qtyInput) qtyInput.value = item.qty || 0;
  if (unitInput) unitInput.value = item.unit || '';
  if (threshInput) threshInput.value = item.threshold || 0;

  modal?.classList.add('open');
  nameInput?.focus();
};

window.closeInventoryModal = function() {
  document.getElementById('inventory-modal')?.classList.remove('open');
};

window.saveInventoryItem = async function(event) {
  event.preventDefault();
  const idInput = document.getElementById('inv-edit-id');
  const nameInput = document.getElementById('inv-name-input');
  const catInput = document.getElementById('inv-category-input');
  const qtyInput = document.getElementById('inv-qty-input');
  const unitInput = document.getElementById('inv-unit-input');
  const threshInput = document.getElementById('inv-threshold-input');

  const name = nameInput.value.trim();
  const category = catInput.value;
  const qty = Number(qtyInput.value) || 0;
  const unit = unitInput.value.trim();
  const threshold = Number(threshInput.value) || 0;

  if (!name) return;

  const id = idInput.value || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const payload = {
    id,
    name,
    category,
    qty,
    unit,
    threshold,
    lastUpdated: Date.now()
  };

  const btn = document.getElementById('save-inventory-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }

  try {
    await set(ref(db, `inventory/${id}`), payload);
    closeInventoryModal();
    showToast(`Inventory item saved! 📦`);
  } catch (err) {
    console.error('Failed to save inventory item:', err);
    showToast('Failed to save item. Check connection.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save Item';
    }
  }
};

window.deleteInventoryItem = async function(id, name) {
  if (!confirm(`Are you sure you want to delete "${name}" from inventory?`)) return;

  try {
    await remove(ref(db, `inventory/${id}`));
    showToast(`Deleted ${name} ✓`);
  } catch (err) {
    console.error('Failed to delete inventory item:', err);
    showToast('Failed to delete item.');
  }
};

