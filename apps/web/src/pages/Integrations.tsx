import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Camera, CheckCircle2, XCircle, Plug, AlertTriangle, UserSearch } from 'lucide-react';
import { api } from '../lib/api';
import { Card, Badge, EmptyState, Skeleton, SkeletonRows, Modal } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

interface Account {
  id: string; provider: string; externalId: string; displayName?: string | null;
  isConnected: boolean; hasAccessToken: boolean;
}
interface Platform {
  instagram: boolean; instagramOAuthConfigured: boolean; whatsapp: boolean; facebook: boolean;
  webhookVerifyTokenSet: boolean; appSecretSet: boolean;
}
interface EligiblePage { pageId: string; pageName: string; igUsername?: string; igUserId: string; }

export default function Integrations() {
  const { currentOrg } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<{ subscribedFields: string[]; hasComments: boolean; hasMessages: boolean } | null>(null);
  const [checkingWebhook, setCheckingWebhook] = useState(false);
  const [fixingWebhook, setFixingWebhook] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const canManage = currentOrg?.role === 'OWNER' || currentOrg?.role === 'ADMIN';

  const igAccount = accounts.find((a) => a.provider === 'INSTAGRAM' && a.isConnected);
  const pickToken = searchParams.get('pick');

  async function load() {
    setLoading(true);
    const r = await api.get<{ accounts: Account[]; platform: Platform }>('/api/v1/integrations');
    setAccounts(r.accounts);
    setPlatform(r.platform);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!igAccount) { setWebhookStatus(null); return; }
    setCheckingWebhook(true);
    api.get<{ subscribedFields: string[]; hasComments: boolean; hasMessages: boolean }>(`/api/v1/integrations/${igAccount.id}/webhook-status`)
      .then(setWebhookStatus)
      .catch(() => setWebhookStatus(null))
      .finally(() => setCheckingWebhook(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [igAccount?.id]);

  async function fixWebhookSubscription() {
    if (!igAccount) return;
    setFixingWebhook(true);
    try {
      const r = await api.post<{ ok: boolean; subscribedFields: string[] }>(`/api/v1/integrations/${igAccount.id}/resubscribe`, {});
      setWebhookStatus({ subscribedFields: r.subscribedFields, hasComments: r.subscribedFields.includes('comments'), hasMessages: r.subscribedFields.includes('messages') });
      setBanner({ kind: 'ok', text: 'Webhook subscription refreshed.' });
    } catch (e: any) {
      setBanner({ kind: 'error', text: e.message });
    } finally {
      setFixingWebhook(false);
    }
  }

  // Handle the OAuth callback's redirect back into the app.
  useEffect(() => {
    if (searchParams.get('connected')) {
      setBanner({ kind: 'ok', text: 'Instagram account connected.' });
      setSearchParams({}, { replace: true });
      load();
    } else if (searchParams.get('error')) {
      setBanner({ kind: 'error', text: `Connection failed: ${searchParams.get('error')}` });
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connectInstagram() {
    setConnecting(true);
    try {
      const r = await api.get<{ authUrl: string }>('/api/v1/integrations/instagram/connect');
      window.location.href = r.authUrl;
    } catch (e: any) {
      setBanner({ kind: 'error', text: e.message });
      setConnecting(false);
    }
  }

  async function disconnect(id: string) {
    await api.post(`/api/v1/integrations/${id}/disconnect`, {});
    load();
  }

  async function backfillUsernames() {
    if (!igAccount) return;
    setBackfilling(true);
    try {
      const r = await api.post<{ updated: number; failed: number; checked: number }>(
        `/api/v1/integrations/${igAccount.id}/backfill-instagram-names`, {}
      );
      if (r.checked === 0) toast.info('No leads were missing an Instagram username.');
      else toast.success(`Updated ${r.updated} of ${r.checked} lead${r.checked === 1 ? '' : 's'}${r.failed ? ` (${r.failed} couldn't be looked up)` : ''}.`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBackfilling(false);
    }
  }

  const webhookUrl = `${import.meta.env.VITE_API_URL || ''}/api/v1/webhooks/meta`;

  return (
    <div>
      <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="text-display">Instagram Integration</div>
          <p className="subtle" style={{ marginTop: 4 }}>Connect your Instagram Business Account to receive DMs and comments.</p>
        </div>
        {canManage && !igAccount && platform?.instagramOAuthConfigured && (
          <button className="btn primary" onClick={connectInstagram} disabled={connecting}>
            {connecting ? 'Redirecting…' : 'Connect Instagram'}
          </button>
        )}
      </div>

      {banner && (
        <div className={`card card-pad mt16 ${banner.kind === 'error' ? '' : 'ig-status-ok'}`} style={banner.kind === 'error' ? { borderColor: 'var(--danger)' } : undefined}>
          <span className={banner.kind === 'error' ? 'error' : ''}>{banner.text}</span>
        </div>
      )}

      {platform && !platform.instagramOAuthConfigured && (
        <div className="mt16">
          <Card title="Setup required">
            <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <AlertTriangle size={18} style={{ color: 'var(--warning-text)', flexShrink: 0, marginTop: 2 }} />
              <div>
                <p className="hint" style={{ marginTop: 0 }}>
                  Instagram OAuth isn't configured yet. Set <code>INSTAGRAM_APP_ID</code>, <code>INSTAGRAM_APP_SECRET</code>,{' '}
                  <code>INSTAGRAM_OAUTH_REDIRECT_URI</code>, <code>META_APP_SECRET</code>, and <code>META_WEBHOOK_VERIFY_TOKEN</code> in the API
                  environment, then reload this page.
                </p>
                <div className="hint mt8">
                  Webhook callback URL (set this in your Meta App): <code>{webhookUrl}</code>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      <div className="mt16">
        <Card title="Connected account">
          {loading ? (
            <div className="row" style={{ gap: 12 }}>
              <Skeleton width={40} height={40} radius={10} />
              <div style={{ flex: 1 }}>
                <Skeleton width="35%" height={14} style={{ marginBottom: 8 }} />
                <Skeleton width="55%" height={12} />
              </div>
            </div>
          ) : !igAccount ? (
            <EmptyState
              icon={Plug}
              title="No Instagram account connected yet"
              description="Connect your Instagram Business Account to start receiving DMs and comments in this CRM."
              action={canManage && platform?.instagramOAuthConfigured ? (
                <button className="btn primary sm" onClick={connectInstagram} disabled={connecting}>
                  {connecting ? 'Redirecting…' : 'Connect Instagram'}
                </button>
              ) : undefined}
            />
          ) : (
            <div className="row between">
              <div className="row" style={{ gap: 12 }}>
                <div className="ig-status-ic"><Camera size={18} /></div>
                <div>
                  <div className="text-title">@{igAccount.displayName || igAccount.externalId}</div>
                  <div className="text-small">IG business account id: {igAccount.externalId}</div>
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <Badge value="active" />
                {canManage && <button className="btn sm outline" onClick={() => disconnect(igAccount.id)}>Disconnect</button>}
              </div>
            </div>
          )}
        </Card>
      </div>

      {igAccount && (
        <div className="mt16">
          <Card title="Webhook subscription">
            {checkingWebhook ? <SkeletonRows rows={1} /> : !webhookStatus ? (
              <p className="hint">Couldn't read subscription status from Meta.</p>
            ) : (
              <div>
                <div className="row" style={{ gap: 16 }}>
                  <StatusPill ok={webhookStatus.hasMessages} label="Messages" />
                  <StatusPill ok={webhookStatus.hasComments} label="Comments" />
                </div>
                {!webhookStatus.hasComments && (
                  <>
                    <p className="hint mt8">
                      This account isn't subscribed to comment events yet — that's why comments aren't showing up in
                      the inbox. This usually happens if the account was connected before comment support was added.
                    </p>
                    {canManage && (
                      <button className="btn sm primary mt8" onClick={fixWebhookSubscription} disabled={fixingWebhook}>
                        {fixingWebhook ? 'Fixing…' : 'Fix comment subscription'}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {igAccount && (
        <div className="mt16">
          <Card title="Instagram usernames">
            <p className="hint" style={{ marginTop: 0 }}>
              Comments always include the commenter's username, but Instagram DMs don't — leads created
              from a DM before this was fixed may still show "New Lead" with no Instagram handle.
              Run this once to fill them in from your <Link to="/app/leads">Leads</Link> list.
            </p>
            {canManage && (
              <button className="btn sm outline mt8" onClick={backfillUsernames} disabled={backfilling}>
                <UserSearch size={14} /> {backfilling ? 'Filling in…' : 'Fill in missing Instagram usernames'}
              </button>
            )}
          </Card>
        </div>
      )}

      {pickToken && <PagePicker pickToken={pickToken} onDone={() => { setSearchParams({}, { replace: true }); load(); }} onCancel={() => setSearchParams({}, { replace: true })} />}
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      {ok ? <CheckCircle2 size={16} style={{ color: 'var(--success-text)' }} /> : <XCircle size={16} style={{ color: 'var(--danger-text)' }} />}
      <span className="text-title">{label}</span>
      <span className="text-small">{ok ? 'subscribed' : 'not subscribed'}</span>
    </div>
  );
}

function PagePicker({ pickToken, onDone, onCancel }: { pickToken: string; onDone: () => void; onCancel: () => void }) {
  // The pages list travels inside the signed pickToken server-side; we only
  // need the org to choose a pageId and POST it back for the server to
  // re-derive from that same token (never exposed to the client directly).
  const [pageId, setPageId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await api.post('/api/v1/integrations/instagram/select', { pickToken, pageId });
      onDone();
    } catch (e: any) {
      setErr(e.message); setBusy(false);
    }
  }

  return (
    <Modal title="Select a Facebook Page" onClose={onCancel}>
      <form onSubmit={submit}>
        <div className="hint" style={{ marginBottom: 10 }}>
          Multiple Pages with a linked Instagram Business Account were found. Enter the Page id to connect
          (shown in the Meta OAuth consent screen).
        </div>
        <div className="field">
          <label>Facebook Page ID</label>
          <input className="input" value={pageId} onChange={(e) => setPageId(e.target.value)} required />
        </div>
        {err && <div className="error">{err}</div>}
        <button className="btn primary block mt8" disabled={busy || !pageId}>{busy ? 'Connecting…' : 'Connect this Page'}</button>
      </form>
    </Modal>
  );
}
