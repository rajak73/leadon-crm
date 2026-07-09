/**
 * Map a Meta account id (business phone-number id / page id / IG account id)
 * to a LeadOS organization (BRD §16 "maps account to organization").
 */
import { prisma } from '../../prisma.js';

export async function resolveOrgByRecipient(
  provider: 'INSTAGRAM' | 'WHATSAPP' | 'FACEBOOK',
  recipientExternalId: string | undefined
): Promise<string | null> {
  if (!recipientExternalId) return null;
  const integration = await prisma.integrationAccount.findFirst({
    where: { provider, externalId: recipientExternalId, isConnected: true },
  });
  return integration?.organizationId ?? null;
}
