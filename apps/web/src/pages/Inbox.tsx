import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Send, Inbox as InboxIcon, MousePointerClick } from 'lucide-react';
import { api } from '../lib/api';
import { Badge, Avatar, EmptyState, SkeletonRows } from '../components/ui';

interface Conv { id: string; channel: string; type: string; customerName?: string | null; unreadCount: number; lead?: { id: string; name: string } | null; lastMessage?: { body: string } | null; }
interface Message { id: string; direction: string; body: string; status: string; createdAt: string; isSimulation: boolean; type: string; }
interface Thread { id: string; channel: string; type: string; customerName?: string | null; lead?: { id: string; name: string } | null; messages: Message[]; }

export default function Inbox() {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [tab, setTab] = useState<'DM' | 'COMMENT'>('DM');
  const [active, setActive] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [summary, setSummary] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [instagramConnected, setInstagramConnected] = useState(false);

  async function loadPlatform() {
    try {
      const r = await api.get<{ platform: { instagram: boolean } }>('/api/v1/integrations');
      setInstagramConnected(r.platform.instagram);
    } catch { /* noop */ }
  }

  async function loadConvs() {
    setLoading(true);
    const r = await api.get<Conv[]>('/api/v1/conversations');
    setConvs(r);
    setLoading(false);
  }
  async function openThread(id: string) {
    setActive(id);
    setThread(await api.get<Thread>(`/api/v1/conversations/${id}`));
  }
  useEffect(() => { loadConvs(); loadPlatform(); /* eslint-disable-next-line */ }, []);

  const filtered = useMemo(() => convs.filter((c) => (c.type || 'DM') === tab), [convs, tab]);

  useEffect(() => {
    // Auto-select the first conversation in the active tab when nothing's open.
    if (!active && filtered[0]) openThread(filtered[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  function switchTab(t: 'DM' | 'COMMENT') {
    setTab(t);
    setActive(null);
    setThread(null);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!thread || !reply.trim()) return;
    // Real send when Instagram is connected; simulation otherwise (no real
    // credentials to deliver with, so never falsely mark a message sent).
    await api.post(`/api/v1/conversations/${thread.id}/reply`, { body: reply, isSimulation: !instagramConnected });
    setReply('');
    openThread(thread.id);
  }
  async function convert() {
    if (!thread) return;
    await api.post(`/api/v1/conversations/${thread.id}/convert-to-lead`, {});
    loadConvs();
  }

  async function getSuggestions() {
    if (!thread) return;
    setAiBusy(true);
    try {
      const r = await api.get<{ suggestions: string[] }>(`/api/v1/ai/reply-suggestions/${thread.id}`);
      setSuggestions(r.suggestions);
    } finally { setAiBusy(false); }
  }
  async function getSummary() {
    if (!thread) return;
    setAiBusy(true);
    try {
      const r = await api.get<{ summary: string }>(`/api/v1/ai/summarize/${thread.id}`);
      setSummary(r.summary);
    } finally { setAiBusy(false); }
  }
  async function getSentiment() {
    if (!thread) return;
    setAiBusy(true);
    try {
      const r = await api.get<{ label: string; score: number }>(`/api/v1/ai/sentiment/${thread.id}`);
      setSummary(`Sentiment: ${r.label} (${r.score})`);
    } finally { setAiBusy(false); }
  }

  return (
    <div>
      <div className="text-display">Inbox</div>
      <p className="subtle" style={{ marginTop: 4 }}>Instagram DMs and comments in one place.</p>

      <div className="segment mt16">
        <button className={`segment-btn ${tab === 'DM' ? 'active' : ''}`} onClick={() => switchTab('DM')}>Direct Messages</button>
        <button className={`segment-btn ${tab === 'COMMENT' ? 'active' : ''}`} onClick={() => switchTab('COMMENT')}>Comments</button>
      </div>

      <div className="inbox mt16">
        <div className="card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div className="card-pad"><SkeletonRows rows={5} /></div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={InboxIcon}
              title={tab === 'DM' ? 'No direct messages yet' : 'No comments yet'}
              description={tab === 'DM' ? "New DMs to your connected account will show up here." : 'Comments on your Instagram posts will show up here.'}
            />
          ) : (
            filtered.map((c) => (
              <div key={c.id} className={`conv-item ${active === c.id ? 'active' : ''}`} onClick={() => openThread(c.id)}>
                <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                  <Avatar name={c.customerName || c.lead?.name || 'Unknown'} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="row between">
                      <span className="text-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.customerName || c.lead?.name || 'Unknown'}
                      </span>
                      {c.unreadCount > 0 && <span className="badge new" style={{ flexShrink: 0 }}>{c.unreadCount}</span>}
                    </div>
                    <div className="text-small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.lastMessage?.body || '—'}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', minHeight: 460 }}>
          {!thread ? (
            <EmptyState
              icon={MousePointerClick}
              title="Select a conversation"
              description="Pick a conversation from the list to view messages and reply."
            />
          ) : (
            <>
              <div className="row between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="text-title">{thread.customerName || 'Conversation'}</span>
                  <Badge value={thread.channel} />
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn sm outline" onClick={getSummary} disabled={aiBusy}><Sparkles size={14} /> Summarize</button>
                  <button className="btn sm outline" onClick={getSentiment} disabled={aiBusy}><Sparkles size={14} /> Sentiment</button>
                  <button className="btn sm outline" onClick={getSuggestions} disabled={aiBusy}><Sparkles size={14} /> Suggest reply</button>
                  {thread.lead ? (
                    <Link className="btn sm outline" to={`/app/leads/${thread.lead.id}`}>View Lead Profile</Link>
                  ) : thread.type !== 'COMMENT' && (
                    <button className="btn sm outline" onClick={convert}>Convert to Lead</button>
                  )}
                </div>
              </div>
              {summary && <div className="card card-pad" style={{ marginBottom: 10, background: 'var(--primary-50)' }}><strong>Summary:</strong> {summary}</div>}
              {suggestions.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {suggestions.map((s, i) => (
                    <div key={i} className="msg out" style={{ cursor: 'pointer', opacity: .95 }} title="Click to use" onClick={() => { setReply(s); setSuggestions([]); }}>
                      {s}
                    </div>
                  ))}
                  <div className="hint">Click a suggestion to use it.</div>
                </div>
              )}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {thread.messages.map((m) => (
                  <div key={m.id} className={`msg ${m.direction === 'INBOUND' ? 'in' : 'out'}`}>
                    {m.body}
                    <div className="msg-meta">
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {m.direction === 'OUTBOUND' && ` · ${m.status}${m.isSimulation ? ' · simulated' : ''}`}
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={send} className="row mt8">
                <input className="input" placeholder="Type a reply…" value={reply} onChange={(e) => setReply(e.target.value)} />
                <button className="btn primary" disabled={!reply.trim()}><Send size={14} /> Send</button>
              </form>
              <div className="hint">
                {instagramConnected
                  ? 'Replies send for real via your connected Instagram account.'
                  : 'No Instagram account connected — replies are simulated (BRD §11.3), nothing is delivered.'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
