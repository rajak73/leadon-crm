import { useState } from 'react';
import { api } from '../lib/api';
import { Card } from '../components/ui';

interface DrainResult {
  eventId: string;
  drained?: {
    processed: number; failed: number; skipped: number;
    results: Array<{ eventId: string; status: string; detail?: string }>;
  };
}

export default function Simulator() {
  const [channel, setChannel] = useState('INSTAGRAM');
  const [senderId, setSenderId] = useState('ig_user_1');
  const [text, setText] = useState('Hi, I want pricing');
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      const r = await api.post<DrainResult>('/api/v1/simulation/webhook', {
        channel, senderId, text, drainNow: true,
      });
      const detail = r.drained?.results?.[0]?.detail || 'queued';
      setLog((l) => [`→ [${channel}] "${text}"  ⇒  ${detail}`, ...l]);
    } catch (e: any) {
      setLog((l) => [`✖ ${e.message}`, ...l]);
    } finally {
      setBusy(false);
    }
  }

  const scenarios = [
    'Hi, I want pricing',
    'My name is Rahul',
    'My name is Rahul and my phone is 9876543210',
  ];

  return (
    <div>
      <div className="h1">Social Lead Simulator</div>
      <p className="subtle" style={{ marginTop: 0 }}>
        Inject a fake Instagram/WhatsApp message (BRD §11 simulation mode). The system captures the
        lead and runs the interactive name/phone flow (§12). No real messages are sent.
      </p>

      <div className="grid grid-2 mt16">
        <Card title="Send a simulated inbound message">
          <div className="field">
            <label>Channel</label>
            <select className="select" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="INSTAGRAM">Instagram</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="FACEBOOK">Facebook</option>
            </select>
          </div>
          <div className="field">
            <label>Sender ID (keep same to continue a conversation)</label>
            <input className="input" value={senderId} onChange={(e) => setSenderId(e.target.value)} />
          </div>
          <div className="field">
            <label>Message text</label>
            <textarea className="textarea" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {scenarios.map((s) => (
              <button key={s} className="btn sm outline" onClick={() => setText(s)}>{s.slice(0, 22)}…</button>
            ))}
          </div>
          <button className="btn primary block mt16" onClick={send} disabled={busy}>
            {busy ? 'Processing…' : 'Send simulated message'}
          </button>
        </Card>

        <Card title="Processing log">
          {log.length === 0 ? (
            <div className="subtle">Results will appear here. Try the 3 scenario buttons in order using the same Sender ID.</div>
          ) : (
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>
              {log.map((l, i) => <div key={i} className="mt8">{l}</div>)}
            </div>
          )}
          <div className="hint mt16">
            Tip: check the <strong>Inbox</strong> and <strong>Leads</strong> pages to see the captured lead and simulated replies.
          </div>
        </Card>
      </div>
    </div>
  );
}
