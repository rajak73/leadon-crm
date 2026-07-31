import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  PlusCircle, ArrowRightLeft, StickyNote, IdCard, Sparkles, Briefcase, Cog, MessageSquareReply, UserCheck, Pencil,
  ListChecks, Clock, MessageCircle, Activity as ActivityIcon,
} from 'lucide-react';
import { api } from '../lib/api';
import { Card, Badge, Empty, EmptyState, Avatar, ScoreMeter, Skeleton, SkeletonRows, money } from '../components/ui';
import { LEAD_STATUSES, LEAD_SOURCES } from '@leados/shared';

interface Lead {
  id: string; name: string; email?: string | null; phone?: string | null;
  source: string; status: string; score: number; notes?: string | null;
  tags: string[];
  assignedUser?: { firstName: string; lastName: string } | null;
  createdAt: string; lastActivityAt?: string | null;
  deals: { id: string; title: string; value: number; stage?: { name: string } | null }[];
  tasks: { id: string; title: string; status: string; dueDate?: string | null }[];
  activities: { id: string; type: string; message: string; createdAt: string }[];
  conversations: { id: string; channel: string; type?: string; externalId?: string | null; messages: { id: string; direction: string; body: string }[] }[];
}

const ACT_ICON: Record<string, typeof PlusCircle> = {
  LEAD_CREATED: PlusCircle,
  LEAD_STATUS_CHANGED: ArrowRightLeft,
  NOTE_ADDED: StickyNote,
  LEAD_DETAILS_CAPTURED: IdCard,
  LEAD_SCORED: Sparkles,
  DEAL_CREATED: Briefcase,
  WORKFLOW_RUN: Cog,
  AUTO_REPLY_TRIGGERED: MessageSquareReply,
  AUTO_REPLY_ASSIGNED_HUMAN: UserCheck,
};
const DEFAULT_ACT_ICON = StickyNote;

