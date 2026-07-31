import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Target, Bot, UserCircle2, MessageCircle, Zap, Clock, Check, Sparkles, TrendingUp, X } from 'lucide-react';

const DEMO_SCRIPT = [
  { dir: 'in', text: 'Hi! Do you have this in size M?' },
  { dir: 'out', text: 'Yes! Could you share your name and number so we can confirm stock for you?' },
  { dir: 'in', text: 'Priya, 98765xxxxx' },
  { dir: 'out', text: 'Thanks Priya — reserved for you 🎉 Our team will DM shipping details shortly.' },
] as const;

/** Auto-playing, looping chat demo — gives the hero a "video" feel without
 * needing an actual video asset. Typing dots → message appears → repeat,
 * then a pause and reset. Respects prefers-reduced-motion by freezing on
 * the final state instead of looping. */
function AnimatedInboxDemo() {
  const [step, setStep] = useState(0); // how many messages are shown
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setStep(DEMO_SCRIPT.length);
      return;
    }
    let cancelled = false;
    let t: ReturnType<typeof setTimeout>;

    async function run() {
      while (!cancelled) {
        setStep(0);
        for (let i = 0; i < DEMO_SCRIPT.length; i++) {
          await new Promise((r) => { t = setTimeout(r, i === 0 ? 500 : 900); });
          if (cancelled) return;
          setTyping(true);
          await new Promise((r) => { t = setTimeout(r, 700); });
          if (cancelled) return;
          setTyping(false);
          setStep(i + 1);
        }
        await new Promise((r) => { t = setTimeout(r, 2400); });
      }
    }
    run();
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  return (
    <div className="card mk-mockup">
      <div className="row between" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 8 }}>
          <div className="ig-status-ic"><MessageCircle size={16} /></div>
          <span className="text-title">Instagram Inbox</span>
        </div>
        <span className="badge active">Live</span>
      </div>
      <div className="mk-demo-thread">
        {DEMO_SCRIPT.slice(0, step).map((m, i) => (
          <div key={i} className={`msg ${m.dir} mk-demo-msg`}>{m.text}</div>
        ))}
        {typing && (
          <div className="msg out mk-typing">
            <span /><span /><span />
          </div>
        )}
      </div>
    </div>
  );
}

const features = [
  { ic: MessageCircle, title: 'Instagram Inbox', desc: 'Every DM and comment on your Instagram Business account, in one clean inbox.' },
  { ic: Target, title: 'Automatic Lead Capture', desc: 'A new conversation becomes a lead instantly — name, contact info and full history saved automatically.' },
  { ic: Bot, title: 'Smart Auto-Reply', desc: 'Answer common questions instantly with keyword rules, or let AI reply naturally when nothing matches.' },
  { ic: Clock, title: 'Follow-up Sequences', desc: 'Never leave a customer hanging — automatically follow up if they go quiet.' },
  { ic: UserCircle2, title: 'Customer 360', desc: 'Full profile, conversation history, notes and lead score for every customer, in one place.' },
  { ic: Zap, title: 'Real Meta OAuth', desc: 'Connect your own Instagram Business account in a few clicks — no developer setup required.' },
];

