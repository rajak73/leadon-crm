import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Card, Badge, Loading, Empty, Modal } from '../components/ui';
import { useAuth } from '../lib/auth';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<{ subscribedFields: string[]; hasComments: boolean; hasMessages: boolean } | null>(null);
  const [checkingWebhook, setCheckingWebhook] = useState(false);
  const [fixingWebhook, setFixingWebhook] = useState(false);
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

  const webhookUrl = `${import.meta.env.VITE_API_URL || ''}/api/v1/webhooks/meta`;

  return (
    <div>
      <div className="row between">
        <div>
          <div className="h1">Instagram Integration</div>
          <p className="subtle" style={{ marginTop: 0 }}>Connect your Instagram Business Account to receive DMs and comments.</p>
        </div>
        {canManage && !igAccount && platform?.instagramOAuthConfigured && (
          <button className="btn primary" onClick={connectInstagram} disabled={connecting}>
            {connecting ? 'Redirecting…' : 'Connect Instagram'}
          </button>
        )}
      </div>

      {banner && (
        <div className={`hint ${banner.kind === 'error' ? 'error' : ''}`} style={{ marginTop: 8 }}>{banner.text}</div>
      )}

      {platform && !platform.instagramOAuthConfigured && (
        <Card title="Setup required">
          <p className="hint">
            Instagram OAuth isn't configured yet. Set <code>INSTAGRAM_APP_ID</code>, <code>INSTAGRAM_APP_SECRET</code>,{' '}
            <code>INSTAGRAM_OAUTH_REDIRECT_URI</code>, <code>META_APP_SECRET</code>, and <code>META_WEBHOOK_VERIFY_TOKEN</code> in the API
            environment, then reload this page.
          </p>
          <div className="hint mt8">
            Webhook callback URL (set this in your Meta App): <code>{webhookUrl}</code>
          </div>
        </Card>
      )}

      <div className="mt16">
        <Card title="Connected account">
          {loading ? <Loading /> : !igAccount ? (
            <Empty text="No Instagram account connected yet." />
          ) : (
            <div className="row between">
              <div>
                <div><strong>@{igAccount.displayName || igAccount.externalId}</strong> <Badge value="active" /></div>
                <div className="subtle" style={{ fontSize: 13 }}>IG business account id: {igAccount.externalId}</div>
              </div>
              {canManage && <button className="btn sm outline" onClick={() => disconnect(igAccount.id)}>Disconnect</button>}
            </div>
          )}
        </Card>
      </div>

      {igAccount && (
        <div className="mt16">
          <Card title="Webhook subscription">
            {checkingWebhook ? <Loading /> : !webhookStatus ? (
              <p className="hint">Couldn't read subscription status from Meta.</p>
            ) : (
              <div>
                <div className="row" style={{ gap: 8 }}>
                  <Badge value={webhookStatus.hasMessages ? 'messages: on' : 'messages: off'} />
                  <Badge value={webhookStatus.hasComments ? 'comments: on' : 'comments: off'} />
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

      {pickToken && <PagePicker pickToken={pickToken} onDone={() => { setSearchParams({}, { replace: true }); load(); }} onCancel={() => setSearchParams({}, { replace: true })} />}
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
