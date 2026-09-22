import type { AutoReplySettings as AutoReplySettingsRow } from '@prisma/client';
import type { AutoReplySettings, UpdateAutoReplySettingsInput } from '@leados/shared';
import { conflict } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { toAutoReplySettings } from '../../lib/serializers.js';
import { currentProvider } from '../ai/index.js';
import { cancelAllAutoReplies } from './instagram.autoreply.js';

export const AUTO_REPLY_SETTINGS_ID = 1;

export const getAutoReplySettings = (): Promise<AutoReplySettingsRow> =>
  prisma.autoReplySettings.upsert({
    where: { id: AUTO_REPLY_SETTINGS_ID },
    create: { id: AUTO_REPLY_SETTINGS_ID },
    update: {},
  });

export async function getAutoReplySettingsDto(): Promise<AutoReplySettings> {
  return toAutoReplySettings(await getAutoReplySettings(), currentProvider());
}

export async function updateAutoReplySettings(
  input: UpdateAutoReplySettingsInput,
): Promise<AutoReplySettings> {
  const ai = currentProvider();
  if ((input.dmEnabled || input.commentsEnabled) && ai.provider === 'rules')
    throw conflict('Add a Gemini, Groq or OpenAI API key to turn on AI replies.');
  await getAutoReplySettings();
  const updated = await prisma.autoReplySettings.update({
    where: { id: AUTO_REPLY_SETTINGS_ID },
    data: input,
  });
  if (!updated.dmEnabled || !updated.commentsEnabled)
    cancelAllAutoReplies({ dms: !updated.dmEnabled, comments: !updated.commentsEnabled });
  return toAutoReplySettings(updated, ai);
}
