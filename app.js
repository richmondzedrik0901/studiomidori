/**
 * app.js – Studio Midori Order Page Logic (Category Separation & Add-ons)
 */

import { db } from './firebase.js';
import {
  ref, push, get, onValue, set,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js';
import { sendOrderNotification } from './notification.js';

const SWEETNESS_OPTS = ['0%', '25%', '50%', '75%', '100%'];
// ── Delivery Fee Constants ──────────────────────────────────────────────
const STORE_LAT = 17.601133; // Studio Midori base location
const STORE_LNG = 120.612134;
const FEE_BASE = 25;        // ₱25 base pay
const FEE_PER_KM = 10;       // ₱10 per km
let DELIVERY_FEE = 0;        // recalculated whenever a pin is set
let isOutsideDeliveryLimit = false;

// ── Dynamic Menu State ────────────────────────────────────────────────
let products = [];        // loaded from Firebase only
let matchaChoices = [];   // loaded from Firebase only
let addOns = {};          // loaded from Firebase only
let storeSettings = {};   // loaded from Firebase only
let selectedCategory = 'all'; // 'all', 'matcha', 'hojicha'
let bestSellingProductNames = [];

let savedState = {};
try { savedState = JSON.parse(localStorage.getItem('midori_order_state')) || {}; } catch (e) { }

const state = {
  // keyed by variationKey, value = { productId, matcha, sweetness, addOns[], qty }
  items: savedState.items || {},
  deliveryType: savedState.deliveryType || 'pickup',
};

// Normalize any items from legacy storage to ensure qty property exists
Object.values(state.items).forEach(item => {
  if (!item.qty || item.qty < 1) item.qty = 1;
});

// Returns variation fingerprint so identical cup options group together with quantity
function getVariationKey(productId, matcha, sweetness, addOns) {
  const sortedAddOns = (addOns || [])
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(a => `${a.id}:${a.qty || 1}`)
    .join('|');
  return `${productId}__${matcha || 'none'}__${sweetness || '100%'}__${sortedAddOns}`;
}

// How many total cups does a product have across all customized variations in the cart?
function getProductQty(productId) {
  return Object.values(state.items)
    .filter(k => k.productId === productId)
    .reduce((sum, k) => sum + (k.qty || 1), 0);
}

// Total cups in entire cart
function getTotalCartQty() {
  return Object.values(state.items).reduce((sum, k) => sum + (k.qty || 1), 0);
}

// ── DOM Helpers ──────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Listen to Dynamic Menu, Matcha & Add-ons from Firebase ───────────
function listenToMenu() {
  // 1. Matcha Choices
  const matchaRef = ref(db, 'menu/matchaChoices');
  onValue(matchaRef, (snapshot) => {
    const val = snapshot.val();
    matchaChoices = val ? (Array.isArray(val) ? val : Object.values(val)) : [];
    buildProductList();
  }, (err) => console.warn('Could not load matcha choices:', err));

  // 2. Products — always reflect Firebase (including empty)
  const productsRef = ref(db, 'menu/products');
  onValue(productsRef, (snapshot) => {
    products = snapshot.exists() ? Object.values(snapshot.val()) : [];
    buildProductList();
    updateSummary();
  }, (err) => console.warn('Could not load products:', err));

  // 3. Add-ons
  const addOnsRef = ref(db, 'menu/addOns');
  onValue(addOnsRef, (snapshot) => {
    addOns = snapshot.exists() ? snapshot.val() : {};
    buildProductList();
    updateSummary();
  }, (err) => console.warn('Could not load add-ons:', err));

  // 4. Settings
  const settingsRef = ref(db, 'menu/settings');
  onValue(settingsRef, (snapshot) => {
    storeSettings = snapshot.exists() ? snapshot.val() : {};
    if (window.reapplyDateMin) window.reapplyDateMin();
  }, (err) => console.warn('Could not load settings:', err));

  // 5. Orders (for best selling products)
  const ordersRef = ref(db, 'orders');
  onValue(ordersRef, (snapshot) => {
    bestSellingProductNames = [];
    if (snapshot.exists()) {
      const orders = Object.values(snapshot.val());
      const itemCounts = {};
      orders.forEach(o => {
        if (o.status !== 'COMPLETED') return;
        (o.items || []).forEach(item => {
          if (item.name) {
            itemCounts[item.name] = (itemCounts[item.name] || 0) + (item.qty || 1);
          }
        });
      });
      bestSellingProductNames = Object.entries(itemCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(e => e[0]);
    }
    buildProductList();
  }, (err) => console.warn('Could not load orders for best selling:', err));
}

// ── Category Tab Switching ───────────────────────────────────────────
window.setMenuCategory = function (category) {
  selectedCategory = category;

  document.querySelectorAll('.category-tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  const activeBtn = $(`cat-tab-${category}`);
  if (activeBtn) activeBtn.classList.add('active');

  buildProductList();
};

// ── Order Number Generator ───────────────────────────────────────────
async function generateOrderNumber() {
  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500));
    const snapshot = await Promise.race([get(ref(db, 'orders')), timeout]);
    const count = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
    return 'SM-' + String(count + 1).padStart(4, '0');
  } catch {
    const ts = Date.now().toString().slice(-4);
    return 'SM-' + ts;
  }
}

// ── Build Dynamic Product List with Category Separation ──────────────
function buildProductList() {
  const container = $('product-list');
  if (!container) return;

  container.innerHTML = '';

  // Classify products into Matcha vs Hojicha
  const matchaList = [];
  const hojichaList = [];

  products.forEach(p => {
    const isHojicha = (p.category === 'hojicha') || (p.name && p.name.toLowerCase().includes('hojicha'));
    if (isHojicha) {
      hojichaList.push(p);
    } else {
      matchaList.push(p);
    }
  });

  // ── Render the product card (Shopee style) ──────────────────────────
  function renderDrinkCard(p) {
    const isAvail = p.available !== false;
    const qty = getProductQty(p.id);
    const hasQty = qty > 0;

    const div = document.createElement('div');
    div.className = `product-item ${hasQty ? 'has-qty' : ''} ${isAvail ? '' : 'sold-out'}`;
    div.id = `product-${p.id}`;

    const thumbHtml = p.image
      ? `<img src="${p.image}" alt="${p.name}" class="product-img" loading="lazy" onerror="this.onerror=null;this.parentElement.innerHTML='<span class=\\'product-img-fallback\\'>🍵</span>'" />`
      : `<span class="product-img-fallback">🍵</span>`;

    let actionHtml = '';
    if (!isAvail) {
      actionHtml = `<span class="sold-out-badge">Sold Out</span>`;
    } else if (qty === 0) {
      actionHtml = `
        <div class="product-action-box">
          <button type="button" class="btn-add-to-cart" onclick="window.openCustomizationModal('${p.id}')">
            ＋ Add
          </button>
        </div>
      `;
    } else {
      actionHtml = `
        <div class="in-cart-indicator-group">
          <button type="button" class="in-cart-badge-btn" onclick="window.openCartDrawer()" title="View in Cart">
            🛒 ${qty} in cart
          </button>
          <button type="button" class="btn-add-another-pill" onclick="window.openCustomizationModal('${p.id}')" title="Add another cup of this drink">
            ＋
          </button>
        </div>
      `;
    }

    div.innerHTML = `
      <div class="product-card-inner" ${isAvail ? `onclick="if (!event.target.closest('button')) window.openCustomizationModal('${p.id}')" style="cursor:pointer;"` : ''}>
        <div class="product-img-wrap">${thumbHtml}</div>
        <div class="product-details">
          <div class="product-name">
            ${p.name}
            ${bestSellingProductNames.includes(p.name) ? `<span style="background:var(--green-100,#dcfce7);color:var(--green-800,#166534);font-size:10px;font-weight:800;padding:2px 6px;border-radius:8px;margin-left:8px;vertical-align:middle;text-transform:uppercase;letter-spacing:0.5px;border:1px solid var(--green-200,#bbf7d0); white-space: nowrap;">⭐ Best Seller</span>` : ''}
          </div>
          ${p.description ? `<div class="product-desc">${p.description}</div>` : ''}
          <div class="product-price-row">
            <div class="product-price">₱${(p.price || 0).toLocaleString()}</div>
            ${actionHtml}
          </div>
        </div>
      </div>
    `;

    return div;
  }

  // 1. Render Matcha Series if all or matcha is selected
  if ((selectedCategory === 'all' || selectedCategory === 'matcha') && matchaList.length > 0) {
    const section = document.createElement('div');
    section.className = 'menu-category-section';
    section.innerHTML = `
      <div class="menu-category-heading">
        <h3>🍵 Matcha Series</h3>
        <span class="category-badge">${matchaList.length} items</span>
      </div>
      <div class="category-drinks-list" id="matcha-drinks-list"></div>
    `;
    const listEl = section.querySelector('#matcha-drinks-list');
    matchaList.forEach(p => listEl.appendChild(renderDrinkCard(p)));
    container.appendChild(section);
  }

  // 2. Render Hojicha Series if all or hojicha is selected
  if ((selectedCategory === 'all' || selectedCategory === 'hojicha') && hojichaList.length > 0) {
    const section = document.createElement('div');
    section.className = 'menu-category-section';
    section.innerHTML = `
      <div class="menu-category-heading" style="border-bottom-color:#f5e8d8">
        <h3 style="color:#8a4d1a">🍂 Hojicha Series</h3>
        <span class="category-badge" style="background:#f5e8d8;color:#8a4d1a">${hojichaList.length} items</span>
      </div>
      <div class="category-drinks-list" id="hojicha-drinks-list"></div>
    `;
    const listEl = section.querySelector('#hojicha-drinks-list');
    hojichaList.forEach(p => listEl.appendChild(renderDrinkCard(p)));
    container.appendChild(section);
  }
}

// ── Shopee-Style Drink Customization Modal Logic ──────────────────────
let currentCustomizing = {
  productId: null,
  editingInstanceKey: null,
  matcha: null,
  sweetness: '100%',
  addOns: [],
  qty: 1,
};

