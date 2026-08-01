import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, MessageCircle, ShieldCheck } from 'lucide-react';

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

      <section className="mk-section" style={{ textAlign: 'center' }}>
        <div className="card card-pad">
          <div className="h1">Ready to automate your Instagram?</div>
          <p className="subtle">Connect your account and start capturing leads in under a minute.</p>
          <Link to="/signup" className="btn primary">Get started free →</Link>
        </div>
      </section>

      <footer style={{ background: '#fff', padding: '80px 20px', textAlign: 'center', borderTop: '1px solid #eee' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 24, fontWeight: 600, fontSize: 14 }}>
          <Link to="/privacy" style={{ color: 'var(--muted)' }}>Privacy Policy</Link>
          <Link to="/data-deletion" style={{ color: 'var(--muted)' }}>Data Deletion</Link>
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>© {new Date().getFullYear()} LeadOS</div>
      </footer>
    </div>
  );
}