export default function Marketing() {
  return (
    <div>
      <div className="mk-nav-wrap">
        <nav className="mk-nav">
          <div className="brand" style={{ fontSize: 22 }}>LeadOS</div>
          <div className="row">
            <a href="#features" className="subtle">Features</a>
            <Link to="/login" className="btn outline sm">Log in</Link>
            <Link to="/signup" className="btn primary sm">Get Started</Link>
          </div>
        </nav>
      </div>

      <div className="mk-hero-wrap">
      <div className="mk-hero-blob mk-hero-blob-1" />
      <div className="mk-hero-blob mk-hero-blob-2" />

      <header className="mk-hero-split">
        <div className="mk-hero-copy">
          <span className="pill">Instagram DMs & Comments, Automated</span>
          <h1>Turn every Instagram message into a customer.</h1>
          <p>
            LeadOS connects to your Instagram Business account, automatically captures leads from
            every DM and comment, and replies for you — so no customer waits, and nothing falls
            through the cracks.
          </p>
          <div className="row">
            <Link to="/signup" className="btn primary">Start free →</Link>
            <a href="#features" className="btn outline">See features</a>
          </div>
          <div className="row mk-hero-trust">
            <div className="row" style={{ gap: 6 }}><Check size={14} style={{ color: 'var(--success-text)' }} /> No credit card required</div>
            <div className="row" style={{ gap: 6 }}><Check size={14} style={{ color: 'var(--success-text)' }} /> Set up in under a minute</div>
          </div>
        </div>

        <div className="mk-hero-visual">
          <AnimatedInboxDemo />
          <div className="card card-pad mk-float mk-float-1">
            <div className="row" style={{ gap: 10 }}>
              <div className="stat-ic" style={{ background: 'var(--success-50)', color: 'var(--success-text)' }}><TrendingUp size={16} /></div>
              <div>
                <div className="text-h3" style={{ margin: 0 }}>+47 leads</div>
                <div className="text-caption">captured today</div>
              </div>
            </div>
          </div>
          <div className="card card-pad mk-float mk-float-2">
            <div className="row" style={{ gap: 10 }}>
              <div className="stat-ic" style={{ background: 'var(--primary-50)', color: 'var(--primary-600)' }}><Sparkles size={16} /></div>
              <div>
                <div className="text-h3" style={{ margin: 0 }}>Auto-replied</div>
                <div className="text-caption">in 2 seconds</div>
              </div>
            </div>
          </div>
        </div>
      </header>
      </div>

      <section id="features" className="mk-section">
        <div className="h1" style={{ textAlign: 'center', marginBottom: 24 }}>Everything your Instagram inbox needs</div>
        <div className="grid grid-3">
          {features.map((f) => (
            <div key={f.title} className="card feature">
              <div className="ic"><f.ic size={22} /></div>
              <div className="h2" style={{ marginBottom: 6 }}>{f.title}</div>
              <div className="subtle">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mk-section">
        <div className="h1" style={{ textAlign: 'center', marginBottom: 24 }}>Before vs. after LeadOS</div>
        <div className="grid grid-2 mk-baf">
          <div className="card card-pad mk-baf-card mk-baf-before">
            <span className="text-overline">Before LeadOS</span>
            <div className="text-h2 mt8" style={{ marginBottom: 0 }}>Every DM, on you</div>
            {[
              'Typing the same "how much?" reply for the 50th time',
              'Hot leads buried under a pile of comments',
              'Customers waiting hours for a reply after hours',
              'No record of who said what, or who followed up',
            ].map((t) => (
              <div key={t} className="row mt16" style={{ gap: 10, alignItems: 'flex-start' }}>
                <X size={16} style={{ color: 'var(--danger-text)', flexShrink: 0, marginTop: 2 }} />
                <span>{t}</span>
              </div>
            ))}
          </div>
          <div className="card card-pad mk-baf-card mk-baf-after">
            <span className="text-overline" style={{ color: 'rgba(255,255,255,.75)' }}>After LeadOS</span>
            <div className="text-h2 mt8" style={{ marginBottom: 0, color: '#fff' }}>Every DM, handled</div>
            {[
              'Common questions answered instantly, automatically',
              'Every lead captured with name, number and full history',
              'Replies go out in seconds — day or night',
              'One inbox, one timeline, nothing falls through',
            ].map((t) => (
              <div key={t} className="row mt16" style={{ gap: 10, alignItems: 'flex-start' }}>
                <Check size={16} style={{ color: '#fff', flexShrink: 0, marginTop: 2 }} />
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-block">
        <div className="mk-section" style={{ textAlign: 'center' }}>
          <div className="text-display" style={{ color: '#fff', marginBottom: 12 }}>Less scrolling. More selling.</div>
          <p style={{ color: 'rgba(255,255,255,.85)', fontSize: 17, maxWidth: 560, margin: '0 auto' }}>
            LeadOS runs your Instagram inbox while you run your business — every message answered,
            every lead captured, every night and weekend covered.
          </p>
        </div>
      </section>

      <section className="mk-section" style={{ textAlign: 'center' }}>
        <div className="card card-pad">
          <div className="h1">Ready to automate your Instagram?</div>
          <p className="subtle">Connect your account and start capturing leads in under a minute.</p>
          <Link to="/signup" className="btn primary">Get started free →</Link>
        </div>
      </section>

      <footer className="mk-footer">
        <div className="row" style={{ justifyContent: 'center', gap: 18, marginBottom: 10 }}>
          <Link to="/privacy" className="subtle">Privacy Policy</Link>
          <Link to="/data-deletion" className="subtle">Data Deletion</Link>
        </div>
        © {new Date().getFullYear()} LeadOS — Instagram Lead Automation & Auto-Reply CRM.
      </footer>
    </div>
  );
}
