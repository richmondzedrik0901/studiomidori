/**
 * app.js – Studio Midori Order Page Logic (Category Separation & Add-ons)
 */

import { db } from './firebase.js';
import {
  ref, push, get, onValue, set,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js';
import { sendOrderNotification } from './notification.js';

const SWEETNESS_OPTS = ['0%', '25%', '50%', '75%', '100%'];
let DELIVERY_FEE = 60;

// ── Dynamic Menu State ────────────────────────────────────────────────
let products = [];        // loaded from Firebase only
let matchaChoices = [];   // loaded from Firebase only
let addOns = {};          // loaded from Firebase only
let selectedCategory = 'all'; // 'all', 'matcha', 'hojicha'

const state = {
  // keyed by instanceKey = `${productId}__${n}`, value = { productId, instanceIndex, matcha, sweetness, addOns[] }
  items: {},
  deliveryType: 'pickup',
};

// Returns all instance keys for a given productId, sorted
function getProductInstances(productId) {
  return Object.keys(state.items)
    .filter(k => state.items[k].productId === productId)
    .sort();
}

// How many instances does a product have?
function getProductQty(productId) {
  return getProductInstances(productId).length;
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

  const activeAddOnsList = Object.values(addOns).filter(a => a.available !== false);

  // ── Build add-ons HTML for a specific instance ──────────────────────
  function buildAddOnsHtml(p, instanceKey) {
    if (activeAddOnsList.length === 0) return '';
    const selectedAddOns = state.items[instanceKey]?.addOns || [];
    const isHojichaProduct = p.category === 'hojicha';

    const filteredAddOns = activeAddOnsList.filter(a => {
      if (isHojichaProduct) {
        if (a.id === 'extra-shot') return false;
        if (a.id !== 'extra-matcha-gram' && a.name.toLowerCase().includes('matcha')) return false;
      } else {
        if (a.name.toLowerCase().includes('hojicha')) return false;
      }
      return true;
    });

    const pillsHtml = filteredAddOns.map(a => {
      const isQty = a.type === 'quantity' || a.id.includes('gram') ||
        (a.name && a.name.toLowerCase().includes('per gram')) ||
        (a.name && a.name.toLowerCase().includes('matcha'));
      const selectedItem = selectedAddOns.find(item => item.id === a.id);
      const currentGramQty = selectedItem ? (selectedItem.qty || 1) : 0;
      const isChecked = Boolean(selectedItem);
      const displayName = (isHojichaProduct && a.id === 'extra-matcha-gram') ? 'Extra Hojicha per gram' : a.name;
      const safeKey = instanceKey.replace(/'/g, "\\'");

      if (isQty) {
        return `
          <div class="addon-pill quantity-addon ${currentGramQty > 0 ? 'is-active' : ''}" id="addon-ctrl-${instanceKey}-${a.id}">
            <span>${displayName}</span>
            <span class="addon-price-tag">+₱${a.price}/g</span>
            <div class="addon-stepper">
              <button type="button" class="addon-stepper-btn"
                onclick="changeDrinkAddOnQty('${safeKey}', '${a.id}', -1)"
                ${currentGramQty === 0 ? 'disabled' : ''} title="Decrease grams">−</button>
              <span class="addon-stepper-qty" id="addon-qty-${instanceKey}-${a.id}">${currentGramQty}g</span>
              <button type="button" class="addon-stepper-btn"
                onclick="changeDrinkAddOnQty('${safeKey}', '${a.id}', 1)"
                title="Add more grams">+</button>
            </div>
          </div>`;
      }

      return `
        <label class="addon-pill">
          <input type="checkbox" ${isChecked ? 'checked' : ''}
            onchange="toggleDrinkAddOn('${safeKey}', '${a.id}')" />
          <span>${a.name}</span>
          <span class="addon-price-tag">+₱${a.price}</span>
        </label>`;
    }).join('');

    return `
      <div class="addons-section">
        <div class="addons-label">✨ Optional Add-ons</div>
        <div class="addons-grid">${pillsHtml}</div>
      </div>`;
  }

  // ── Render one instance panel (a single cup) ─────────────────────────
  function renderInstancePanel(p, instanceKey, instanceIndex, totalInstances) {
    const inst = state.items[instanceKey];
    if (!inst) return '';
    const currentMatcha = inst.matcha || (matchaChoices[0] || 'Classic');
    const currentSweetness = inst.sweetness || '100%';
    const safeKey = instanceKey.replace(/'/g, "\\'");
    const label = totalInstances > 1 ? `Cup ${instanceIndex + 1}` : 'Your Cup';
    const canRemove = totalInstances > 1;

    return `
      <div class="cup-instance-panel" id="cup-panel-${instanceKey}">
        <div class="cup-instance-header">
          <span class="cup-instance-label">🍵 ${label}</span>
          ${canRemove ? `<button type="button" class="cup-remove-btn" onclick="removeDrinkInstance('${safeKey}')" title="Remove this cup">✕ Remove</button>` : ''}
        </div>
        <div class="product-options-grid">
          ${p.hasMatcha ? `
          <div class="form-group">
            <label for="matcha-${instanceKey}">🍵 Matcha Cultivar</label>
            <select id="matcha-${instanceKey}" onchange="updateOption('${safeKey}', 'matcha', this.value)">
              ${matchaChoices.map(c => `<option value="${c}" ${c === currentMatcha ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>` : ''}
          <div class="form-group">
            <label for="sweetness-${instanceKey}">🍬 Sweetness</label>
            <select id="sweetness-${instanceKey}" onchange="updateOption('${safeKey}', 'sweetness', this.value)">
              ${SWEETNESS_OPTS.map(s => `<option value="${s}" ${s === currentSweetness ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>
        ${buildAddOnsHtml(p, instanceKey)}
      </div>`;
  }

  // ── Render the full product card (with all instances) ────────────────
  function renderDrinkCard(p) {
    const isAvail = p.available !== false;
    const instances = getProductInstances(p.id);
    const qty = instances.length;
    const hasQty = qty > 0;

    const div = document.createElement('div');
    div.className = `product-item ${hasQty ? 'has-qty' : ''} ${isAvail ? '' : 'sold-out'}`;
    div.id = `product-${p.id}`;

    const thumbHtml = p.image
      ? `<img src="${p.image}" alt="${p.name}" class="product-img" loading="lazy" onerror="this.onerror=null;this.parentElement.innerHTML='<span class=\\'product-img-fallback\\'>🍵</span>'" />`
      : `<span class="product-img-fallback">🍵</span>`;

    const instancePanelsHtml = instances.map((key, idx) =>
      renderInstancePanel(p, key, idx, instances.length)
    ).join('');

    div.innerHTML = `
      <div class="product-card-inner">
        <div class="product-img-wrap">${thumbHtml}</div>
        <div class="product-details">
          <div class="product-name">${p.name}</div>
          ${p.description ? `<div class="product-desc">${p.description}</div>` : ''}
          <div class="product-price-row">
            <div class="product-price">₱${(p.price || 0).toLocaleString()}</div>
            ${isAvail ? `
            <div class="qty-control">
              <button class="qty-btn" id="btn-minus-${p.id}" onclick="removeDrinkInstance(getLastInstance('${p.id}'))" ${qty === 0 ? 'disabled' : ''} aria-label="Remove a cup">−</button>
              <span class="qty-display" id="qty-${p.id}">${qty}</span>
              <button class="qty-btn" id="btn-plus-${p.id}" onclick="addDrinkInstance('${p.id}')" aria-label="Add a cup">+</button>
            </div>` : `<span class="sold-out-badge">Sold Out</span>`}
          </div>
        </div>
      </div>

      <div class="product-options ${hasQty ? '' : 'hidden'}" id="opts-${p.id}">
        <div id="instances-${p.id}">
          ${instancePanelsHtml}
        </div>
        ${isAvail && hasQty ? `
        <button type="button" class="add-another-cup-btn" onclick="addDrinkInstance('${p.id}')">
          ＋ Add Another Cup
        </button>` : ''}
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

// ── Per-Instance Controls ────────────────────────────────────────────

/** Get the last added instance key for a product (for the − button) */
window.getLastInstance = function (productId) {
  const instances = getProductInstances(productId);
  return instances.length > 0 ? instances[instances.length - 1] : null;
};

/** Add a new cup instance for a product */
window.addDrinkInstance = function (productId) {
  const existing = getProductInstances(productId);
  // Copy last instance's settings as defaults
  const last = existing.length > 0 ? state.items[existing[existing.length - 1]] : null;
  const n = existing.length; // new index
  const instanceKey = `${productId}__${n}`;

  state.items[instanceKey] = {
    productId,
    instanceIndex: n,
    matcha: last?.matcha || (matchaChoices[0] || 'Classic'),
    sweetness: last?.sweetness || '100%',
    addOns: [],  // new cup starts with no add-ons
  };

  // Rebuild the whole card so instance panels & buttons are in sync
  _rebuildProductCard(productId);
  updateSummary();
};

/** Remove a specific cup instance */
window.removeDrinkInstance = function (instanceKey) {
  if (!instanceKey || !state.items[instanceKey]) return;
  const productId = state.items[instanceKey].productId;
  delete state.items[instanceKey];

  // Re-index remaining instances so keys stay sequential
  const remaining = getProductInstances(productId);
  const reindexed = {};
  remaining.forEach((key, newIdx) => {
    const data = state.items[key];
    const newKey = `${productId}__${newIdx}`;
    reindexed[newKey] = { ...data, instanceIndex: newIdx };
    delete state.items[key];
  });
  Object.assign(state.items, reindexed);

  _rebuildProductCard(productId);
  updateSummary();
};

/** Re-render just the product card in place (avoids full buildProductList rebuild) */
function _rebuildProductCard(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;

  const activeAddOnsList = Object.values(addOns).filter(a => a.available !== false);

  // We need to call renderDrinkCard but it's scoped inside buildProductList.
  // Instead, rebuild via buildProductList which will re-render everything.
  buildProductList();
}

window.updateOption = function (instanceKey, field, value) {
  if (state.items[instanceKey]) {
    state.items[instanceKey][field] = value;
  }
};

window.toggleDrinkAddOn = function (instanceKey, addOnId) {
  if (!state.items[instanceKey]) return;

  const addOn = addOns[addOnId];
  if (!addOn) return;

  const inst = state.items[instanceKey];
  const product = products.find(p => p.id === inst.productId);
  const isHojicha = product?.category === 'hojicha';
  const displayName = (isHojicha && addOnId === 'extra-matcha-gram') ? 'Extra Hojicha per gram' : addOn.name;

  const currentAddOns = inst.addOns || [];
  const exists = currentAddOns.some(a => a.id === addOnId);

  if (exists) {
    inst.addOns = currentAddOns.filter(a => a.id !== addOnId);
  } else {
    inst.addOns = [
      ...currentAddOns,
      { id: addOn.id, name: displayName, price: addOn.price, qty: 1, unit: addOn.unit || '' }
    ];
  }

  updateSummary();
};

window.changeDrinkAddOnQty = function (instanceKey, addOnId, delta) {
  if (!state.items[instanceKey]) return;

  const addOn = addOns[addOnId];
  if (!addOn) return;

  const inst = state.items[instanceKey];
  const product = products.find(p => p.id === inst.productId);
  const isHojicha = product?.category === 'hojicha';
  const displayName = (isHojicha && addOnId === 'extra-matcha-gram') ? 'Extra Hojicha per gram' : addOn.name;

  const currentAddOns = inst.addOns || [];
  const existing = currentAddOns.find(a => a.id === addOnId);
  const currentQty = existing ? (existing.qty || 1) : 0;
  const newQty = Math.max(0, currentQty + delta);

  if (newQty === 0) {
    inst.addOns = currentAddOns.filter(a => a.id !== addOnId);
  } else if (existing) {
    existing.qty = newQty;
  } else {
    inst.addOns = [
      ...currentAddOns,
      { id: addOn.id, name: displayName, price: addOn.price, qty: newQty, unit: addOn.unit || 'g' }
    ];
  }

  // Update UI elements for stepper pill
  const qtyDisplay = $(`addon-qty-${instanceKey}-${addOnId}`);
  if (qtyDisplay) {
    const unit = addOn.unit || 'g';
    qtyDisplay.textContent = `${newQty}${unit}`;
  }

  const pillCtrl = $(`addon-ctrl-${instanceKey}-${addOnId}`);
  if (pillCtrl) {
    if (newQty > 0) {
      pillCtrl.classList.add('is-active');
    } else {
      pillCtrl.classList.remove('is-active');
    }
    const decBtn = pillCtrl.querySelector('.addon-stepper-btn');
    if (decBtn) {
      decBtn.disabled = newQty === 0;
    }
  }

  updateSummary();
};

// ── Delivery Location Map Picker (Leaflet) ───────────────────────────
let deliveryMap = null;
let deliveryMarker = null;
const DEFAULT_MAP_CENTER = [17.5951, 120.6185]; // Bangued, Abra, Philippines
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
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.display_name) {
      const addressInput = $('delivery-address');
      if (addressInput && !addressInput.value.trim()) {
        addressInput.value = data.display_name;
      }
    }
  } catch (e) {
    // Non-blocking reverse geocode failure
    console.debug('Reverse geocode note:', e);
  }
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
  document.querySelectorAll('input[name="delivery-type"]').forEach(radio => {
    radio.addEventListener('change', e => {
      state.deliveryType = e.target.value;
      const deliveryFields = $('delivery-fields');
      const pickupFields = $('pickup-fields');
      
      if (state.deliveryType === 'delivery') {
        deliveryFields?.classList.remove('hidden');
        pickupFields?.classList.add('hidden');
        // Initialize or recalculate map layout when shown
        setTimeout(() => {
          initDeliveryMap();
          if (deliveryMap) deliveryMap.invalidateSize();
        }, 100);
      } else {
        deliveryFields?.classList.add('hidden');
        pickupFields?.classList.remove('hidden');
      }
      updateSummary();
    });
  });
}

// ── Summary & Mobile Sticky Cart ─────────────────────────────────────
function updateSummary() {
  const summarySection = $('order-summary');
  // Collect all instances (each is qty:1)
  const allInstances = Object.entries(state.items);

  const stickyCart = $('mobile-sticky-cart');
  const totalQty = allInstances.length;

  if (totalQty === 0) {
    summarySection?.classList.add('hidden');
    stickyCart?.classList.add('hidden');
    return;
  }

  summarySection?.classList.remove('hidden');

  let subtotal = 0;
  const itemRows = allInstances.map(([instanceKey, v]) => {
    const product = products.find(p => p.id === v.productId) || { name: 'Item', price: 0 };
    const addOnTotal = (v.addOns || []).reduce((sum, a) => sum + ((a.price || 0) * (a.qty || 1)), 0);
    const unitPrice = (product.price || 0) + addOnTotal;
    subtotal += unitPrice;

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

    // Cup label: only show "Cup N" if product has multiple instances
    const productInstances = getProductInstances(v.productId);
    const cupLabel = productInstances.length > 1
      ? ` <span style="font-size:11px;opacity:0.6">(Cup ${v.instanceIndex + 1})</span>`
      : '';

    return `
      <tr>
        <td>
          <div class="summary-item-name">${product.name}${cupLabel}</div>
          ${opts.length ? `<div class="summary-item-detail">${opts.join(' · ')}</div>` : ''}
        </td>
        <td style="text-align:center">1</td>
        <td style="text-align:right">₱${unitPrice.toLocaleString()}</td>
        <td style="text-align:right">₱${unitPrice.toLocaleString()}</td>
      </tr>
    `;
  }).join('');

  const deliveryFee = state.deliveryType === 'delivery' ? DELIVERY_FEE : 0;
  const total = subtotal + deliveryFee;

  if ($('summary-items')) $('summary-items').innerHTML = itemRows;
  if ($('summary-subtotal')) $('summary-subtotal').textContent = `₱${subtotal.toLocaleString()}`;
  if ($('summary-delivery-row')) $('summary-delivery-row').style.display = deliveryFee > 0 ? '' : 'none';
  if ($('summary-delivery-fee')) $('summary-delivery-fee').textContent = `₱${deliveryFee.toLocaleString()}`;
  if ($('summary-total')) $('summary-total').textContent = `₱${total.toLocaleString()}`;

  // Update sticky cart on mobile
  if (stickyCart && totalQty > 0) {
    stickyCart.classList.remove('hidden');
    if ($('sticky-cart-count')) $('sticky-cart-count').textContent = `${totalQty} drink${totalQty > 1 ? 's' : ''}`;
    if ($('sticky-cart-total')) $('sticky-cart-total').textContent = `₱${total.toLocaleString()}`;
  }
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
 * Returns true if today is a weekday (Mon–Thu) from the user's perspective.
 */
function todayIsWeekday() {
  return isWeekday(getTodayDateString());
}

function setupDateTimeRules() {
  const dateInput = $('order-date');
  const timeInput = $('preferred-time');
  const hintEl = $('order-date-hint');
  if (!dateInput) return;

  function applyTimeMin() {
    if (!timeInput) return;
    const today = getTodayDateString();
    const minPrepTime = getOffsetTimeString(25);
    
    if (dateInput.value === today) {
      // Minimum prep time buffer for today's orders
      timeInput.min = minPrepTime;
      // Also update the value if it's empty OR if they let the time slip into the past while the page was open
      if (!timeInput.value || timeInput.value < minPrepTime) {
        timeInput.value = minPrepTime;
      }
    } else {
      timeInput.removeAttribute('min');
      // If picking an advance date and time is empty, prefill with 25 mins from now anyway
      if (!timeInput.value) {
        timeInput.value = minPrepTime;
      }
    }
  }

  function applyDateMin() {
    const minDate = todayIsWeekday() ? getTomorrowDateString() : getTodayDateString();
    dateInput.min = minDate;
    if (!dateInput.value || dateInput.value < minDate) {
      dateInput.value = minDate;
    }

    if (hintEl) {
      if (todayIsWeekday()) {
        hintEl.textContent = '📅 Weekday: advance orders only — please pick tomorrow or a later date.';
        hintEl.className = 'order-date-hint hint-advance';
      } else {
        hintEl.textContent = '🎉 Weekend: you can order for today or in advance!';
        hintEl.className = 'order-date-hint hint-weekend';
      }
    }

    applyTimeMin();
  }

  applyDateMin();
  dateInput.addEventListener('change', applyDateMin);
  timeInput?.addEventListener('change', applyTimeMin);

  // Real-time update: keep pushing the minimum time forward every 60 seconds
  // so if they stay on the page for a long time, the time doesn't get left in the past.
  setInterval(applyTimeMin, 60000);
}

// ── Form Validation ──────────────────────────────────────────────────
function validateForm() {
  const name = $('customer-name').value.trim();
  const fbName = $('fb-name').value.trim();
  const mobile = $('mobile-number').value.trim();
  const date = $('order-date').value;
  const time = $('preferred-time').value;

  if (!name) { showToast('Please enter your name.'); $('customer-name').focus(); return false; }
  if (!fbName) { showToast('Please enter your Facebook name.'); $('fb-name').focus(); return false; }
  if (!mobile) { showToast('Please enter your mobile number.'); $('mobile-number').focus(); return false; }
  if (!date) { showToast('Please choose an order date.'); $('order-date').focus(); return false; }
  if (!time) { showToast('Please choose a preferred time.'); $('preferred-time').focus(); return false; }

  // ── Scheduling rule check ──────────────────────────────────────────
  const today = getTodayDateString();
  const tomorrow = getTomorrowDateString();
  const nowTime = getNowTimeString();

  if (date < today) {
    showToast('⚠️ Please choose today or a later date.');
    $('order-date').focus();
    return false;
  }

  if (isWeekday(today) && date < tomorrow) {
    showToast('⚠️ Weekday orders must be placed in advance (tomorrow or later).');
    $('order-date').focus();
    return false;
  }

  if (date === today) {
    const minPrepTime = getOffsetTimeString(30);
    if (time < minPrepTime) {
      showToast('⚠️ Please allow at least 30 minutes for preparation.');
      $('preferred-time').focus();
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


    const address = $('delivery-address').value.trim();
    if (!address) {
      showToast('Please enter your delivery address / landmark.');
      $('delivery-address').focus();
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
      .map(([instanceKey, v]) => {
        const product = products.find(p => p.id === v.productId) || { name: 'Custom Drink', price: 0 };
        const addOnTotal = (v.addOns || []).reduce((sum, a) => sum + ((a.price || 0) * (a.qty || 1)), 0);
        const unitPrice = (product.price || 0) + addOnTotal;
        subtotal += unitPrice;

        return {
          instanceKey,
          id: product.id,
          name: product.name,
          basePrice: product.price,
          unitPrice,
          lineTotal: unitPrice,
          qty: 1,
          cupIndex: v.instanceIndex,
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
      fbName: $('fb-name').value.trim(),
      mobile: $('mobile-number').value.trim(),
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
        } catch(e) {}
      }

      activeOrders.push({
        key: orderKey,
        orderNumber: order.orderNumber,
        orderData: order,
        timestamp: Date.now(),
      });

      localStorage.setItem('midori_active_order', JSON.stringify(activeOrders));
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
      } catch(e) {}
      
      return;
    }
    const data = snapshot.val();
    const status = data.status || 'NEW';

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

window.toggleCustomerChat = function() {
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
  $('success-fb').textContent = order.fbName;

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
    } catch (e) {}

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
          if (!snapshot.exists()) {
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
            } catch(e) {}
            return;
          }
          const data = snapshot.val();
          const status = data.status || 'NEW';
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

// ── Delivery Locations Config ────────────────────────────────────────────
function listenToDeliveryFee() {
  const refDel = ref(db, 'config/deliveryLocations');
  onValue(refDel, (snapshot) => {
    const data = snapshot.val() || {};
    const select = $('delivery-area');
    if (!select) return;
    
    // Remember current selection if any
    const currentVal = select.value;
    
    let html = '<option value="">Select your area...</option>';
    let foundCurrent = false;
    
    Object.entries(data).forEach(([id, loc]) => {
      const feeText = loc.fee === 0 ? 'Free Delivery' : `+₱${loc.fee}`;
      html += `<option value="${loc.fee}">${loc.name} (${feeText})</option>`;
      if (currentVal === loc.fee.toString()) foundCurrent = true;
    });
    
    select.innerHTML = html;
    
    if (foundCurrent) {
      select.value = currentVal;
    } else {
      DELIVERY_FEE = 0; // Default until selected
    }
    updateSummary();
  }, (err) => console.warn('Could not load delivery locations:', err));
  
  const select = $('delivery-area');
  if (select) {
    select.addEventListener('change', (e) => {
      DELIVERY_FEE = Number(e.target.value) || 0;
      updateSummary();
    });
  }
}

// Call the listener during init
document.addEventListener('DOMContentLoaded', () => {
  // Request notifications on load
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Request location on load
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDeliveryPin(pos.coords.latitude, pos.coords.longitude, true);
      }, 
      (err) => console.warn('Location permission denied on load', err)
    );
  }

  buildProductList();
  setupDeliveryToggle();
  listenToMenu();
  checkActiveOrder();

  $('place-order-btn').addEventListener('click', placeOrder);

  $('sticky-cart-btn')?.addEventListener('click', () => {
    // Scroll to Order Summary (and Place Order button below it)
    const summary = $('order-summary');
    const isHidden = !summary || summary.classList.contains('hidden');
    const target = (!isHidden ? summary : null)
                   || $('customer-details-card')
                   || $('place-order-btn');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  $('new-order-btn').addEventListener('click', () => {
    location.reload();
  });

  // Apply date/time scheduling rules (weekdays = advance only, Fri–Sun = same-day allowed)
  setupDateTimeRules();
  listenToDeliveryFee();

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