window.openCustomizationModal = function (productId, instanceKeyToEdit = null) {
  const product = products.find(p => p.id === productId);
  if (!product || product.available === false) return;

  const isHojicha = (product.category === 'hojicha') || (product.name && product.name.toLowerCase().includes('hojicha'));
  const activeAddOnsList = Object.values(addOns).filter(a => a.available !== false);

  if (instanceKeyToEdit && state.items[instanceKeyToEdit]) {
    const inst = state.items[instanceKeyToEdit];
    currentCustomizing = {
      productId,
      editingInstanceKey: instanceKeyToEdit,
      matcha: inst.matcha || (matchaChoices[0] || 'Classic'),
      sweetness: inst.sweetness || '100%',
      addOns: JSON.parse(JSON.stringify(inst.addOns || [])),
      qty: inst.qty || 1,
    };
  } else {
    currentCustomizing = {
      productId,
      editingInstanceKey: null,
      matcha: product.hasMatcha ? (matchaChoices[0] || 'Classic') : null,
      sweetness: '100%',
      addOns: [],
      qty: 1,
    };
  }

  // Set modal header
  if ($('custom-modal-title')) $('custom-modal-title').textContent = (instanceKeyToEdit ? 'Edit: ' : '') + product.name;
  const imgWrap = $('custom-modal-img-wrap');
  if (imgWrap) {
    imgWrap.innerHTML = product.image
      ? `<img src="${product.image}" alt="${product.name}" onerror="this.onerror=null;this.parentElement.innerHTML='<span class=\\'product-img-fallback\\'>🍵</span>'" />`
      : `<span class="product-img-fallback">🍵</span>`;
  }

  // 1. Matcha Cultivars (only if product has matcha)
  const matchaSec = $('custom-matcha-section');
  const matchaChips = $('custom-matcha-chips');
  if (product.hasMatcha && matchaChoices.length > 0) {
    if (matchaSec) matchaSec.style.display = '';
    if (matchaChips) {
      matchaChips.innerHTML = matchaChoices.map(c => `
        <button type="button" class="custom-choice-chip ${c === currentCustomizing.matcha ? 'active' : ''}"
          onclick="window.selectCustomMatcha('${c.replace(/'/g, "\\'")}')">
          🍵 ${c}
        </button>
      `).join('');
    }
  } else {
    if (matchaSec) matchaSec.style.display = 'none';
  }

  // 2. Sweetness Level (0%, 25%, 50%, 75%, 100%)
  const sweetnessBtns = $('custom-sweetness-buttons');
  if (sweetnessBtns) {
    sweetnessBtns.innerHTML = SWEETNESS_OPTS.map(s => `
      <button type="button" class="sweetness-chip ${s === currentCustomizing.sweetness ? 'active' : ''}"
        onclick="window.selectCustomSweetness('${s}')">
        ${s}
      </button>
    `).join('');
  }
  if ($('custom-sweetness-selected')) $('custom-sweetness-selected').textContent = `${currentCustomizing.sweetness} Sweet`;

  // 3. Add-ons
  const filteredAddOns = activeAddOnsList.filter(a => {
    if (isHojicha) {
      if (a.id === 'extra-shot') return false;
      if (a.id !== 'extra-matcha-gram' && a.name.toLowerCase().includes('matcha')) return false;
    } else {
      if (a.name.toLowerCase().includes('hojicha')) return false;
    }
    return true;
  });

  const addonsSec = $('custom-addons-section');
  const addonsList = $('custom-addons-list');
  if (filteredAddOns.length > 0) {
    if (addonsSec) addonsSec.style.display = '';
    if (addonsList) {
      addonsList.innerHTML = filteredAddOns.map(a => {
        const isQty = a.type === 'quantity' || a.id.includes('gram') ||
          (a.name && a.name.toLowerCase().includes('per gram')) ||
          (a.name && a.name.toLowerCase().includes('matcha'));
        const existing = currentCustomizing.addOns.find(item => item.id === a.id);
        const currentGramQty = existing ? (existing.qty || 1) : 0;
        const isChecked = Boolean(existing);
        const displayName = (isHojicha && a.id === 'extra-matcha-gram') ? 'Extra Hojicha per gram' : a.name;

        if (isQty) {
          return `
            <div class="custom-addon-item ${currentGramQty > 0 ? 'selected' : ''}" id="custom-addon-${a.id}">
              <div class="custom-addon-info">
                <span class="custom-addon-name">${displayName}</span>
                <span class="custom-addon-price">+₱${a.price}/g</span>
              </div>
              <div class="custom-addon-stepper">
                <button type="button" class="custom-addon-stepper-btn" onclick="window.stepCustomAddOnQty('${a.id}', -1)" ${currentGramQty === 0 ? 'disabled' : ''}>−</button>
                <span class="custom-addon-stepper-qty" id="custom-addon-qty-${a.id}">${currentGramQty}g</span>
                <button type="button" class="custom-addon-stepper-btn" onclick="window.stepCustomAddOnQty('${a.id}', 1)">+</button>
              </div>
            </div>
          `;
        }

        return `
          <label class="custom-addon-item ${isChecked ? 'selected' : ''}" id="custom-addon-${a.id}">
            <div class="custom-addon-info">
              <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="window.toggleCustomAddOn('${a.id}')" />
              <span class="custom-addon-name">${displayName}</span>
            </div>
            <span class="custom-addon-price">+₱${a.price}</span>
          </label>
        `;
      }).join('');
    }
  } else {
    if (addonsSec) addonsSec.style.display = 'none';
  }

  // 4. Quantity Stepper
  const qtySec = $('custom-qty-section');
  if (qtySec) {
    qtySec.style.display = 'flex';
  }
  if ($('custom-qty-value')) $('custom-qty-value').textContent = currentCustomizing.qty;
  if ($('custom-qty-minus')) $('custom-qty-minus').disabled = currentCustomizing.qty <= 1;

  // Submit button text
  if ($('custom-submit-text')) {
    $('custom-submit-text').textContent = instanceKeyToEdit ? 'Update Cart' : 'Add to Cart';
  }

  updateCustomModalPrice();

  // Show modal
  $('customization-backdrop')?.classList.remove('hidden');
  $('customization-modal')?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
};

window.closeCustomizationModal = function () {
  $('customization-backdrop')?.classList.add('hidden');
  $('customization-modal')?.classList.add('hidden');
  document.body.style.overflow = '';
};

window.selectCustomMatcha = function (choice) {
  currentCustomizing.matcha = choice;
  document.querySelectorAll('#custom-matcha-chips .custom-choice-chip').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.includes(choice));
  });
  updateCustomModalPrice();
};

window.selectCustomSweetness = function (level) {
  currentCustomizing.sweetness = level;
  document.querySelectorAll('#custom-sweetness-buttons .sweetness-chip').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.trim() === level);
  });
  if ($('custom-sweetness-selected')) $('custom-sweetness-selected').textContent = `${level} Sweet`;
};

window.toggleCustomAddOn = function (addOnId) {
  const addOn = addOns[addOnId];
  if (!addOn) return;
  const product = products.find(p => p.id === currentCustomizing.productId);
  const isHojicha = (product?.category === 'hojicha') || (product?.name && product.name.toLowerCase().includes('hojicha'));
  const displayName = (isHojicha && addOnId === 'extra-matcha-gram') ? 'Extra Hojicha per gram' : addOn.name;

  const idx = currentCustomizing.addOns.findIndex(a => a.id === addOnId);
  const itemEl = $(`custom-addon-${addOnId}`);

  if (idx >= 0) {
    currentCustomizing.addOns.splice(idx, 1);
    itemEl?.classList.remove('selected');
  } else {
    currentCustomizing.addOns.push({
      id: addOn.id,
      name: displayName,
      price: addOn.price,
      qty: 1,
      unit: addOn.unit || '',
    });
    itemEl?.classList.add('selected');
  }

  updateCustomModalPrice();
};

window.stepCustomAddOnQty = function (addOnId, delta) {
  const addOn = addOns[addOnId];
  if (!addOn) return;
  const product = products.find(p => p.id === currentCustomizing.productId);
  const isHojicha = (product?.category === 'hojicha') || (product?.name && product.name.toLowerCase().includes('hojicha'));
  const displayName = (isHojicha && addOnId === 'extra-matcha-gram') ? 'Extra Hojicha per gram' : addOn.name;

  const existing = currentCustomizing.addOns.find(a => a.id === addOnId);
  const curQty = existing ? (existing.qty || 1) : 0;
  const newQty = Math.max(0, curQty + delta);

  if (newQty === 0) {
    currentCustomizing.addOns = currentCustomizing.addOns.filter(a => a.id !== addOnId);
  } else if (existing) {
    existing.qty = newQty;
  } else {
    currentCustomizing.addOns.push({
      id: addOn.id,
      name: displayName,
      price: addOn.price,
      qty: newQty,
      unit: addOn.unit || 'g',
    });
  }

  const itemEl = $(`custom-addon-${addOnId}`);
  if (itemEl) {
    itemEl.classList.toggle('selected', newQty > 0);
    const decBtn = itemEl.querySelector('.custom-addon-stepper-btn');
    if (decBtn) decBtn.disabled = newQty === 0;
  }
  const qtyEl = $(`custom-addon-qty-${addOnId}`);
  if (qtyEl) qtyEl.textContent = `${newQty}g`;

  updateCustomModalPrice();
};

window.stepCustomQty = function (delta) {
  currentCustomizing.qty = Math.max(1, currentCustomizing.qty + delta);
  if ($('custom-qty-value')) $('custom-qty-value').textContent = currentCustomizing.qty;
  if ($('custom-qty-minus')) $('custom-qty-minus').disabled = currentCustomizing.qty <= 1;
  updateCustomModalPrice();
};

function updateCustomModalPrice() {
  const product = products.find(p => p.id === currentCustomizing.productId) || { price: 0 };
  const addOnTotal = (currentCustomizing.addOns || []).reduce((sum, a) => sum + ((a.price || 0) * (a.qty || 1)), 0);
  const singleCupTotal = (product.price || 0) + addOnTotal;
  const grandTotal = singleCupTotal * (currentCustomizing.qty || 1);

  if ($('custom-modal-price')) $('custom-modal-price').textContent = `₱${singleCupTotal.toLocaleString()}`;
  if ($('custom-submit-price')) $('custom-submit-price').textContent = `₱${grandTotal.toLocaleString()}`;
}

