import crypto from 'node:crypto';
import request from 'supertest';
import { env } from '../src/config/env.js';
import { idle } from '../src/lib/queue.js';
import { SANDBOX_ACCOUNT } from '../src/modules/instagram/index.js';
import { api, type Session, type TestApp } from './helpers.js';

export const APP_SECRET = 'test-meta-app-secret';
export const OUR_ID = SANDBOX_ACCOUNT.userId;

/** Test mode on (sandbox adapter), a known app secret, AI keys off. */
export function instagramTestEnv(): void {
  env.INSTAGRAM_TEST_MODE = true;
  env.META_APP_SECRET = APP_SECRET;
  env.META_WEBHOOK_VERIFY_TOKEN = 'verify-me';
  env.GEMINI_API_KEY = undefined;
  env.GROQ_API_KEY = undefined;
  env.OPENAI_API_KEY = undefined;
  env.AI_PROVIDER = undefined;
  env.AI_MODEL = undefined;
}

export const sign = (raw: string, secret = APP_SECRET) =>
  `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;

let midSeq = 0;
export const newMid = () => `mid_${++midSeq}_${crypto.randomUUID().slice(0, 8)}`;

export function dmPayload(
  igsid: string,
  text: string,
  opts: { mid?: string; echo?: boolean; timestamp?: number } = {},
) {
  const mid = opts.mid ?? newMid();
  return {
    object: 'instagram',
    entry: [
      {
        id: OUR_ID,
        time: Date.now(),
        messaging: [
          {
            sender: { id: opts.echo ? OUR_ID : igsid },
            recipient: { id: opts.echo ? igsid : OUR_ID },
            timestamp: opts.timestamp ?? Date.now(),
            message: { mid, text, ...(opts.echo ? { is_echo: true } : {}) },
          },
        ],
      },
    ],
  };
}

export function commentPayload(
  from: { id: string; username: string },
  text: string,
  opts: { id?: string; mediaId?: string; parentId?: string } = {},
) {
  return {
    object: 'instagram',
    entry: [
      {
        id: OUR_ID,
        time: Math.floor(Date.now() / 1000),
        changes: [
          {
            field: 'comments',
            value: {
              id: opts.id ?? `c_${crypto.randomUUID().slice(0, 8)}`,
              text,
              from,
              media: { id: opts.mediaId ?? 'media_1', media_product_type: 'FEED' },
              ...(opts.parentId ? { parent_id: opts.parentId } : {}),
            },
          },
        ],
      },
    ],
  };
}

/** Posts a signed webhook and waits for the queued processing (debounced replies stay pending). */
export async function deliver(app: TestApp, payload: object, expectStatus = 200): Promise<void> {
  const raw = JSON.stringify(payload);
  await request(app)
    .post('/api/webhooks/instagram')
    .set('content-type', 'application/json')
    .set('x-hub-signature-256', sign(raw))
    .send(raw)
    .expect(expectStatus);
  await idle();
  await idle();
}

export async function connectTestAccount(app: TestApp, admin: Session): Promise<void> {
  await api(app, admin)
    .post('/instagram/connect', { accessToken: 'IGAA-test-token-that-is-long-enough' })
    .expect(200);
}
