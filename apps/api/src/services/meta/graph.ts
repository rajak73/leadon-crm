/**
 * Meta Graph API outbound send (BRD §11.2, §16). Only called for REAL
 * (non-simulation) messages when credentials exist. Returns the external
 * message id on success, or throws (caller marks the message FAILED — §11.3).
 */
import { config } from '../../config.js';

const GRAPH_VERSION = 'v21.0';

/** Send a WhatsApp text message via the Cloud API. */
export async function sendWhatsApp(toPhone: string, body: string): Promise<string> {
  const { waPhoneNumberId, waAccessToken } = config.meta;
  if (!waPhoneNumberId || !waAccessToken) throw new Error('WhatsApp credentials not configured');

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${waPhoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${waAccessToken}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toPhone,
      type: 'text',
      text: { body },
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`WhatsApp send failed ${res.status}: ${err.slice(0, 200)}`);
  }
  const data: any = await res.json();
  return data.messages?.[0]?.id ?? 'unknown';
}

/**
 * Send an Instagram/Messenger message via the Send API.
 * `pageAccessToken` is per-page; falls back to the app-level token if provided
 * via env in future. `recipientId` is the IG-scoped / PSID user id.
 */
export async function sendMessengerLike(
  recipientId: string,
  body: string,
  pageAccessToken: string
): Promise<string> {
  if (!pageAccessToken) throw new Error('Page access token not configured');
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: body },
      messaging_type: 'RESPONSE',
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Messenger send failed ${res.status}: ${err.slice(0, 200)}`);
  }
  const data: any = await res.json();
  return data.message_id ?? 'unknown';
}