window.submitCustomization = function () {
  const { productId, editingInstanceKey, matcha, sweetness, addOns, qty } = currentCustomizing;
  const product = products.find(p => p.id === productId);
  if (!product) return;

  const targetKey = getVariationKey(productId, matcha, sweetness, addOns);
  const chosenQty = Math.max(1, qty || 1);

  if (editingInstanceKey) {
    if (editingInstanceKey === targetKey) {
      // Same options: update fields and quantity
      state.items[targetKey] = {
        productId,
        matcha,
        sweetness,
        addOns: JSON.parse(JSON.stringify(addOns)),
        qty: chosenQty,
      };
    } else {
      // Options changed: remove old key, add/merge to new targetKey
      delete state.items[editingInstanceKey];
      if (state.items[targetKey]) {
        state.items[targetKey].qty = (state.items[targetKey].qty || 1) + chosenQty;
      } else {
        state.items[targetKey] = {
          productId,
          matcha,
          sweetness,
          addOns: JSON.parse(JSON.stringify(addOns)),
          qty: chosenQty,
        };
      }
    }
    showToast('✓ Cart item updated!');
  } else {
    // Adding to cart: if already exists with same options, increment quantity
    if (state.items[targetKey]) {
      state.items[targetKey].qty = (state.items[targetKey].qty || 1) + chosenQty;
    } else {
      state.items[targetKey] = {
        productId,
        matcha,
        sweetness,
        addOns: JSON.parse(JSON.stringify(addOns)),
        qty: chosenQty,
      };
    }
    const msg = chosenQty > 1
      ? `✓ Added ${chosenQty}x ${product.name} to cart! 🛒`
      : `✓ Added ${product.name} to cart! 🛒`;
    showToast(msg);
  }

  const wasEditing = Boolean(editingInstanceKey);
  window.closeCustomizationModal();
  updateSummary();
  buildProductList();
  if (wasEditing) {
    window.openCartDrawer();
  } else if (!$('cart-drawer')?.classList.contains('hidden')) {
    window.renderCartDrawer();
  }
};

// ── Shopee-Style Shopping Cart Drawer Logic ───────────────────────────
window.openCartDrawer = function () {
  window.renderCartDrawer();
  $('cart-drawer-backdrop')?.classList.remove('hidden');
  $('cart-drawer')?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
};

window.closeCartDrawer = function () {
  $('cart-drawer-backdrop')?.classList.add('hidden');
  $('cart-drawer')?.classList.add('hidden');
  document.body.style.overflow = '';
};

