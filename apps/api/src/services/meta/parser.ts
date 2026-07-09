/**
 * Normalize Meta webhook payloads (BRD §16) into our internal InboundPayload.
 *
 * Handles the three main shapes:
 *  - WhatsApp Cloud API: entry[].changes[].value.messages[] + contacts[]
 *  - Instagram / Messenger: entry[].messaging[] (sender/recipient/message.text)
 *  - Facebook Page messages: same messaging[] shape as Messenger
 *
 * The `recipientExternalId` (the business account/page/phone-number id) is what
 * we map to an organization via IntegrationAccount (see resolveOrg).
 */
export interface ParsedInbound {
  channel: 'INSTAGRAM' | 'WHATSAPP' | 'FACEBOOK';
  senderId: string;
  senderName?: string;
  text: string;
  messageId?: string;
  recipientExternalId?: string; // business phone-number id / page id / ig id
}

export function parseMetaPayload(body: any): ParsedInbound[] {
  const out: ParsedInbound[] = [];
  if (!body || !Array.isArray(body.entry)) return out;

  const object = body.object as string | undefined; // 'whatsapp_business_account' | 'instagram' | 'page'

  for (const entry of body.entry) {
    // ---- WhatsApp Cloud API ----
    if (Array.isArray(entry.changes)) {
      for (const change of entry.changes) {
        const value = change.value;
        if (!value?.messages) continue;
        const phoneNumberId = value.metadata?.phone_number_id;
        const contactName = value.contacts?.[0]?.profile?.name;
        for (const msg of value.messages) {
          const text = msg.text?.body ?? msg.button?.text ?? msg.interactive?.list_reply?.title ?? '';
          if (!text) continue;
          out.push({
            channel: 'WHATSAPP',
            senderId: msg.from,
            senderName: contactName,
            text,
            messageId: msg.id,
            recipientExternalId: phoneNumberId,
          });
        }
      }
    }

    // ---- Instagram / Messenger / Facebook Page ----
    if (Array.isArray(entry.messaging)) {
      const channel: ParsedInbound['channel'] = object === 'instagram' ? 'INSTAGRAM' : 'FACEBOOK';
      const recipientExternalId = entry.id; // page/ig account id
      for (const m of entry.messaging) {
        const text = m.message?.text;
        if (!text || m.message?.is_echo) continue; // skip echoes of our own sends
        out.push({
          channel,
          senderId: m.sender?.id,
          text,
          messageId: m.message?.mid,
          recipientExternalId,
        });
      }
    }
  }

  return out;
}
