/**
 * pwa.js – Studio Midori Progressive Web App Controller
 * Handles Service Worker registration, install prompt banner, and online/offline awareness.
 */

// 1. Service Worker Registration
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          // Check for worker updates periodically
          reg.onupdatefound = () => {
            const installing = reg.installing;
            if (installing) {
              installing.onstatechange = () => {
                if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[PWA] New version of Studio Midori is available.');
                }
              };
            }
          };
        })
        .catch((err) => {
          console.warn('[PWA] Service worker registration failed:', err);
        });
    });
  }
}

// 2. Online / Offline Status Toasts
function initConnectivityListeners() {
  const showToast = (msg, icon = '🍃') => {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = `${icon} ${msg}`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  };

  window.addEventListener('online', () => {
    showToast('Back online! Menu and orders are synced in real time.', '🟢');
  });

  window.addEventListener('offline', () => {
    showToast('You are currently offline. Viewing cached menu.', '📶');
  });
}

// 3. PWA Install Prompt Banner
let deferredPrompt = null;

function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent default mini-infobar on mobile Chrome
    e.preventDefault();
    deferredPrompt = e;

    // Check if user dismissed previously in this session
    if (sessionStorage.getItem('midori_install_dismissed')) return;

    createInstallBanner();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.remove();
    console.log('[PWA] Studio Midori was successfully installed.');
  });
}

function createInstallBanner() {
  if (document.getElementById('pwa-install-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'pwa-install-banner';
  banner.className = 'pwa-install-banner';
  banner.innerHTML = `
    <div class="pwa-install-content">
      <img src="/icons/icon-192.png" alt="Studio Midori App" class="pwa-install-icon" />
      <div class="pwa-install-text">
        <div class="pwa-install-title">Install Studio Midori</div>
        <div class="pwa-install-desc">Fast ordering and real-time status on your home screen</div>
      </div>
    </div>
    <div class="pwa-install-actions">
      <button type="button" class="pwa-install-btn" id="pwa-install-btn">Install</button>
      <button type="button" class="pwa-dismiss-btn" id="pwa-dismiss-btn" aria-label="Dismiss">&times;</button>
    </div>
  `;

  document.body.appendChild(banner);

  document.getElementById('pwa-install-btn')?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      banner.remove();
    }
    deferredPrompt = null;
  });

  document.getElementById('pwa-dismiss-btn')?.addEventListener('click', () => {
    sessionStorage.setItem('midori_install_dismissed', 'true');
    banner.classList.add('hide');
    setTimeout(() => banner.remove(), 300);
  });
}

// Auto-initialize
registerServiceWorker();
initConnectivityListeners();
initInstallPrompt();