window.renderCartDrawer = function () {
  const container = $('cart-drawer-body');
  if (!container) return;

  const allItems = Object.entries(state.items);
  const totalQty = getTotalCartQty();

  if ($('cart-drawer-count')) $('cart-drawer-count').textContent = `${totalQty} drink${totalQty === 1 ? '' : 's'}`;
  if ($('cart-drawer-btn-count')) $('cart-drawer-btn-count').textContent = `(${totalQty})`;

  if (allItems.length === 0) {
    container.innerHTML = `
      <div class="cart-empty-state">
        <div class="cart-empty-icon">🍵</div>
        <div class="cart-empty-title">Your cart is empty</div>
        <div class="cart-empty-sub">Explore our handcrafted matcha drinks and add your favorites to get started!</div>
        <button type="button" class="btn-browse-menu" onclick="window.continueShopping()">Browse Menu</button>
      </div>
    `;
    if ($('cart-drawer-subtotal')) $('cart-drawer-subtotal').textContent = '₱0';
    const checkoutBtn = $('cart-drawer-checkout-btn');
    if (checkoutBtn) checkoutBtn.disabled = true;
    return;
  }

  const checkoutBtn = $('cart-drawer-checkout-btn');
  if (checkoutBtn) checkoutBtn.disabled = false;

  let subtotal = 0;
  const itemsHtml = allItems.map(([variationKey, v]) => {
    const product = products.find(p => p.id === v.productId) || { name: 'Matcha Drink', price: 0 };
    const addOnTotal = (v.addOns || []).reduce((sum, a) => sum + ((a.price || 0) * (a.qty || 1)), 0);
    const unitPrice = (product.price || 0) + addOnTotal;
    const qty = v.qty || 1;
    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;

    let opts = [];
    if (v.matcha) opts.push(v.matcha);
    if (v.sweetness) opts.push(`${v.sweetness} sweet`);
    if (v.addOns && v.addOns.length) {
      opts.push('+ ' + v.addOns.map(a => {
        const qtyStr = (a.qty && a.qty > 1) ? ` (${a.qty}${a.unit || 'x'})` : '';
        const totalPrice = (a.price || 0) * (a.qty || 1);
        return `${a.name}${qtyStr} (₱${totalPrice})`;
      }).join(', '));
    }

    const safeKey = variationKey.replace(/'/g, "\\'");

    const thumbHtml = product.image
      ? `<img src="${product.image}" alt="${product.name}" class="cart-item-img" onerror="this.onerror=null;this.parentElement.innerHTML='<span class=\\'product-img-fallback\\'>🍵</span>'" />`
      : `<div class="cart-item-img"><span class="product-img-fallback">🍵</span></div>`;

    return `
      <div class="cart-item-card" id="cart-item-${variationKey}">
        <div class="cart-item-top">
          ${thumbHtml}
          <div class="cart-item-details">
            <div class="cart-item-title">${product.name}</div>
            <div class="cart-item-options-chip">${opts.join(' · ')}</div>
          </div>
        </div>
        <div class="cart-item-bottom">
          <div class="cart-item-price-block">
            <div class="cart-item-total-price">₱${lineTotal.toLocaleString()}</div>
            ${qty > 1 ? `<div class="cart-item-unit-price">₱${unitPrice.toLocaleString()} each</div>` : ''}
          </div>
          <div class="cart-item-controls">
            <div class="cart-item-stepper">
              <button type="button" class="cart-stepper-btn" onclick="window.changeCartItemQty('${safeKey}', -1)" aria-label="Decrease quantity">−</button>
              <span class="cart-stepper-qty">${qty}</span>
              <button type="button" class="cart-stepper-btn" onclick="window.changeCartItemQty('${safeKey}', 1)" aria-label="Increase quantity">+</button>
            </div>
            <div class="cart-item-actions">
              <button type="button" class="cart-action-btn" onclick="window.editCartItem('${safeKey}')" title="Edit customization">
                ✏️ Edit
              </button>
              <button type="button" class="cart-action-btn btn-remove" onclick="window.removeCartItem('${safeKey}')" title="Remove from cart">
                🗑️
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const addMoreBtn = `
    <button type="button" class="cart-add-more-row" onclick="window.continueShopping()">
      <span>🍵</span> <span>＋ Add more drinks from menu</span>
    </button>
  `;

  container.innerHTML = itemsHtml + addMoreBtn;
  if ($('cart-drawer-subtotal')) $('cart-drawer-subtotal').textContent = `₱${subtotal.toLocaleString()}`;
};

window.continueShopping = function () {
  window.closeCartDrawer();
  window.nextWizardStep(1);
  const menuEl = $('menu-categories-nav') || $('product-list');
  if (menuEl) {
    menuEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

window.changeCartItemQty = function (variationKey, delta) {
  if (!variationKey || !state.items[variationKey]) return;
  const item = state.items[variationKey];
  const newQty = (item.qty || 1) + delta;

  if (newQty <= 0) {
    const product = products.find(p => p.id === item.productId);
    const name = product ? product.name : 'item';
    if (confirm(`Remove ${name} from your cart?`)) {
      delete state.items[variationKey];
      showToast('Item removed from cart');
    }
  } else {
    item.qty = newQty;
  }

  updateSummary();
  buildProductList();
  window.renderCartDrawer();
};

window.removeCartItem = function (variationKey) {
  if (!variationKey || !state.items[variationKey]) return;
  delete state.items[variationKey];
  updateSummary();
  buildProductList();
  window.renderCartDrawer();
  showToast('Item removed from cart');
};

window.editCartItem = function (variationKey) {
  if (!variationKey || !state.items[variationKey]) return;
  window.closeCartDrawer();
  window.openCustomizationModal(state.items[variationKey].productId, variationKey);
};

window.duplicateDrinkInstance = function (variationKey) {
  window.changeCartItemQty(variationKey, 1);
  showToast('✓ Added another cup! 🍵');
};

window.confirmClearCart = function () {
  if (Object.keys(state.items).length === 0) return;
  if (confirm('Are you sure you want to clear your cart?')) {
    state.items = {};
    updateSummary();
    buildProductList();
    window.renderCartDrawer();
    showToast('Cart cleared');
  }
};

window.checkoutFromCart = function () {
  if (Object.keys(state.items).length === 0) {
    showToast('⚠️ Please select at least one drink before checkout.');
    return;
  }
  window.closeCartDrawer();
  window.nextWizardStep(2);
};

// ── Backward-Compatible Controls ─────────────────────────────────────
window.getProductInstances = function (productId) {
  return Object.keys(state.items).filter(k => state.items[k].productId === productId);
};

window.getLastInstance = function (productId) {
  const instances = window.getProductInstances(productId);
  return instances.length > 0 ? instances[instances.length - 1] : null;
};

window.addDrinkInstance = function (productId) {
  window.openCustomizationModal(productId);
};

window.removeDrinkInstance = function (instanceKey) {
  window.removeCartItem(instanceKey);
};

window.updateOption = function (instanceKey, field, value) {
  if (state.items[instanceKey]) {
    state.items[instanceKey][field] = value;
    updateSummary();
  }
};

// ── Delivery Location Map Picker (Leaflet) ───────────────────────────
let deliveryMap = null;
let deliveryMarker = null;
const DEFAULT_MAP_CENTER = [17.601133, 120.612134]; // Studio Midori Base Location
const DEFAULT_MAP_ZOOM = 15;

function initDeliveryMap() {
  if (deliveryMap) {
    deliveryMap.invalidateSize();
    return;
  }

  const mapEl = $('delivery-map');
  if (!mapEl || typeof L === 'undefined') return;

  try {
    const existingLat = $('delivery-lat')?.value;
    const existingLng = $('delivery-lng')?.value;
    const center = (existingLat && existingLng) ? [parseFloat(existingLat), parseFloat(existingLng)] : DEFAULT_MAP_CENTER;

    deliveryMap = L.map('delivery-map', {
      zoomControl: true,
      attributionControl: false,
    }).setView(center, DEFAULT_MAP_ZOOM);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(deliveryMap);

    if (existingLat && existingLng) {
      setDeliveryPin(existingLat, existingLng, false); // place visual marker
    }

    // Click on map to place/move marker
    deliveryMap.on('click', (e) => {
      setDeliveryPin(e.latlng.lat, e.latlng.lng, true);
    });

    // Setup GPS button
    $('btn-use-gps')?.addEventListener('click', locateUserWithGPS);

    // Setup address search autocomplete
    setupAddressAutocomplete();
  } catch (err) {
    console.warn('Map initialization failed:', err);
  }
}

function setDeliveryPin(lat, lng, shouldReverseGeocode = false) {
  const latFixed = Number(lat).toFixed(6);
  const lngFixed = Number(lng).toFixed(6);

  if ($('delivery-lat')) $('delivery-lat').value = latFixed;
  if ($('delivery-lng')) $('delivery-lng').value = lngFixed;

  const statusEl = $('pin-coords-display');
  if (statusEl) {
    statusEl.innerHTML = `<strong>${latFixed}, ${lngFixed}</strong> <a href="https://www.google.com/maps?q=${latFixed},${lngFixed}" target="_blank" rel="noopener" class="map-link-btn">View Map ↗</a>`;
  }

  // Update visual marker if map is ready
  if (deliveryMap && typeof L !== 'undefined') {
    if (deliveryMarker) {
      deliveryMarker.setLatLng([lat, lng]);
    } else {
      deliveryMarker = L.marker([lat, lng], { draggable: true }).addTo(deliveryMap);
      deliveryMarker.on('dragend', (ev) => {
        const pos = ev.target.getLatLng();
        setDeliveryPin(pos.lat, pos.lng, true);
      });
    }
  }

  // Reverse geocode via free Nominatim API to suggest/fill address if blank
  if (shouldReverseGeocode) {
    reverseGeocode(lat, lng);
  }

  // Always recalculate the delivery fee based on distance from store
  calculateDistanceFee(lat, lng);
}

// ── Distance-based Delivery Fee ──────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateDistanceFee(lat, lng) {
  const km = haversineKm(STORE_LAT, STORE_LNG, lat, lng);
  DELIVERY_FEE = Math.round(FEE_BASE + FEE_PER_KM * km);

  isOutsideDeliveryLimit = false;
  const limitEnabled = storeSettings.limitDeliveryArea;
  const maxKm = storeSettings.deliveryMaxKm || 5;

  if (limitEnabled && km > maxKm) {
    isOutsideDeliveryLimit = true;
  }

  // Update distance label in the order summary
  const distEl = $('summary-delivery-dist');
  if (distEl) {
    if (isOutsideDeliveryLimit) {
      distEl.innerHTML = `<span style="color:#dc2626; font-weight:bold;">(${km.toFixed(1)} km) Out of range! Max ${maxKm} km.</span>`;
    } else {
      distEl.innerHTML = `(${km.toFixed(1)} km)`;
    }
    distEl.style.display = '';
  }

  updateSummary();
}

async function reverseGeocode(lat, lng) {
  const addressInput = $('delivery-address');
  if (!addressInput) return;

  // Show a loading hint so the user knows something is happening
  const prev = addressInput.value;
  addressInput.placeholder = '🔍 Fetching address…';
  addressInput.disabled = true;

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1`,
      { headers: { 'Accept': 'application/json', 'Accept-Language': 'en' } }
    );
    if (!res.ok) throw new Error('Nominatim error');
    const data = await res.json();

    if (data && data.address) {
      const a = data.address;
      // Build a readable local address: house number + road + suburb/village + city
      const parts = [
        a.house_number,
        a.road || a.pedestrian || a.footway,
        a.suburb || a.village || a.hamlet || a.neighbourhood,
        a.city || a.town || a.municipality || a.county,
      ].filter(Boolean);
      addressInput.value = parts.length > 0 ? parts.join(', ') : data.display_name;
    } else if (data && data.display_name) {
      addressInput.value = data.display_name;
    } else {
      addressInput.value = prev; // restore on no result
    }
  } catch (e) {
    console.debug('Reverse geocode note:', e);
    addressInput.value = prev; // restore on error
  } finally {
    addressInput.placeholder = 'Street address, landmark, or barangay…';
    addressInput.disabled = false;
    addressInput.focus();
  }
}

// ── Address Autocomplete (forward geocode as-you-type) ─────────────────
let _addressSearchTimer = null;

function setupAddressAutocomplete() {
  const input = $('delivery-address');
  const list = $('address-suggestions');
  if (!input || !list) return;

  function hideSuggestions() {
    list.style.display = 'none';
    list.innerHTML = '';
  }

  function showSuggestions(results) {
    if (!results.length) { hideSuggestions(); return; }
    list.innerHTML = results.map((r, i) => `
      <li data-idx="${i}"
        style="
          padding:10px 14px;
          cursor:pointer;
          font-size:13px;
          border-bottom:1px solid var(--border);
          line-height:1.4;
          transition:background .12s;
        "
        onmouseover="this.style.background='var(--green-50,#f0fdf4)'"
        onmouseout="this.style.background=''"
      >
        <span style="font-weight:700;color:var(--green-800)">&#x1F4CD; ${r.label}</span>
        ${r.sublabel ? `<br><span style="color:var(--text-soft);font-size:11px">${r.sublabel}</span>` : ''}
      </li>
    `).join('');
    list.style.display = 'block';

    list.querySelectorAll('li').forEach((li, i) => {
      li.addEventListener('mousedown', (e) => {
        e.preventDefault(); // prevent blur before click
        const r = results[i];
        input.value = r.label;
        hideSuggestions();

        // Pan & pin the map
        if (r.lat && r.lng) {
          if (deliveryMap) deliveryMap.setView([r.lat, r.lng], 16);
          setDeliveryPin(r.lat, r.lng, false); // address already filled, skip reverse geocode
        }
      });
    });
  }

  async function fetchSuggestions(query) {
    try {
      // Bias search toward Bangued, Abra area
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&addressdetails=1&limit=6&countrycodes=ph&viewbox=120.4,17.8,120.9,17.3&bounded=0`;
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'Accept-Language': 'en' }
      });
      if (!res.ok) return;
      const data = await res.json();

      const results = data.map(item => {
        const a = item.address || {};
        const labelParts = [
          a.road || a.pedestrian || item.name,
          a.suburb || a.village || a.hamlet || a.neighbourhood,
          a.city || a.town || a.municipality || a.county,
          a.province,
        ].filter(Boolean);
        const label = labelParts.join(', ') || item.display_name;
        const sublabel = a.province || a.state || '';
        return { label, sublabel: sublabel !== labelParts.at(-1) ? sublabel : '', lat: parseFloat(item.lat), lng: parseFloat(item.lon) };
      });

      showSuggestions(results);
    } catch (e) {
      console.debug('Address search error:', e);
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(_addressSearchTimer);
    const q = input.value.trim();
    if (q.length < 3) { hideSuggestions(); return; }
    _addressSearchTimer = setTimeout(() => fetchSuggestions(q), 350); // debounce 350ms
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideSuggestions();
  });

  // Hide on click outside
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !list.contains(e.target)) hideSuggestions();
  });
}


function locateUserWithGPS() {
  const gpsBtn = $('btn-use-gps');
  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your browser.');
    return;
  }

  if (gpsBtn) {
    gpsBtn.disabled = true;
    gpsBtn.textContent = '⏳ Locating…';
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      if (deliveryMap) {
        deliveryMap.setView([lat, lng], 16);
      }
      setDeliveryPin(lat, lng, true);
      showToast('📍 Location pinned successfully!');
      if (gpsBtn) {
        gpsBtn.disabled = false;
        gpsBtn.textContent = '📍 Use My Current Location';
      }
    },
    (err) => {
      console.warn('Geolocation error:', err);
      showToast('Could not access your location. Please tap directly on the map to pin.');
      if (gpsBtn) {
        gpsBtn.disabled = false;
        gpsBtn.textContent = '📍 Use My Current Location';
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

// ── Delivery Toggle ──────────────────────────────────────────────────
function setupDeliveryToggle() {
  function applyDeliveryType(type) {
    state.deliveryType = type;
    const deliveryFields = $('delivery-fields');
    const pickupFields = $('pickup-fields');
    const timeLabel = $('preferred-time-label');
    const whenSub = $('when-card-sub');
    const timeModalTitle = $('time-modal-title');
    const successDateLabel = $('success-date-label');

    if (type === 'delivery') {
      deliveryFields?.classList.remove('hidden');
      pickupFields?.classList.add('hidden');
      if (timeLabel) timeLabel.innerHTML = 'Delivery Time <span class="required">*</span>';
      if (whenSub) whenSub.textContent = 'Pick your preferred date & delivery time';
      if (timeModalTitle) timeModalTitle.textContent = 'Choose Delivery Time';
      if (successDateLabel) successDateLabel.textContent = 'Date & Delivery Time';
      setTimeout(() => {
        initDeliveryMap();
        if (deliveryMap) deliveryMap.invalidateSize(true);
      }, 350);
    } else {
      deliveryFields?.classList.add('hidden');
      pickupFields?.classList.remove('hidden');
      if (timeLabel) timeLabel.innerHTML = 'Pick-up Time <span class="required">*</span>';
      if (whenSub) whenSub.textContent = 'Pick your preferred date & pick-up time';
      if (timeModalTitle) timeModalTitle.textContent = 'Choose Pick-up Time';
      if (successDateLabel) successDateLabel.textContent = 'Date & Pick-up Time';
    }
    updateSummary();
  }

  document.querySelectorAll('input[name="delivery-type"]').forEach(radio => {
    radio.addEventListener('change', e => applyDeliveryType(e.target.value));
  });

  // Sync visibility with whichever radio is already checked on load
  const checked = document.querySelector('input[name="delivery-type"]:checked');
  if (checked) applyDeliveryType(checked.value);
}

// ── Summary & Shopee Cart Sync ─────────────────────────────────────
function updateSummary() {
  const summarySection = $('order-summary');
  const allItems = Object.entries(state.items);
  const stickyCart = $('mobile-sticky-cart');
  const totalQty = getTotalCartQty();

  // 1. Update Header Cart Badge
  const headerBadge = $('header-cart-badge');
  if (headerBadge) {
    if (totalQty > 0) {
      headerBadge.textContent = totalQty;
      headerBadge.classList.remove('hidden');
      headerBadge.classList.remove('pop');
      void headerBadge.offsetWidth; // trigger reflow for animation
      headerBadge.classList.add('pop');
    } else {
      headerBadge.classList.add('hidden');
    }
  }

  // 2. Update Step 1 Checkout Button Pill
  const step1Pill = $('step-1-count-pill');
  if (step1Pill) {
    step1Pill.textContent = `${totalQty} drink${totalQty === 1 ? '' : 's'}`;
  }

  // Calculate Subtotal and build Summary Rows
  let subtotal = 0;
  const itemRows = allItems.map(([variationKey, v]) => {
    const product = products.find(p => p.id === v.productId) || { name: 'Item', price: 0 };
    const addOnTotal = (v.addOns || []).reduce((sum, a) => sum + ((a.price || 0) * (a.qty || 1)), 0);
    const unitPrice = (product.price || 0) + addOnTotal;
    const qty = v.qty || 1;
    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;

    let opts = [];
    if (v.matcha) opts.push(v.matcha);
    if (v.sweetness) opts.push(`${v.sweetness} sweet`);
    if (v.addOns && v.addOns.length) {
      opts.push('+ ' + v.addOns.map(a => {
        const qtyStr = (a.qty && a.qty > 1) ? ` (${a.qty}${a.unit || 'x'})` : '';
        const itemAddonPrice = (a.price || 0) * (a.qty || 1);
        return `${a.name}${qtyStr} (₱${itemAddonPrice})`;
      }).join(', '));
    }

    return `
      <tr>
        <td>
          <div class="summary-item-name">${product.name}${qty > 1 ? ` <span style="font-weight:700;color:var(--green-700);font-size:12px;">(×${qty})</span>` : ''}</div>
          ${opts.length ? `<div class="summary-item-detail">${opts.join(' · ')}</div>` : ''}
        </td>
        <td style="text-align:center">${qty}</td>
        <td style="text-align:right">₱${unitPrice.toLocaleString()}</td>
        <td style="text-align:right">₱${lineTotal.toLocaleString()}</td>
      </tr>
    `;
  }).join('');

  const isDelivery = state.deliveryType === 'delivery';
  const deliveryFee = isDelivery ? DELIVERY_FEE : 0;
  const total = subtotal + deliveryFee;
  const hasPinned = !!($('delivery-lat')?.value);

  // 3. Update Step 2 Quick Strip
  if ($('strip-cart-count')) $('strip-cart-count').textContent = `${totalQty} drink${totalQty === 1 ? '' : 's'}`;
  if ($('strip-cart-sub')) $('strip-cart-sub').textContent = `Subtotal: ₱${subtotal.toLocaleString()}`;

  // 4. Update Cart Drawer Counts & Subtotal
  if ($('cart-drawer-count')) $('cart-drawer-count').textContent = `${totalQty} drink${totalQty === 1 ? '' : 's'}`;
  if ($('cart-drawer-subtotal')) $('cart-drawer-subtotal').textContent = `₱${subtotal.toLocaleString()}`;
  if ($('cart-drawer-btn-count')) $('cart-drawer-btn-count').textContent = `(${totalQty})`;

  // 5. Update Step 3 Summary Table
  if (totalQty === 0) {
    summarySection?.classList.add('hidden');
    stickyCart?.classList.add('hidden');
  } else {
    summarySection?.classList.remove('hidden');
  }

  if ($('summary-items')) $('summary-items').innerHTML = itemRows;
  if ($('summary-subtotal')) $('summary-subtotal').textContent = `\u20b1${subtotal.toLocaleString()}`;
  if ($('summary-delivery-row')) $('summary-delivery-row').style.display = isDelivery ? '' : 'none';
  if ($('summary-delivery-fee')) {
    $('summary-delivery-fee').textContent = isDelivery && hasPinned
      ? `\u20b1${deliveryFee.toLocaleString()}`
      : (isDelivery ? 'Pin location' : '\u20b10');
  }
  if ($('summary-total')) $('summary-total').textContent = `\u20b1${total.toLocaleString()}`;

  // 6. Update Sticky Cart on Mobile & Desktop
  if (stickyCart) {
    if (totalQty > 0) {
      stickyCart.classList.remove('hidden');
      if ($('sticky-cart-count')) $('sticky-cart-count').textContent = `${totalQty} drink${totalQty > 1 ? 's' : ''}`;
      if ($('sticky-cart-total')) $('sticky-cart-total').textContent = `\u20b1${total.toLocaleString()}`;

      const shippingEl = $('sticky-cart-shipping');
      if (shippingEl) {
        if (isDelivery && isOutsideDeliveryLimit) {
          shippingEl.textContent = '(Out of Range)';
          shippingEl.style.color = '#dc2626';
          shippingEl.style.display = '';
        } else if (isDelivery && hasPinned && deliveryFee > 0) {
          shippingEl.textContent = `(\u20b1${subtotal.toLocaleString()} + \u20b1${deliveryFee.toLocaleString()} shipping)`;
          shippingEl.style.color = 'var(--text-soft)';
          shippingEl.style.display = '';
        } else if (isDelivery && !hasPinned) {
          shippingEl.textContent = '+ shipping (pin your location)';
          shippingEl.style.color = 'var(--green-600)';
          shippingEl.style.display = '';
        } else {
          shippingEl.style.display = 'none';
        }
      }
    } else {
      stickyCart.classList.add('hidden');
    }
  }

  // Disable checkout button if outside range
  const checkoutBtn = $('place-order-btn');
  if (checkoutBtn) {
    if (isDelivery && isOutsideDeliveryLimit) {
      checkoutBtn.disabled = true;
      checkoutBtn.textContent = 'Out of Delivery Range';
      checkoutBtn.style.background = '#d1d5db';
    } else {
      checkoutBtn.disabled = false;
      checkoutBtn.textContent = '🍵 Place Order';
      checkoutBtn.style.background = '';
    }
  }

  try { localStorage.setItem('midori_order_state', JSON.stringify(state)); } catch (e) { }
}

// ── Scheduling Rules ─────────────────────────────────────────────────
// Mon–Thu : advance orders only (tomorrow or later)
// Fri–Sun : same-day OR advance orders allowed

/** Local calendar date as YYYY-MM-DD (avoids UTC shifting the day backwards). */
function toLocalDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getTomorrowDateString() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toLocalDateString(d);
}

function getTodayDateString() {
  return toLocalDateString();
}

function getNowTimeString() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getOffsetTimeString(minutesOffset = 0) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutesOffset);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Returns true if the given date string (YYYY-MM-DD) is a weekday (Mon–Thu).
 */
function isWeekday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=Sun,1=Mon,...,6=Sat
  return day >= 1 && day <= 4; // Mon–Thu
}

/**
 * Returns true if today is a weekday (Mon–Thu) from the user's perspective, 
 * unless the admin forced "Order Now" to be enabled.
 */
function todayIsWeekday() {
  if (storeSettings.forceOrderNow) return false;
  return isWeekday(getTodayDateString());
}

function isBlackoutDate(dateStr) {
  return !!(storeSettings && Array.isArray(storeSettings.blackoutDates) && storeSettings.blackoutDates.includes(dateStr));
}

function highlightTimeError() {
  const timeInput = $('preferred-time');
  if (timeInput) {
    timeInput.focus();
    timeInput.classList.add('error-pulse');
    setTimeout(() => timeInput.classList.remove('error-pulse'), 1200);
  }
}

function setupDateTimeRules() {
  const dateInput = $('order-date');
  const timeInput = $('preferred-time');
  const hintEl = $('order-date-hint');
  const dateGroup = $('date-group');
  const timeContainer = dateGroup ? dateGroup.parentElement : null;
  const timingRadios = document.querySelectorAll('input[name="order-timing"]');

  if (!dateInput || !timeInput) return;

  // Clicking anywhere on the input opens browser's native clock picker
  timeInput.addEventListener('click', () => {
    if (typeof timeInput.showPicker === 'function') {
      try {
        timeInput.showPicker();
      } catch (err) {}
    }
  });

  function applyTimeMin() {
    if (!timeInput) return;
    const today = getTodayDateString();
    const minPrepTime = getOffsetTimeString(25);

    let effectiveMin = '09:00';
    if (dateInput.value === today) {
      effectiveMin = (minPrepTime > '09:00') ? minPrepTime : '09:00';
    }

    timeInput.min = effectiveMin;
    timeInput.max = '21:00';

    if (!timeInput.value || timeInput.value < effectiveMin) {
      if (effectiveMin <= '21:00') {
        timeInput.value = effectiveMin;
      }
    }
  }

  function applyDateMin() {
    const isTodayMode = $('timing-today')?.checked;

    if (isTodayMode) {
      if (dateGroup) dateGroup.style.display = 'none';
      if (timeContainer) timeContainer.style.gridTemplateColumns = '1fr';

      dateInput.value = getTodayDateString();
      dateInput.min = getTodayDateString();

      if (hintEl) {
        hintEl.textContent = '🕒 Ordering for today. Please allow 25-30 mins prep time.';
        hintEl.className = 'order-date-hint hint-weekend';
      }
    } else {
      if (dateGroup) dateGroup.style.display = '';
      if (timeContainer) timeContainer.style.gridTemplateColumns = '1fr 1fr';

      const tomorrow = getTomorrowDateString();
      dateInput.min = tomorrow;
      if (!dateInput.value || dateInput.value < tomorrow) {
        dateInput.value = tomorrow;
      }

      if (hintEl) {
        hintEl.textContent = '📅 Advance order for tomorrow or a later date.';
        hintEl.className = 'order-date-hint hint-advance';
      }
    }

    applyTimeMin();
    if (typeof enforceDeliveryRule === 'function') {
      enforceDeliveryRule();
    }
  }

  // Handle radio toggle
  timingRadios.forEach(radio => {
    radio.addEventListener('change', applyDateMin);
  });

  const todayIsRestricted = todayIsWeekday() || isBlackoutDate(getTodayDateString());

  // Force Advance mode if today is a weekday or a blackout date
  if (todayIsRestricted) {
    if ($('timing-advance')) $('timing-advance').checked = true;
    if ($('timing-today')) {
      $('timing-today').disabled = true;
      const labelToday = $('label-timing-today');
      if (labelToday) {
        labelToday.style.opacity = '0.5';
        labelToday.style.cursor = 'not-allowed';
        labelToday.title = isBlackoutDate(getTodayDateString()) ? 'We are closed today.' : 'Today is a weekday. Only advance orders are accepted.';
      }
    }
  } else {
    if ($('timing-today')) {
      $('timing-today').disabled = false;
      const labelToday = $('label-timing-today');
      if (labelToday) {
        labelToday.style.opacity = '1';
        labelToday.style.cursor = 'pointer';
        labelToday.title = '';
      }
    }
  }

  function enforceDeliveryRule() {
    const isAdvance = $('timing-advance')?.checked;
    const allowAdvanceDelivery = !!storeSettings.allowAdvanceDelivery;
    const deliveryRadio = $('type-delivery');
    const pickupRadio = $('type-pickup');
    const labelDelivery = $('label-type-delivery');

    if (isAdvance && !allowAdvanceDelivery) {
      if (deliveryRadio) deliveryRadio.disabled = true;
      if (labelDelivery) {
        labelDelivery.style.opacity = '0.5';
        labelDelivery.style.cursor = 'not-allowed';
        labelDelivery.title = 'Delivery is not available for advance orders.';
      }
      if (deliveryRadio && deliveryRadio.checked && pickupRadio) {
        pickupRadio.checked = true;
        pickupRadio.dispatchEvent(new Event('change'));
      }
    } else {
      if (deliveryRadio) deliveryRadio.disabled = false;
      if (labelDelivery) {
        labelDelivery.style.opacity = '1';
        labelDelivery.style.cursor = 'pointer';
        labelDelivery.title = '';
      }
    }
  }

  window.reapplyDateMin = () => {
    const restricted = todayIsWeekday() || isBlackoutDate(getTodayDateString());
    if (restricted) {
      if ($('timing-today') && !$('timing-today').disabled) {
        if ($('timing-advance')) $('timing-advance').checked = true;
        $('timing-today').disabled = true;
        const labelToday = $('label-timing-today');
        if (labelToday) {
          labelToday.style.opacity = '0.5';
          labelToday.style.cursor = 'not-allowed';
          labelToday.title = isBlackoutDate(getTodayDateString()) ? 'We are closed today.' : 'Today is a weekday. Only advance orders are accepted.';
        }
      }
    } else {
      if ($('timing-today') && $('timing-today').disabled) {
        $('timing-today').disabled = false;
        const labelToday = $('label-timing-today');
        if (labelToday) {
          labelToday.style.opacity = '1';
          labelToday.style.cursor = 'pointer';
          labelToday.title = '';
        }
      }
    }
    applyDateMin();
    enforceDeliveryRule();
  };

  applyDateMin();
  dateInput.addEventListener('change', () => {
    if (isBlackoutDate(dateInput.value)) {
      showToast('⚠️ We are closed on that date. Please choose another date.');
      dateInput.value = '';
    }
    applyDateMin();
  });

  // Real-time update: keep pushing the minimum time forward every 60 seconds
  setInterval(applyTimeMin, 60000);
}

// ── Form Validation ──────────────────────────────────────────────────
function validateForm() {
  const name = $('customer-name').value.trim();
  const mobile = $('mobile-number').value.trim().replace(/[\s-]/g, '');
  const date = $('order-date').value;
  const time = $('preferred-time').value;

  if (!name) { showToast('Please enter your name.'); $('customer-name').focus(); return false; }
  if (!mobile) { showToast('Please enter your mobile number.'); $('mobile-number').focus(); return false; }

  const phMobileRegex = /^(09|\+639|639)\d{9}$/;
  if (!phMobileRegex.test(mobile)) {
    showToast('Please enter a valid Philippine mobile number (e.g. 09123456789).');
    $('mobile-number').focus();
    return false;
  }
  if (!date) { showToast('Please choose an order date.'); $('order-date').focus(); return false; }
  if (!time) {
    showToast(state.deliveryType === 'delivery' ? 'Please choose a preferred delivery time.' : 'Please choose a preferred pick-up time.');
    highlightTimeError();
    return false;
  }

  if (time < '09:00' || time > '21:00') {
    showToast('⚠️ We only accept orders for 9:00 AM to 9:00 PM.');
    highlightTimeError();
    return false;
  }

  // ── Scheduling rule check ──────────────────────────────────────────
  const today = getTodayDateString();
  const tomorrow = getTomorrowDateString();
  const nowTime = getNowTimeString();

  if (date < today) {
    showToast('⚠️ Please choose today or a later date.');
    $('order-date').focus();
    return false;
  }

  if (isBlackoutDate(date)) {
    showToast('⚠️ We are closed on that date. Please choose another date.');
    $('order-date').focus();
    return false;
  }

  if (isWeekday(today) && !storeSettings.forceOrderNow && date < tomorrow) {
    showToast('⚠️ Weekday orders must be placed in advance (tomorrow or later).');
    $('order-date').focus();
    return false;
  }

  if (date === today) {
    const minPrepTime = getOffsetTimeString(25);
    if (time < minPrepTime) {
      showToast('⚠️ Please allow at least 25 minutes for preparation.');
      highlightTimeError();
      return false;
    }
  }

  // ── Item check ────────────────────────────────────────────────────
  if (Object.keys(state.items).length === 0) {
    showToast('Please select at least one drink.');
    return false;
  }

  if (state.deliveryType === 'delivery') {
    const lat = $('delivery-lat')?.value;
    const lng = $('delivery-lng')?.value;

    if (!lat || !lng) {
      showToast('⚠️ Please pin your delivery location on the map.');
      $('delivery-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }

    const address = $('delivery-address').value.trim();
    if (!address) {
      showToast('Please enter your delivery address / landmark.');
      $('delivery-address').focus();
      return false;
    }

    if (isOutsideDeliveryLimit) {
      const maxKm = storeSettings.deliveryMaxKm || 5;
      showToast(`⚠️ Your location is outside our maximum delivery range of ${maxKm} km. Please select pick-up.`);
      $('delivery-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
  }

  return true;
}

// ── Place Order ──────────────────────────────────────────────────────
async function placeOrder() {
  if (!validateForm()) return;

  const btn = $('place-order-btn');
  btn.disabled = true;
  btn.textContent = '🍵 Placing Order…';

  try {
    let subtotal = 0;
    const selectedItems = Object.entries(state.items)
      .map(([variationKey, v]) => {
        const product = products.find(p => p.id === v.productId) || { name: 'Custom Drink', price: 0 };
        const addOnTotal = (v.addOns || []).reduce((sum, a) => sum + ((a.price || 0) * (a.qty || 1)), 0);
        const unitPrice = (product.price || 0) + addOnTotal;
        const qty = v.qty || 1;
        const lineTotal = unitPrice * qty;
        subtotal += lineTotal;

        return {
          variationKey,
          id: product.id,
          name: product.name,
          basePrice: product.price,
          unitPrice,
          qty,
          lineTotal,
          matcha: v.matcha || null,
          sweetness: v.sweetness || null,
          addOns: v.addOns || [],
        };
      });

    const deliveryFee = state.deliveryType === 'delivery' ? DELIVERY_FEE : 0;
    const total = subtotal + deliveryFee;

    const orderNumber = await generateOrderNumber();

    const orderLat = $('delivery-lat')?.value ? parseFloat($('delivery-lat').value) : null;
    const orderLng = $('delivery-lng')?.value ? parseFloat($('delivery-lng').value) : null;

    const order = {
      orderNumber,
      timestamp: new Date().toISOString(),
      status: 'NEW',
      name: $('customer-name').value.trim(),
      mobile: $('mobile-number').value.trim().replace(/[\s-]/g, ''),
      deliveryType: state.deliveryType,
      latitude: orderLat,
      longitude: orderLng,
      mapUrl: (orderLat && orderLng) ? `https://www.google.com/maps?q=${orderLat},${orderLng}` : '',
      address: $('delivery-address')?.value.trim() || '',
      deliveryNotes: $('delivery-notes')?.value.trim() || '',
      orderDate: $('order-date').value,
      preferredTime: $('preferred-time').value,
      paymentMethod: document.querySelector('input[name="payment-method"]:checked')?.value || 'COD',
      items: selectedItems,
      subtotal,
      deliveryFee,
      total,
    };

    // Save to Firebase with a timeout
    const pushPromise = push(ref(db, 'orders'), order);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection timed out. Check your Firebase database connection or rules.')), 10000)
    );
    const pushRef = await Promise.race([pushPromise, timeoutPromise]);
    const orderKey = pushRef.key;

    // Send webhook notification (non-blocking)
    sendOrderNotification(order).catch(console.error);

    // Save active order to localStorage for returning visits
    try {
      const raw = localStorage.getItem('midori_active_order');
      let activeOrders = [];
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            activeOrders = parsed;
          } else if (parsed && parsed.key) {
            activeOrders = [parsed];
          }
        } catch (e) { }
      }

      activeOrders.push({
        key: orderKey,
        orderNumber: order.orderNumber,
        orderData: order,
        timestamp: Date.now(),
      });

      localStorage.setItem('midori_active_order', JSON.stringify(activeOrders));

      // Clear persistence after successful order
      localStorage.removeItem('midori_order_state');
      localStorage.removeItem('midori_form_state');
    } catch (e) {
      console.warn('Could not save to localStorage:', e);
    }

    showSuccessScreen(order, orderKey);

  } catch (err) {
    console.error('Order failed:', err);
    if (err.message && (err.message.includes('permission_denied') || err.message.includes('PERMISSION_DENIED'))) {
      showToast('Firebase permission denied. Please enable Write rules in Firebase Console.');
    } else {
      showToast(err.message || 'Something went wrong. Please try again.');
    }
    btn.disabled = false;
    btn.textContent = '🍵 Place Order';
  }
}

