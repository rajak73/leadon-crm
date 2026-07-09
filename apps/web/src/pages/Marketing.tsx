import { Link } from 'react-router-dom';

const features = [
  { ic: '🎯', title: 'Unified Lead Capture', desc: 'Instagram, WhatsApp, Facebook, website, referrals and manual — every lead in one place.' },
  { ic: '🤖', title: 'AI-Ready Assistant', desc: 'Rule-based capture today, AI scoring & reply suggestions ready to switch on.' },
  { ic: '👤', title: 'Customer 360', desc: 'Full identity, timeline, messages, deals, tasks and next best action per customer.' },
  { ic: '🗂️', title: 'Visual Pipeline', desc: 'Drag deals across stages with live totals and probability.' },
  { ic: '💬', title: 'Social Inbox', desc: 'Centralize conversations and convert any chat into a tracked lead.' },
  { ic: '🛡️', title: 'Safe Multi-Tenant', desc: 'Strict organization isolation with a Super Admin control panel.' },
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
        <span className="pill">AI-Powered CRM & Social Lead Automation</span>
        <h1>Turn every conversation into revenue.</h1>
        <p>
          LeadOS centralizes leads from Instagram, WhatsApp, Facebook, websites and sales teams —
          then helps you follow up, track deals and convert, all from one premium workspace.
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link to="/signup" className="btn primary">Start free →</Link>
          <a href="#features" className="btn outline">See features</a>
        </div>
      </header>

      <section id="features" className="mk-section">
        <div className="h1" style={{ textAlign: 'center', marginBottom: 24 }}>Everything your revenue team needs</div>
        <div className="grid grid-3">
          {features.map((f) => (
            <div key={f.title} className="card feature">
              <div className="ic">{f.ic}</div>
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
              <span className="pill">Social lead capture</span>
              <div className="h1">From DM to deal — automatically</div>
              <p className="subtle">
                A new Instagram or WhatsApp message becomes a lead instantly. LeadOS asks for the
                customer's name and phone, captures the details, and notifies your team — currently in
                a safe simulation mode, ready for real Meta integration.
              </p>
            </div>
            <div className="card card-pad">
              <div className="msg in">Hi, I want pricing</div>
              <div className="msg out">Thanks for reaching out. Please share your name and phone number so our team can help you faster.</div>
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
            { name: 'Starter', amt: '₹0', note: 'For trying it out', feats: ['1 workspace', 'Up to 500 leads', 'Social simulation'] },
            { name: 'Pro', amt: '₹2,499', note: 'per month', feats: ['Unlimited leads', 'Pipeline & tasks', 'Team roles'], hi: true },
            { name: 'Enterprise', amt: "Let's talk", note: 'custom', feats: ['Real Meta integration', 'AI scoring', 'Priority support'] },
          ].map((p) => (
            <div key={p.name} className="card price-card" style={p.hi ? { borderColor: 'var(--primary)', boxShadow: 'var(--shadow-lg)' } : {}}>
              {p.hi && <span className="pill">Most popular</span>}
              <div className="h2">{p.name}</div>
              <div className="amt">{p.amt}</div>
              <div className="subtle">{p.note}</div>
              <div className="mt16" style={{ textAlign: 'left' }}>
                {p.feats.map((f) => <div key={f} className="mt8">✓ {f}</div>)}
              </div>
              <Link to="/signup" className={`btn ${p.hi ? 'primary' : 'outline'} block mt16`}>Choose {p.name}</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="mk-section" style={{ textAlign: 'center' }}>
        <div className="card card-pad">
          <div className="h1">Ready to organize your leads?</div>
          <p className="subtle">Create your workspace in under a minute.</p>
          <Link to="/signup" className="btn primary">Get started free →</Link>
        </div>
      </section>

      <footer className="mk-footer">
        <div className="row" style={{ justifyContent: 'center', gap: 18, marginBottom: 10 }}>
          <Link to="/privacy" className="subtle">Privacy Policy</Link>
          <Link to="/data-deletion" className="subtle">Data Deletion</Link>
        </div>
        © {new Date().getFullYear()} LeadOS — AI-Powered CRM & Social Lead Automation Platform.
      </footer>
    </div>
  );
}
