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
  // ── Paste your webhook URL here ──────────────────────────────────
  // Examples:
  //   Make.com:  https://hook.eu1.make.com/xxxxxxxxxxxx
  //   n8n:       https://your-n8n.app/webhook/xxxx
  //   Zapier:    https://hooks.zapier.com/hooks/catch/xxxx/xxxx/
  webhookUrl: import.meta.env.VITE_WEBHOOK_URL || '',  // <-- LOADED FROM .ENV

  // Set to true to log order details to the browser console (for testing)
  debugMode: true,
};

/**
 * Formats a plain-text notification message from an order object.
 */
export function formatOrderMessage(order) {
  const itemLines = order.items.map(item => {
    let line = `  • ${item.name} x${item.qty}`;
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

  return `🍵 NEW STUDIO MIDORI ORDER

Order #: ${order.orderNumber}
Customer: ${order.name}
Mobile: ${order.mobile}
FB Name: ${order.fbName}

Type: ${order.deliveryType === 'pickup' ? '🏪 Pickup' : '🛵 Delivery'}${deliveryInfo}
Date: ${order.orderDate}
${order.deliveryType === 'delivery' ? 'Delivery Time' : 'Pick-up Time'}: ${order.preferredTime}

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

  if (!NotificationConfig.webhookUrl) {
    console.warn('[Studio Midori] No webhook URL configured. Order saved locally only.');
    return { success: false, reason: 'no_webhook' };
  }

  try {
    const response = await fetch(NotificationConfig.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: message,
        order: order,
      }),
    });

    if (response.ok) {
      console.log('[Studio Midori] Notification sent successfully.');
      return { success: true };
    } else {
      console.error('[Studio Midori] Webhook returned error:', response.status);
      return { success: false, reason: 'webhook_error', status: response.status };
    }
  } catch (err) {
    console.error('[Studio Midori] Failed to send notification:', err);
    return { success: false, reason: 'network_error', error: err.message };
  }
}