// ── Live Order Status Tracking ───────────────────────────────────────
let activeStatusUnsubscribe = null;

const STATUS_CONFIG = {
  pickup: {
    NEW: {
      badge: '🆕 Received',
      badgeClass: 'status-new',
      desc: "We've received your order! We'll begin preparing your drinks shortly.",
      stepIndex: 0,
    },
    PREPARING: {
      badge: '👩‍🍳 Preparing',
      badgeClass: 'status-preparing',
      desc: 'Whisking & crafting your matcha drinks right now! Almost ready.',
      stepIndex: 1,
    },
    READY: {
      badge: '✅ Ready for Pickup',
      badgeClass: 'status-ready',
      desc: 'Your matcha drinks are ready! You can now pick up your order at Studio Midori.',
      stepIndex: 2,
    },
    COMPLETED: {
      badge: '🎉 Completed',
      badgeClass: 'status-completed',
      desc: 'Order picked up! Thank you for ordering from Studio Midori. Enjoy your matcha! 💚',
      stepIndex: 3,
    },
  },
  delivery: {
    NEW: {
      badge: '🆕 Received',
      badgeClass: 'status-new',
      desc: "We've received your order! We'll begin preparing your drinks shortly.",
      stepIndex: 0,
    },
    PREPARING: {
      badge: '👩‍🍳 Preparing',
      badgeClass: 'status-preparing',
      desc: 'Whisking & crafting your matcha drinks right now! Getting ready for dispatch.',
      stepIndex: 1,
    },
    READY: {
      badge: '🛵 Out for Delivery',
      badgeClass: 'status-ready',
      desc: 'Your order is on the way to your delivery address! Rider is en route.',
      stepIndex: 2,
    },
    COMPLETED: {
      badge: '🎉 Completed',
      badgeClass: 'status-completed',
      desc: 'Order delivered! Thank you for ordering from Studio Midori. Enjoy your matcha! 💚',
      stepIndex: 3,
    },
  },
};

