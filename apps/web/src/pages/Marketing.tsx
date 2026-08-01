import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles, MessageCircle, ShieldCheck, Check, X as XIcon, Send, AtSign, Target, Clock,
  ChevronDown, Rocket, PartyPopper, Zap,
} from 'lucide-react';

const DEMO_SCRIPT = [
  { dir: 'in', text: 'Hi! Do you have this in size M?' },
  { dir: 'out', text: 'Yes! Could you share your name and number so we can confirm stock for you?' },
  { dir: 'in', text: 'Priya, 98765xxxxx' },
  { dir: 'out', text: 'Thanks Priya — reserved for you 🎉 Our team will DM shipping details shortly.' },
] as const;

/** Auto-playing, looping chat demo — gives the hero a "video" feel without
 * needing an actual video asset or a stock photo of a stranger standing in
 * as a fake customer. Typing dots -> message appears -> repeat, then a
 * pause and reset. Freezes on the final state for prefers-reduced-motion. */
function AnimatedInboxDemo() {
  const [step, setStep] = useState(0);
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
          await new Promise((r) => { t = setTimeout(r, i === 0 ? 600 : 1000); });
          if (cancelled) return;
          setTyping(true);
          await new Promise((r) => { t = setTimeout(r, 700); });
          if (cancelled) return;
          setTyping(false);
          setStep(i + 1);
        }
        await new Promise((r) => { t = setTimeout(r, 2600); });
      }
    }
    run();
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  return (
    <div className="mc-mockup-wrap">
      <div className="mc-mockup-screen">
        <div className="mc-mockup-header">
          <MessageCircle size={16} /> Instagram DM
        </div>
        <div className="mk-demo-thread">
          {DEMO_SCRIPT.slice(0, step).map((m, i) => (
            <div key={i} className={`mc-mockup-bubble ${m.dir} mk-demo-msg`}>{m.text}</div>
          ))}
          {typing && (
            <div className="mc-mockup-bubble out mk-typing"><span /><span /><span /></div>
          )}
        </div>
      </div>
    </div>
  );
}

const CHECKLIST_ITEMS = [
  { icon: Send, label: 'Send links', active: false },
  { icon: AtSign, label: 'Reply to comments', active: false },
  { icon: MessageCircle, label: 'Reply to DMs', active: true },
  { icon: Target, label: 'Capture leads', active: false },
];

/** Original illustrated panel — no stock photo of a stranger standing in as
 * a fake customer. A soft gradient card with a rotating spotlight on the
 * "Reply to DMs" checklist item and a floating chat bubble pair, giving the
 * same "automatically doing things for you" feeling with 100% original
 * shapes/icons instead of borrowed photography. */
