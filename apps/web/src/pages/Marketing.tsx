import { Link } from 'react-router-dom';
import { Target, Bot, UserCircle2, MessageCircle, Zap, Clock, Check } from 'lucide-react';

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
            <a href="#pricing" className="subtle">Pricing</a>
            <Link to="/login" className="btn outline sm">Log in</Link>
            <Link to="/signup" className="btn primary sm">Get Started</Link>
          </div>
        </nav>
      </div>

      <header className="mk-hero">
        <span className="pill">Instagram DMs & Comments, Automated</span>
        <h1>Turn every Instagram message into a customer.</h1>
        <p>
          LeadOS connects to your Instagram Business account, automatically captures leads from
          every DM and comment, and replies for you — so no customer waits, and nothing falls
          through the cracks.
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link to="/signup" className="btn primary">Start free →</Link>
          <a href="#features" className="btn outline">See features</a>
        </div>
      </header>

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
        <div className="card card-pad" style={{ background: 'linear-gradient(135deg,#eef2ff,#faf5ff)' }}>
          <div className="grid grid-2" style={{ alignItems: 'center' }}>
            <div>
              <span className="pill">Instagram lead capture</span>
              <div className="h1">From DM to customer — automatically</div>
              <p className="subtle">
                A new Instagram message becomes a lead instantly. LeadOS asks for the customer's
                name and phone number, captures the details, and replies right away — for real, on
                your connected Instagram account.
              </p>
            </div>
            <div className="card card-pad">
              <div className="msg in">Hi, I want pricing</div>
              <div className="msg out">Thanks for reaching out! Could you share your name and phone number so our team can help you faster?</div>
              <div className="msg in">My name is Rahul, phone 9876543210</div>
              <div className="msg out">Thanks Rahul. Our team will contact you shortly.</div>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="mk-section">
        <div className="h1" style={{ textAlign: 'center', marginBottom: 24 }}>Simple, transparent pricing</div>
        <div className="grid grid-3">
          {[
            { name: 'Starter', amt: '₹0', note: 'For trying it out', feats: ['1 Instagram account', 'Up to 500 leads', 'Auto-reply rules'] },
            { name: 'Pro', amt: '₹2,499', note: 'per month', feats: ['Unlimited leads', 'AI-powered replies', 'Follow-up sequences'], hi: true },
            { name: 'Enterprise', amt: "Let's talk", note: 'custom', feats: ['Multiple team members', 'Priority support', 'Custom onboarding'] },
          ].map((p) => (
            <div key={p.name} className="card price-card" style={p.hi ? { borderColor: 'var(--primary)', boxShadow: 'var(--shadow-lg)' } : {}}>
              {p.hi && <span className="pill">Most popular</span>}
              <div className="h2">{p.name}</div>
              <div className="amt">{p.amt}</div>
              <div className="subtle">{p.note}</div>
              <div className="mt16" style={{ textAlign: 'left' }}>
                {p.feats.map((f) => (
                  <div key={f} className="row mt8" style={{ gap: 8, alignItems: 'center' }}>
                    <Check size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} /> {f}
                  </div>
                ))}
              </div>
              <Link to="/signup" className={`btn ${p.hi ? 'primary' : 'outline'} block mt16`}>Choose {p.name}</Link>
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