function updateStatusTracker(status, deliveryType = 'pickup') {
  const mode = deliveryType === 'delivery' ? 'delivery' : 'pickup';
  const config = (STATUS_CONFIG[mode] && STATUS_CONFIG[mode][status]) || STATUS_CONFIG[mode].NEW;

  if ($('step-ready-icon')) {
    $('step-ready-icon').textContent = mode === 'delivery' ? '🛵' : '✅';
  }
  if ($('step-ready-label')) {
    $('step-ready-label').textContent = mode === 'delivery' ? 'Delivering' : 'Ready';
  }

  const badge = $('customer-status-badge');
  if (badge) {
    badge.className = `status-current-badge ${config.badgeClass}`;
    badge.textContent = config.badge;
  }

  const desc = $('customer-status-desc');
  if (desc) {
    desc.textContent = config.desc;
  }

  const steps = [$('step-new'), $('step-preparing'), $('step-ready'), $('step-completed')];
  const lines = [$('line-1'), $('line-2'), $('line-3')];

  steps.forEach((el, idx) => {
    if (!el) return;
    el.classList.remove('active', 'completed');
    if (idx < config.stepIndex) {
      el.classList.add('completed');
    } else if (idx === config.stepIndex) {
      el.classList.add('active');
    }
  });

  lines.forEach((line, idx) => {
    if (!line) return;
    if (idx < config.stepIndex) {
      line.classList.add('completed');
    } else {
      line.classList.remove('completed');
    }
  });
}