function AutomaticallyPanel() {
  const [active, setActive] = useState(2);
  useEffect(() => {
    const id = setInterval(() => setActive((a) => (a + 1) % CHECKLIST_ITEMS.length), 1800);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="mc-illustration">
      <div className="mc-illustration-glow" />
      <div className="mc-illustration-icon"><Zap size={40} /></div>
      <div className="mc-illustration-chip mc-illustration-chip-1">
        <MessageCircle size={14} /> DM answered
      </div>
      <div className="mc-illustration-chip mc-illustration-chip-2">
        <Target size={14} /> Lead captured
      </div>
      <div className="mc-illustration-list">
        {CHECKLIST_ITEMS.map((item, i) => (
          <div key={item.label} className={`mc-illustration-row ${i === active ? 'active' : ''}`}>
            <item.icon size={16} /> {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Marketing() {
  return (
    <div style={{ background: '#fff', minHeight: '100vh', overflowX: 'hidden' }}>

      {/* Purple hero */}
      <div className="mk-purple-section" style={{ minHeight: '80vh', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <nav className="mk-nav-white">
          <div className="brand" style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.05em', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={24} />
            LeadOS
          </div>
          <div style={{ display: 'flex', gap: 32 }}>
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Link to="/signup" className="btn white-outline">Get Started</Link>
            <Link to="/login" style={{ fontSize: 13, fontWeight: 700 }}>Sign In</Link>
          </div>
        </nav>

        <header className="mk-hero-mc">
          <div style={{ flex: 1, paddingBottom: 80 }}>
            <h1>Your Instagram<br />just got smarter</h1>
            <p>
              Every DM and comment answered automatically, every lead captured with
              their name and number, and nothing left waiting — even while you sleep.
            </p>
            <Link to="/signup" className="btn-white-solid">
              Get Started
            </Link>
          </div>

          <div className="mc-hero-visual">
            <AnimatedInboxDemo />
          </div>
        </header>

        <div className="mc-partner-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={18} /> Real Meta OAuth — connect your own Instagram Business account
          </div>
          <div>No credit card required</div>
          <div>Setup in minutes</div>
        </div>
      </div>

      {/* White section */}
      <section className="mc-white-section">
        <div style={{ color: 'var(--primary)', display: 'flex', justifyContent: 'center' }}>
          <Sparkles size={48} />
        </div>
        <h2>Put Instagram growth on autopilot</h2>
        <p style={{ fontSize: 20, color: 'var(--muted)', maxWidth: 600, margin: '0 auto', lineHeight: 1.5 }}>
          Managing everyone who wants a piece of your time in DMs and comments? Here's how LeadOS
          makes engaging — at scale — so much easier.
        </p>
      </section>

      {/* Split section */}
      <section id="how-it-works" className="mc-split-section">
        <div className="mc-split-half purple">
          <h2>Turn comments into conversations that sell</h2>
          <p>
            "How much is this?" or "Do you have my size?" Instant reply.<br />
            Their name and number captured, a lead created — you didn't even blink.
          </p>
        </div>
        <div className="mc-split-half" style={{ background: '#f5f5f5' }}>
          <AnimatedInboxDemo />
        </div>
      </section>

      {/* Automatically checklist */}
      <section className="mc-white-section" style={{ padding: '80px 20px' }}>
        <div className="mc-auto-layout">
          <div className="mc-auto-copy">
            <span className="text-overline" style={{ color: 'var(--muted)' }}>Automatically</span>
            <div className="mc-auto-list">
              {CHECKLIST_ITEMS.map((item) => (
                <div key={item.label} className="mc-auto-item">
                  <Check size={18} /> {item.label}
                </div>
              ))}
            </div>
          </div>
          <AutomaticallyPanel />
        </div>
      </section>

      {/* Before / After */}
      <section className="mk-section">
        <div className="grid grid-2 mk-baf">
          <div className="card card-pad mk-baf-card mk-baf-before">
            <span className="text-overline">Before LeadOS:</span>
            <div className="mk-baf-heading">All work<br />and no play</div>
            {[
              'Copy-pasting the same reply 417 times.',
              'Losing hot leads in endless DMs.',
              'Missed sales while you sleep.',
              'Every comment buries you deeper.',
            ].map((t) => (
              <div key={t} className="row mt16" style={{ gap: 10, alignItems: 'flex-start' }}>
                <XIcon size={16} style={{ color: 'var(--danger-text)', flexShrink: 0, marginTop: 2 }} />
                <span>{t}</span>
              </div>
            ))}
            <Link to="/signup" className="btn block mt16" style={{ background: '#111', color: '#fff', borderRadius: 99 }}>Get Started</Link>
          </div>
          <div className="card card-pad mk-baf-card mk-baf-after">
            <span className="text-overline" style={{ color: 'rgba(255,255,255,.75)' }}>After LeadOS:</span>
            <div className="mk-baf-heading" style={{ color: '#fff' }}>Less grind and<br />more pay</div>
            {[
              'Smart replies handle FAQs instantly.',
              'Organized, tagged, scored leads.',
              'Sales go out 24/7 — even asleep.',
              'Every comment is a chance to convert.',
            ].map((t) => (
              <div key={t} className="row mt16" style={{ gap: 10, alignItems: 'flex-start' }}>
                <Check size={16} style={{ color: '#fff', flexShrink: 0, marginTop: 2 }} />
                <span>{t}</span>
              </div>
            ))}
            <Link to="/signup" className="btn white-solid-pill block mt16">Get Started</Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mk-section">
        <div className="h1" style={{ textAlign: 'center', marginBottom: 40, fontSize: 40, fontWeight: 900, letterSpacing: '-0.02em' }}>
          Everything your Instagram inbox needs
        </div>
        <div className="grid grid-3">
          {[
            { title: 'Instagram Inbox', desc: 'Every DM and comment on your Instagram Business account, in one clean inbox.' },
            { title: 'Automatic Lead Capture', desc: 'A new conversation becomes a lead instantly — name, contact info and full history saved automatically.' },
            { title: 'Smart Auto-Reply', desc: 'Answer common questions instantly with keyword rules, or let AI reply naturally when nothing matches.' },
            { title: 'Follow-up Sequences', desc: 'Never leave a customer hanging — automatically follow up with a chain of messages if they go quiet.' },
            { title: 'Lead Scoring & Pipeline', desc: 'Every lead scored and prioritized, tracked through a real pipeline with conversion reporting.' },
            { title: 'Real Meta OAuth', desc: 'Connect your own Instagram Business account in a few clicks — no developer setup required.' },
          ].map((f) => (
            <div key={f.title} className="card feature">
              <div className="h2" style={{ marginBottom: 6 }}>{f.title}</div>
              <div className="subtle">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* New to automation? */}
      <section className="mc-white-section" style={{ padding: '80px 20px' }}>
        <div className="mc-onboard-ic"><Rocket size={40} /></div>
        <h2 style={{ fontSize: 40 }}>New to automation?<br />Don't sweat it.</h2>
        <p style={{ fontSize: 18, color: 'var(--muted)', maxWidth: 560, margin: '0 auto 48px', lineHeight: 1.5 }}>
          No chatbot experience needed. Connect Instagram and you're capturing leads in minutes.
        </p>
        <div className="grid grid-3 mc-onboard-grid">
          <div className="mc-onboard-card yellow">
            <Link to="/signup" className="btn mc-pill-dark">Get Started Free</Link>
            <div className="text-h3 mt24">Sign up for free</div>
            <div className="subtle">Start your free trial — no credit card required</div>
          </div>
          <div className="mc-onboard-card list">
            {[
              { icon: Zap, label: 'Auto Reply Rules' },
              { icon: Clock, label: 'Follow-up Sequences' },
              { icon: Target, label: 'Lead Scoring' },
              { icon: MessageCircle, label: 'Instagram Inbox' },
            ].map((s) => (
              <div key={s.label} className="mc-onboard-row">
                <span className="row" style={{ gap: 8 }}><s.icon size={15} /> {s.label}</span>
                <span className="mc-pill-mini">Set up</span>
              </div>
            ))}
            <div className="text-h3 mt24">Go live in minutes</div>
            <div className="subtle">Seriously, it's that simple</div>
          </div>
          <div className="mc-onboard-card lavender">
            <div className="mc-onboard-badge"><PartyPopper size={22} /></div>
            <div className="text-h3 mt24">Cancel anytime</div>
            <div className="subtle">Spoiler: you won't want to</div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mk-purple-section" style={{ padding: '80px 20px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <div className="mc-onboard-ic" style={{ background: 'rgba(255,255,255,.15)', color: '#fff' }}><Sparkles size={32} /></div>
          <h2 style={{ color: '#fff', fontSize: 40 }}>Frequently asked questions</h2>
        </div>
        <div style={{ maxWidth: 760, margin: '32px auto 0' }}>
          {[
            { q: 'Will connecting LeadOS get my Instagram account restricted?', a: "No. LeadOS uses Meta's official Instagram Graph API through real OAuth — the same access method Meta itself provides to businesses, not scraping or automation that violates their terms." },
            { q: 'Do I need to know how to code?', a: 'No. Auto-reply rules and follow-up sequences are built through simple forms — name a keyword, write a message, set a delay.' },
            { q: 'What happens to leads captured from DMs?', a: 'Every DM conversation becomes a lead automatically, with their name and number captured through the conversation, scored, and tracked through a real pipeline.' },
            { q: 'Can I still reply manually?', a: "Yes — the Inbox shows every DM and comment in real time, and you can jump in and reply yourself any time, automation or not." },
          ].map((f) => (
            <details key={f.q} className="mc-faq-item">
              <summary>{f.q} <ChevronDown size={18} className="mc-faq-chevron" /></summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mk-section" style={{ textAlign: 'center' }}>
        <div className="card card-pad">
          <div className="h1">Ready to automate your Instagram?</div>
          <p className="subtle">Connect your account and start capturing leads in under a minute.</p>
          <Link to="/signup" className="btn primary">Get started free →</Link>
        </div>
      </section>

      <footer className="mc-footer-dark">
        <div className="mc-footer-big">
          Automate your <span>Instagram</span>
        </div>
        <div className="row" style={{ justifyContent: 'center', gap: 24, marginTop: 32, fontWeight: 600, fontSize: 14 }}>
          <Link to="/privacy" style={{ color: 'rgba(255,255,255,.7)' }}>Privacy Policy</Link>
          <Link to="/data-deletion" style={{ color: 'rgba(255,255,255,.7)' }}>Data Deletion</Link>
        </div>
        <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 13, marginTop: 16 }}>© {new Date().getFullYear()} LeadOS</div>
      </footer>
    </div>
  );
}
