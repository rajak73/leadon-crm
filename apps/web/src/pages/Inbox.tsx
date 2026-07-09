import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Badge, Loading, Empty } from '../components/ui';

interface Conv { id: string; channel: string; customerName?: string | null; lead?: { id: string; name: string } | null; lastMessage?: { body: string } | null; }
interface Message { id: string; direction: string; body: string; status: string; createdAt: string; isSimulation: boolean; }
interface Thread { id: string; channel: string; customerName?: string | null; messages: Message[]; }

export default function Inbox() {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [summary, setSummary] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  async function loadConvs() {
    setLoading(true);
    const r = await api.get<Conv[]>('/api/v1/conversations');
    setConvs(r);
    setLoading(false);
    if (!active && r[0]) openThread(r[0].id);
  }
  async function openThread(id: string) {
    setActive(id);
    setThread(await api.get<Thread>(`/api/v1/conversations/${id}`));
  }
  useEffect(() => { loadConvs(); /* eslint-disable-next-line */ }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!thread || !reply.trim()) return;
    await api.post(`/api/v1/conversations/${thread.id}/reply`, { body: reply, isSimulation: true });
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
      <div className="h1">Inbox</div>
      <p className="subtle" style={{ marginTop: 0 }}>All customer conversations in one place.</p>

      <div className="inbox mt16">
        <div className="card" style={{ overflow: 'hidden' }}>
          {loading ? <Loading /> : convs.length === 0 ? <Empty text="No conversations. Try the Social Simulator." /> :
            convs.map((c) => (
              <div key={c.id} className={`conv-item ${active === c.id ? 'active' : ''}`} onClick={() => openThread(c.id)}>
                <div className="row between">
                  <strong>{c.customerName || c.lead?.name || 'Unknown'}</strong>
                  <Badge value={c.channel} />
                </div>
                <div className="subtle" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.lastMessage?.body || '—'}
                </div>
              </div>
            ))}
        </div>

        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', minHeight: 400 }}>
          {!thread ? <Empty text="Select a conversation" /> : (
            <>
              <div className="row between" style={{ marginBottom: 12 }}>
                <strong>{thread.customerName || 'Conversation'} <Badge value={thread.channel} /></strong>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn sm outline" onClick={getSummary} disabled={aiBusy}>✨ Summarize</button>
                  <button className="btn sm outline" onClick={getSentiment} disabled={aiBusy}>✨ Sentiment</button>
                  <button className="btn sm outline" onClick={getSuggestions} disabled={aiBusy}>✨ Suggest reply</button>
                  <button className="btn sm outline" onClick={convert}>Convert to Lead</button>
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
                    {m.direction === 'OUTBOUND' && (
                      <div style={{ fontSize: 11, opacity: .8, marginTop: 4 }}>
                        {m.status}{m.isSimulation ? ' · simulated' : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <form onSubmit={send} className="row mt8">
                <input className="input" placeholder="Type a reply…" value={reply} onChange={(e) => setReply(e.target.value)} />
                <button className="btn primary">Send</button>
              </form>
              <div className="hint">Replies are sent in simulation mode (BRD §11.3) — no real message is delivered.</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