const seenNotifications = new Set();
function notifyCustomer(orderKey, orderNumber, label) {
  const dedup = `${orderKey}_${label}`;
  if (seenNotifications.has(dedup)) return;
  seenNotifications.add(dedup);

  showToast(`Order #${orderNumber}: ${label}`);

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Studio Midori Update', {
      body: `Order #${orderNumber} status changed to: ${label}`,
      icon: '/logo.png'
    });
  }
}

function listenToOrderStatus(orderKey, deliveryType) {
  if (activeStatusUnsubscribe) {
    activeStatusUnsubscribe();
  }

  if (!orderKey) {
    updateStatusTracker('NEW', deliveryType);
    return;
  }

  const orderRef = ref(db, `orders/${orderKey}`);
  let previousStatus = null;

  activeStatusUnsubscribe = onValue(orderRef, (snapshot) => {
    if (!snapshot.exists()) {
      showToast('This order was cancelled or deleted.');

      const badge = $('customer-status-badge');
      if (badge) {
        badge.className = 'status-current-badge';
        badge.style.background = '#fee2e2';
        badge.style.color = '#991b1b';
        badge.textContent = '❌ Cancelled/Deleted';
      }

      // Remove from local storage
      try {
        let stored = JSON.parse(localStorage.getItem('midori_active_order') || '[]');
        if (Array.isArray(stored)) {
          stored = stored.filter(o => o.key !== orderKey);
          if (stored.length === 0) localStorage.removeItem('midori_active_order');
          else localStorage.setItem('midori_active_order', JSON.stringify(stored));
        } else if (stored.key === orderKey) {
          localStorage.removeItem('midori_active_order');
        }
      } catch (e) { }

      return;
    }

    updateStatusTracker(status, deliveryType);

    if (previousStatus && previousStatus !== status) {
      const mode = deliveryType === 'delivery' ? 'delivery' : 'pickup';
      const label = STATUS_CONFIG[mode][status]?.badge || status;
      // We don't have orderNumber here natively, so we just use a generic 'Update'
      // or we can just pass the orderKey. The banner listener will have the orderNumber.
      notifyCustomer(orderKey, '(See Tracker)', label);
    }
    previousStatus = status;
  }, (err) => {
    console.warn('Real-time status listener error:', err);
    updateStatusTracker('NEW', deliveryType);
  });
}

// ── Customer Chat ───────────────────────────────────────────────────
let customerChatUnsubscribe = null;