export default function LeadDetail() {
  const { id } = useParams();
  const [lead, setLead] = useState<Lead | null>(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', source: 'MANUAL', score: 0 });
  const [tagInput, setTagInput] = useState('');
  const [followUps, setFollowUps] = useState<Array<{ id: string; status: string; createdAt: string; rule: { name: string } }>>([]);

  async function load() {
    try { setLead(await api.get<Lead>(`/api/v1/leads/${id}`)); }
    catch (e: any) { setErr(e.message); }
    try { setFollowUps(await api.get(`/api/v1/leads/${id}/follow-ups`)); } catch { /* noop */ }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function setStatus(status: string) {
    await api.patch(`/api/v1/leads/${id}`, { status });
    load();
  }
  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    try { await api.post(`/api/v1/leads/${id}/notes`, { note }); setNote(''); await load(); }
    finally { setBusy(false); }
  }
  async function scoreLead() {
    await api.post(`/api/v1/ai/score-lead/${id}`, {});
    load();
  }
  async function addTag() {
    if (!lead || !tagInput.trim()) return;
    const next = Array.from(new Set([...lead.tags, tagInput.trim()]));
    setTagInput('');
    await api.patch(`/api/v1/leads/${id}`, { tags: next });
    load();
  }
  async function removeTag(tag: string) {
    if (!lead) return;
    await api.patch(`/api/v1/leads/${id}`, { tags: lead.tags.filter((t) => t !== tag) });
    load();
  }
  function startEdit() {
    if (!lead) return;
    setForm({
      name: lead.name,
      email: lead.email || '',
      phone: lead.phone || '',
      source: lead.source,
      score: lead.score,
    });
    setEditing(true);
  }
  async function saveEdit() {
    setBusy(true);
    try {
      await api.patch(`/api/v1/leads/${id}`, {
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        source: form.source,
        score: Number(form.score),
      });
      setEditing(false);
      await load();
    } finally { setBusy(false); }
  }

  if (err) return <Empty text={err} />;

  if (!lead) {
    return (
      <div>
        <Link to="/app/leads" className="subtle">← Leads</Link>
        <div className="row mt8" style={{ gap: 16 }}>
          <Skeleton width={56} height={56} radius={999} />
          <div style={{ flex: 1 }}>
            <Skeleton width="30%" height={20} style={{ marginBottom: 8 }} />
            <Skeleton width="50%" height={13} />
          </div>
        </div>
        <div className="grid grid-3 mt16">
          <Card title="Details"><SkeletonRows rows={3} /></Card>
          <Card title="Deals"><SkeletonRows rows={2} /></Card>
          <Card title="Tasks"><SkeletonRows rows={2} /></Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link to="/app/leads" className="subtle">← Leads</Link>
      <div className="profile-header mt8">
        <Avatar name={lead.name} size={56} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="text-display" style={{ fontSize: 26, marginBottom: 6 }}>{lead.name}</div>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <Badge value={lead.status} /> <Badge value={lead.source} />
            <div className="row" style={{ gap: 8 }}>
              <span className="text-small">Score</span>
              <ScoreMeter value={lead.score} />
              <span className="text-small" style={{ fontWeight: 700, color: 'var(--text)' }}>{lead.score}</span>
            </div>
          </div>
          {lead.tags.length > 0 && (
            <div className="row mt8" style={{ gap: 6, flexWrap: 'wrap' }}>
              {lead.tags.map((t) => <span key={t} className="badge gray">{t}</span>)}
            </div>
          )}
        </div>
        <button className="btn outline" onClick={scoreLead}><Sparkles size={14} /> Re-score</button>
      </div>

      <div className="grid grid-3 mt16">
        <Card title="Details" action={!editing ? <button className="btn sm outline" onClick={startEdit}><Pencil size={14} /> Edit</button> : undefined}>
          {editing ? (
            <div>
              <div className="field"><label>Name</label><input className="input" aria-label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="field"><label>Phone</label><input className="input" aria-label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="field"><label>Email</label><input className="input" aria-label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="field"><label>Source</label>
                <select className="select" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                  {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="field"><label>Score (0–100)</label><input className="input" type="number" min={0} max={100} value={form.score} onChange={(e) => setForm({ ...form, score: Number(e.target.value) })} /></div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn primary" onClick={saveEdit} disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : 'Save'}</button>
                <button className="btn outline" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div>
              <div className="mt8"><strong>Phone:</strong> {lead.phone || '—'}</div>
              <div className="mt8"><strong>Email:</strong> {lead.email || '—'}</div>
              <div className="mt8"><strong>Assigned:</strong> {lead.assignedUser ? `${lead.assignedUser.firstName} ${lead.assignedUser.lastName}` : 'Unassigned'}</div>
              <div className="mt8"><strong>Created:</strong> {new Date(lead.createdAt).toLocaleDateString()}</div>
              <div className="field mt16">
                <label>Change status</label>
                <select className="select" value={lead.status} onChange={(e) => setStatus(e.target.value)}>
                  {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div className="field mt16">
                <label>Tags</label>
                <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {lead.tags.length === 0 ? <span className="subtle">No tags</span> : lead.tags.map((t) => (
                    <button key={t} type="button" className="badge gray" style={{ cursor: 'pointer', border: 'none' }} aria-label={`Remove tag ${t}`} onClick={() => removeTag(t)}>{t} ×</button>
                  ))}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <input className="input" placeholder="Add a tag…" value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag()} />
                  <button className="btn sm outline" onClick={addTag} disabled={!tagInput.trim()}>Add</button>
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card title={`Deals (${lead.deals.length})`}>
          {lead.deals.length === 0 ? (
            <EmptyState icon={Briefcase} title="No deals yet" description="Deals created from this lead will show up here." />
          ) : lead.deals.map((d) => (
            <div key={d.id} className="row between mt8">
              <span>{d.title} <span className="subtle">· {d.stage?.name}</span></span>
              <strong>{money(d.value)}</strong>
            </div>
          ))}
        </Card>

        <Card title={`Tasks (${lead.tasks.length})`}>
          {lead.tasks.length === 0 ? (
            <EmptyState icon={ListChecks} title="No tasks yet" description="Tasks assigned for this lead will show up here." />
          ) : lead.tasks.map((t) => (
            <div key={t.id} className="row between mt8">
              <span>{t.title}</span><Badge value={t.status} />
            </div>
          ))}
        </Card>
      </div>

      <div className="mt16">
        <Card title="Follow-ups" action={<Link className="btn sm outline" to="/app/follow-ups">Manage rules</Link>}>
          {followUps.length === 0 ? (
            <EmptyState icon={Clock} title="No follow-ups sent yet" description="Automated follow-up sequences will appear here once triggered." />
          ) : followUps.map((f) => (
            <div key={f.id} className="row between mt8">
              <span>{f.rule.name}</span>
              <span><Badge value={f.status} /> <span className="subtle" style={{ fontSize: 12 }}>{new Date(f.createdAt).toLocaleDateString()}</span></span>
            </div>
          ))}
        </Card>
      </div>

      <div className="grid grid-2 mt16">
        <Card title="Activity Timeline">
          <div className="field">
            <div className="row" style={{ gap: 8 }}>
              <input className="input" placeholder="Add a note…" value={note}
                onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} />
              <button className="btn primary" onClick={addNote} disabled={busy || !note.trim()}>Add</button>
            </div>
          </div>
          {lead.activities.length === 0 ? (
            <EmptyState icon={ActivityIcon} title="No activity yet" description="Status changes, notes, and automation events will appear here." />
          ) : (
            <div style={{ position: 'relative' }}>
              {lead.activities.map((a) => {
                const Icon = ACT_ICON[a.type] ?? DEFAULT_ACT_ICON;
                return (
                <div key={a.id} className="row" style={{ gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <Icon size={16} style={{ flexShrink: 0, marginTop: 2, color: 'var(--muted)' }} />
                  <div style={{ minWidth: 0 }}>
                    <div className="text-body">{a.message}</div>
                    <div className="text-caption">{a.type.replace(/_/g, ' ')} · {new Date(a.createdAt).toLocaleString()}</div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Conversations" action={lead.conversations.length > 0 ? <Link className="btn sm outline" to="/app/inbox">Open in Inbox</Link> : undefined}>
          {lead.conversations.length === 0 ? (
            <EmptyState icon={MessageCircle} title="No conversations" description="DMs and comments linked to this lead will show up here." />
          ) : lead.conversations.map((c) => (
            <div key={c.id} style={{ marginBottom: 12 }}>
              <div className="row between">
                <span><Badge value={c.channel} /> {c.type && <Badge value={c.type} />}</span>
                {c.externalId && <span className="subtle" style={{ fontSize: 12 }}>IG id: {c.externalId}</span>}
              </div>
              {c.messages.slice().reverse().map((m) => (
                <div key={m.id} className={`msg ${m.direction === 'INBOUND' ? 'in' : 'out'}`} style={{ maxWidth: '90%', marginTop: 6 }}>{m.body}</div>
              ))}
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
