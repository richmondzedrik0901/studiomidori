/**
 * notification.js – Modular Notification System for Studio Midori
 *
 * Currently sends order data to a configurable webhook URL.
 * To connect: paste your Make.com / n8n / Zapier webhook URL below.
 *
 * The webhook will receive a POST request with the full order JSON.
 * You can then forward it to Messenger, email, SMS, etc. from your
 * automation platform without any code changes here.
 *
 * Facebook Messenger API (via Meta) requires app review and is not
 * suitable for simple MVP notifications. Use a webhook + automation
 * platform instead.
 */

const NotificationConfig = {
  // ── Telegram Configuration ───────────────────────────────────────
  telegramBotToken: import.meta.env.VITE_TELEGRAM_BOT_TOKEN || '',
  telegramChatId: import.meta.env.VITE_TELEGRAM_CHAT_ID || '',

  // Set to true to log order details to the browser console (for testing)
  debugMode: true,
};

/**
 * Formats a 24-hour time string ("HH:MM") into 12-hour format with AM/PM.
 * e.g., "13:30" -> "1:30 PM", "09:00" -> "9:00 AM".
 */
export function formatTime(timeStr) {
  if (!timeStr) return '—';
  if (/am|pm/i.test(timeStr)) return timeStr;
  const parts = String(timeStr).trim().split(':');
  if (parts.length < 2) return timeStr;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return timeStr;
  const ampm = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Formats a plain-text notification message from an order object.
 */
export function formatOrderMessage(order) {
  const itemLines = order.items.map(item => {
    let line = `  • ${item.name} x${item.qty}`;
    if (item.size) line += ` [${item.size}]`;
    if (item.matcha) line += ` (${item.matcha})`;
    if (item.sweetness) line += ` – ${item.sweetness} sweet`;
    if (item.addOns && item.addOns.length) {
      const addOnList = item.addOns.map(a => {
        const qtyStr = (a.qty && a.qty > 1) ? ` (${a.qty}${a.unit || 'x'})` : '';
        return `${a.name}${qtyStr}`;
      }).join(', ');
      line += ` [Add-ons: ${addOnList}]`;
    }
    const unitP = item.unitPrice || item.price || 0;
    line += ` = ₱${(unitP * item.qty).toLocaleString()}`;
    return line;
  }).join('\n');

  const mapLink = order.mapUrl || ((order.latitude && order.longitude)
    ? `https://www.google.com/maps?q=${order.latitude},${order.longitude}`
    : '');

  let deliveryInfo = '';
  if (order.deliveryType === 'delivery') {
    deliveryInfo = `\nAddress: ${order.address || '—'}`;
    if (order.latitude && order.longitude) {
      deliveryInfo += `\nPinned Location: ${order.latitude}, ${order.longitude}`;
    }
    if (mapLink) {
      deliveryInfo += `\nMap Link: ${mapLink}`;
    }
  }

  let paymentInfo = `Payment: ${order.paymentMethod === 'GCash' ? '📱 GCash' : '💵 Cash / COD'}`;
  if (order.paymentMethod !== 'GCash' && order.cashAmount) {
    paymentInfo += ` (Paying ₱${order.cashAmount.toLocaleString()}`;
    if (order.changeAmount && order.changeAmount > 0) {
      paymentInfo += ` → Prepare Change: ₱${order.changeAmount.toLocaleString()})`;
    } else {
      paymentInfo += ` → Exact amount)`;
    }
  }

  return `🍵 NEW STUDIO MIDORI ORDER

Order #: ${order.orderNumber}
Customer: ${order.name}
Mobile: ${order.mobile}
FB Name: ${order.fbName}

Type: ${order.deliveryType === 'pickup' ? '🏪 Pickup' : '🛵 Delivery'}${deliveryInfo}
Date: ${order.orderDate}
${order.deliveryType === 'delivery' ? 'Delivery Time' : 'Pick-up Time'}: ${formatTime(order.preferredTime)}
${paymentInfo}

Items:
${itemLines}

Subtotal: ₱${order.subtotal.toLocaleString()}
${order.deliveryFee > 0 ? `Delivery Fee: ₱${order.deliveryFee.toLocaleString()}\n` : ''}Total: ₱${order.total.toLocaleString()}
`;
}

/**
 * Sends a notification for a new order.
 * This function is modular – swap the body for different providers.
 */
export async function sendOrderNotification(order) {
  const message = formatOrderMessage(order);

  if (NotificationConfig.debugMode) {
    console.log('[Studio Midori] New order notification:\n', message);
  }

  if (!NotificationConfig.telegramBotToken || !NotificationConfig.telegramChatId) {
    console.warn('[Studio Midori] Telegram credentials not configured. Order saved locally only.');
    return { success: false, reason: 'no_credentials' };
  }

  const telegramUrl = `https://api.telegram.org/bot${NotificationConfig.telegramBotToken}/sendMessage`;

  try {
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: NotificationConfig.telegramChatId,
        text: message,
      }),
    });

    if (response.ok) {
      console.log('[Studio Midori] Telegram notification sent successfully.');
      return { success: true };
    } else {
      console.error('[Studio Midori] Telegram API returned error:', response.status);
      return { success: false, reason: 'telegram_api_error', status: response.status };
    }
  } catch (err) {
    console.error('[Studio Midori] Failed to send Telegram notification:', err);
    return { success: false, reason: 'network_error', error: err.message };
  }
}