function initCustomerChat(orderKey) {
  const messagesContainer = $('customer-chat-messages');
  const badge = $('customer-chat-badge');
  const sendBtn = $('customer-chat-send');
  const inputEl = $('customer-chat-input');
  const chatBody = $('customer-chat-body');

  if (!messagesContainer || !sendBtn || !inputEl) return;
  if (customerChatUnsubscribe) customerChatUnsubscribe();

  const chatRef = ref(db, `chats/${orderKey}`);

  customerChatUnsubscribe = onValue(chatRef, (snapshot) => {
    messagesContainer.innerHTML = '';
    let unreadCount = 0;

    if (snapshot.exists()) {
      const messages = snapshot.val();
      // sort by timestamp or relies on Firebase key order
      Object.keys(messages).forEach(key => {
        const msg = messages[key];
        const div = document.createElement('div');
        div.className = `chat-msg ${msg.sender === 'customer' ? 'customer-msg' : 'admin-msg'}`;
        div.textContent = msg.text;
        messagesContainer.appendChild(div);

        if (msg.sender === 'admin' && !msg.read) unreadCount++;
      });
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } else {
      messagesContainer.innerHTML = `<div class="chat-msg admin-msg">Hi! Let us know if you have any questions or changes to your order. 🍵</div>`;
    }

    if (chatBody && chatBody.classList.contains('hidden') && unreadCount > 0) {
      badge.textContent = unreadCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  });

  sendBtn.onclick = () => {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.disabled = true; sendBtn.disabled = true;

    push(chatRef, { sender: 'customer', text: text, timestamp: Date.now(), read: false })
      .then(() => { inputEl.value = ''; })
      .catch(err => { console.error(err); showToast('Failed to send message.'); })
      .finally(() => { inputEl.disabled = false; sendBtn.disabled = false; inputEl.focus(); });
  };

  inputEl.onkeypress = (e) => { if (e.key === 'Enter') sendBtn.click(); };
}

window.toggleCustomerChat = function () {
  const body = $('customer-chat-body');
  if (body) {
    body.classList.toggle('hidden');
    if (!body.classList.contains('hidden')) {
      $('customer-chat-badge').classList.add('hidden');
      setTimeout(() => $('customer-chat-input').focus(), 100);
    }
  }
};

// ── Success Screen ───────────────────────────────────────────────────
function showSuccessScreen(order, orderKey) {
  $('order-form-area').classList.add('hidden');
  $('mobile-sticky-cart')?.classList.add('hidden');

  const screen = $('success-screen');
  screen.classList.remove('hidden');
  screen.classList.add('visible');

  // Ask for notification permission if not yet decided
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  $('success-order-number').textContent = order.orderNumber;
  $('success-customer-name').textContent = order.name;
  $('success-mobile').textContent = order.mobile;

  const typeLabel = order.deliveryType === 'pickup'
    ? '🏪 Pickup'
    : '🛵 Delivery';
  $('success-type').textContent = typeLabel;

  const locRow = $('success-location-row');
  if (locRow) {
    if (order.deliveryType === 'delivery' && (order.latitude || order.mapUrl)) {
      locRow.classList.remove('hidden');
      const lat = order.latitude ? Number(order.latitude).toFixed(5) : '';
      const lng = order.longitude ? Number(order.longitude).toFixed(5) : '';
      const mapLink = order.mapUrl || (lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : '');
      $('success-location').innerHTML = `📍 ${lat ? `${lat}, ${lng} · ` : ''}${mapLink ? `<a href="${mapLink}" target="_blank" rel="noopener" style="color:var(--green-700);text-decoration:underline;font-weight:700">Open in Maps ↗</a>` : 'Pinned'}`;
    } else {
      locRow.classList.add('hidden');
    }
  }

  $('success-date').textContent = formatDate(order.orderDate) + ' @ ' + formatTime(order.preferredTime);

  const itemLines = order.items.map(i => {
    let parts = [`${i.name} ×${i.qty}`];
    if (i.matcha) parts.push(i.matcha);
    if (i.sweetness) parts.push(`${i.sweetness} sweet`);
    if (i.addOns && i.addOns.length) {
      parts.push('+ ' + i.addOns.map(a => {
        const qtyStr = (a.qty && a.qty > 1) ? ` (${a.qty}${a.unit || 'x'})` : '';
        const totalPrice = (a.price || 0) * (a.qty || 1);
        return `${a.name}${qtyStr} (₱${totalPrice})`;
      }).join(', '));
    }
    return parts.join(' · ');
  }).join('<br>');
  $('success-items').innerHTML = itemLines;

  $('success-subtotal').textContent = `₱${order.subtotal.toLocaleString()}`;
  $('success-delivery-fee').textContent = order.deliveryFee > 0
    ? `₱${order.deliveryFee.toLocaleString()}`
    : 'Free';
  $('success-total').textContent = `₱${order.total.toLocaleString()}`;

  // Start real-time status listener
  listenToOrderStatus(orderKey, order.deliveryType);
  initCustomerChat(orderKey);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Active Order Banner for Returning Visits ──────────────────────────
function checkActiveOrder() {
  try {
    const raw = localStorage.getItem('midori_active_order');
    if (!raw) return;

    let activeOrders = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        activeOrders = parsed;
      } else if (parsed && parsed.key) {
        // Migration from object to array
        activeOrders = [parsed];
      }
    } catch (e) { }

    // If order was placed in last 12 hours, keep it
    const twelveHours = 12 * 60 * 60 * 1000;
    const now = Date.now();
    const validOrders = activeOrders.filter(active => (now - active.timestamp) <= twelveHours);

    if (validOrders.length === 0) {
      localStorage.removeItem('midori_active_order');
      const container = $('active-order-banner-container');
      if (container) container.innerHTML = '';
      return;
    }

    if (validOrders.length !== activeOrders.length) {
      localStorage.setItem('midori_active_order', JSON.stringify(validOrders));
    }

    const container = $('active-order-banner-container');
    if (!container) return;

    container.innerHTML = validOrders.map((active, index) => `
      <div class="active-order-banner" id="active-banner-${index}" style="margin-bottom: 8px; transition: opacity 0.3s;">
        <div>
          <strong>🍵 Order in Progress (#${active.orderNumber})</strong>
          <div id="banner-status-text-${index}" style="font-size:13px;font-weight:700;margin-top:2px;">Loading live status...</div>
        </div>
        <button class="active-order-banner-btn" id="view-active-order-btn-${index}">View Status ↗</button>
      </div>
    `).join('');

    // Track previous status for notifications per active order
    const bannerPreviousStatuses = {};

    validOrders.forEach((active, index) => {
      $(`view-active-order-btn-${index}`)?.addEventListener('click', () => {
        showSuccessScreen(active.orderData, active.key);
      });

      // Subscribe to real-time status updates for the banner
      if (active.key) {
        const orderRef = ref(db, `orders/${active.key}`);
        onValue(orderRef, (snapshot) => {
          const data = snapshot.exists() ? snapshot.val() : null;
          const status = data ? (data.status || 'NEW') : 'DELETED';
          if (!data || status === 'COMPLETED' || status === 'CANCELLED') {
            const bannerDiv = $(`active-banner-${index}`);
            if (bannerDiv) {
              bannerDiv.style.opacity = '0';
              setTimeout(() => {
                bannerDiv.remove();
                if (container.children.length === 0) {
                  container.innerHTML = '';
                }
              }, 300);
            }

            // Remove from local storage
            try {
              let stored = JSON.parse(localStorage.getItem('midori_active_order') || '[]');
              if (Array.isArray(stored)) {
                stored = stored.filter(o => o.key !== active.key);
                if (stored.length === 0) localStorage.removeItem('midori_active_order');
                else localStorage.setItem('midori_active_order', JSON.stringify(stored));
              } else if (stored.key === active.key) {
                localStorage.removeItem('midori_active_order');
              }
            } catch (e) { }
            return;
          }
          const deliveryType = active.orderData?.deliveryType || 'pickup';
          const mode = deliveryType === 'delivery' ? 'delivery' : 'pickup';

          const config = (STATUS_CONFIG[mode] && STATUS_CONFIG[mode][status]) || STATUS_CONFIG[mode].NEW;
          const statusEl = $(`banner-status-text-${index}`);
          if (statusEl) {
            statusEl.textContent = config.badge;
          }

          // Trigger push notification if status changes (and not on first load)
          if (bannerPreviousStatuses[active.key] && bannerPreviousStatuses[active.key] !== status) {
            notifyCustomer(active.key, active.orderNumber, config.badge);
          }
          bannerPreviousStatuses[active.key] = status;
        }, (err) => {
          console.warn('Banner status listener error:', err);
        });
      }
    });
  } catch (e) {
    console.error('Error loading active order from storage:', e);
  }
}

// ── Utility ──────────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '—';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function showToast(message) {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── Init ─────────────────────────────────────────────────────────────


// ── Form State Persistence ───────────────────────────────────────────
const FORM_FIELDS = [
  'customer-name', 'mobile-number',
  'order-date', 'preferred-time',
  'delivery-lat', 'delivery-lng', 'delivery-address', 'delivery-notes'
];
function saveFormState() {
  const formData = {};
  FORM_FIELDS.forEach(id => { const el = $(id); if (el) formData[id] = el.value; });
  try { localStorage.setItem('midori_form_state', JSON.stringify(formData)); } catch (e) { }
}
function restoreFormState() {
  try {
    const saved = JSON.parse(localStorage.getItem('midori_form_state'));
    if (saved) {
      FORM_FIELDS.forEach(id => { const el = $(id); if (el && saved[id]) el.value = saved[id]; });
    }
  } catch (e) { }
}

// Call the listener during init
document.addEventListener('DOMContentLoaded', () => {
  restoreFormState();
  $('order-form-area')?.addEventListener('input', saveFormState);
  $('order-form-area')?.addEventListener('change', saveFormState);

  // Request notifications on load
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }


  buildProductList();
  setupDeliveryToggle();
  listenToMenu();
  checkActiveOrder();
  updateSummary(); // sync cart badge and totals on initial load

  $('header-cart-btn')?.addEventListener('click', () => {
    window.openCartDrawer();
  });

  // ESC key dismisses modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('customization-modal')?.classList.contains('hidden')) {
        window.closeCustomizationModal();
      } else if (!$('cart-drawer')?.classList.contains('hidden')) {
        window.closeCartDrawer();
      }
    }
  });

  $('place-order-btn').addEventListener('click', placeOrder);

  $('sticky-cart-btn')?.addEventListener('click', () => {
    if (!$('wizard-step-1').classList.contains('hidden')) {
      window.nextWizardStep(2);
    } else if (!$('wizard-step-2').classList.contains('hidden')) {
      window.nextWizardStep(3);
    } else {
      // Step 3: Trigger Place Order
      $('place-order-btn')?.click();
    }
  });

  $('new-order-btn').addEventListener('click', () => {
    location.reload();
  });

  // Apply date/time scheduling rules (weekdays = advance only, Fri–Sun = same-day allowed)
  setupDateTimeRules();

  // Payment Method toggles
  document.querySelectorAll('input[name="payment-method"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const gcash = $('gcash-instructions');
      if (!gcash) return;
      if (e.target.value === 'GCash') {
        gcash.classList.remove('hidden');
      } else {
        gcash.classList.add('hidden');
      }
    });

  });
});

// ── Wizard Navigation ──
window.nextWizardStep = function (step) {
  if (step === 2) {
    if (Object.keys(state.items).length === 0) {
      showToast('⚠️ Please select at least one drink before continuing.');
      return;
    }
  } else if (step === 3) {
    // Validate Step 2 (Logistics) before going to Step 3
    const date = $('order-date').value;
    const time = $('preferred-time').value;

    if (!date) { showToast('Please choose an order date.'); $('order-date').focus(); return false; }
    if (!time) {
      showToast(state.deliveryType === 'delivery' ? 'Please choose a preferred delivery time.' : 'Please choose a preferred pick-up time.');
      highlightTimeError();
      return false;
    }

    if (time < '09:00' || time > '21:00') {
      showToast('⚠️ We only accept orders for 9:00 AM to 9:00 PM.');
      highlightTimeError();
      return false;
    }

    const today = getTodayDateString();
    const tomorrow = getTomorrowDateString();

    if (date < today) {
      showToast('⚠️ Please choose today or a later date.');
      $('order-date').focus();
      return false;
    }
    if (isBlackoutDate(date)) {
      showToast('⚠️ We are closed on that date. Please choose another date.');
      $('order-date').focus();
      return false;
    }
    if (isWeekday(today) && !storeSettings.forceOrderNow && date < tomorrow) {
      showToast('⚠️ Weekday orders must be placed in advance (tomorrow or later).');
      $('order-date').focus();
      return false;
    }
    if (date === today) {
      const minPrepTime = getOffsetTimeString(25);
      if (time < minPrepTime) {
        showToast('⚠️ Please allow at least 25 minutes for preparation.');
        highlightTimeError();
        return false;
      }
    }

    if (state.deliveryType === 'delivery') {
      const lat = $('delivery-lat')?.value;
      const lng = $('delivery-lng')?.value;
      if (!lat || !lng) {
        showToast('⚠️ Please pin your delivery location on the map.');
        $('delivery-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return false;
      }
      const address = $('delivery-address').value.trim();
      if (!address) {
        showToast('Please enter your delivery address / landmark.');
        $('delivery-address').focus();
        return false;
      }
    }
  }

  document.querySelectorAll('.wizard-step').forEach(el => {
    el.classList.add('hidden');
  });

  const target = document.getElementById(`wizard-step-${step}`);
  if (target) {
    target.classList.remove('hidden');
    // Scroll to the top of the form area
    const formArea = document.getElementById('order-form-area');
    if (formArea) {
      const topOffset = formArea.getBoundingClientRect().top + window.scrollY - 20;
      window.scrollTo({ top: topOffset, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
};
