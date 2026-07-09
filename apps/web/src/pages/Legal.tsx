import { Link } from 'react-router-dom';

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 24px' }}>
      <nav className="mk-nav" style={{ padding: '0 0 24px' }}>
        <Link to="/" className="brand" style={{ fontSize: 22 }}>LeadOS</Link>
        <Link to="/" className="subtle">← Home</Link>
      </nav>
      <div className="card card-pad">
        <div className="h1">{title}</div>
        <p className="subtle">Last updated: {new Date().toISOString().slice(0, 10)}</p>
        {children}
      </div>
      <div className="mk-footer">© {new Date().getFullYear()} LeadOS</div>
    </div>
  );
}

export function PrivacyPolicy() {
  return (
    <Shell title="Privacy Policy">
      <h3>Overview</h3>
      <p>LeadOS is a multi-tenant CRM that helps businesses capture and manage leads from
        channels including Instagram, WhatsApp and Facebook. This policy explains what data we
        process and how it is protected.</p>

      <h3>Data we process</h3>
      <ul>
        <li><strong>Account data:</strong> your name, email and workspace details.</li>
        <li><strong>Lead & customer data:</strong> names, phone numbers, emails and messages that
          your customers send to your connected social/business accounts.</li>
        <li><strong>Message content:</strong> inbound and outbound messages exchanged through
          connected channels, stored to power your CRM inbox and history.</li>
      </ul>

      <h3>How we use it</h3>
      <p>Data is used solely to provide CRM functionality to the organization that owns it. Each
        organization's data is strictly isolated; we do not sell personal data.</p>

      <h3>Meta Platform data</h3>
      <p>When you connect Instagram, WhatsApp or Facebook, we receive messages sent to your business
        account via the Meta APIs. We use this only to create and manage leads and conversations in
        your workspace. We honor Meta's data-deletion and deauthorize callbacks.</p>

      <h3>Data retention & security</h3>
      <p>Data is retained while your account is active and deleted on request. Access is
        role-based; secrets and access tokens are stored server-side and never exposed to clients.</p>

      <h3>Your rights</h3>
      <p>You may request access to, correction of, or deletion of your personal data. See our
        <Link to="/data-deletion" style={{ color: 'var(--primary)' }}> Data Deletion Instructions</Link>.</p>

      <h3>Contact</h3>
      <p>For privacy questions, contact privacy@leados.example.</p>
    </Shell>
  );
}

export function DataDeletion() {
  return (
    <Shell title="Data Deletion Instructions">
      <p>You can request deletion of your personal data held by LeadOS at any time.</p>

      <h3>Option 1 — Automatic (via Facebook/Instagram)</h3>
      <p>If you interacted with a business through Facebook or Instagram and remove the app's access,
        Meta notifies LeadOS through its data-deletion callback. We then delete the messages we hold
        for you and anonymize any lead record created from your conversation, and provide a
        confirmation code and status page.</p>

      <h3>Option 2 — Manual request</h3>
      <ol>
        <li>Email <strong>privacy@leados.example</strong> with the subject "Data Deletion Request".</li>
        <li>Include the phone number or social handle you used to contact the business.</li>
        <li>We will delete the associated data within 30 days and confirm by email.</li>
      </ol>

      <h3>What gets deleted</h3>
      <ul>
        <li>All stored message content from your conversations.</li>
        <li>Personal identifiers (name, phone, email) on any lead created from your messages.</li>
      </ul>

      <p className="subtle">Data-deletion callback endpoint (for Meta App configuration):
        <code> /api/v1/webhooks/meta/data-deletion</code></p>
    </Shell>
  );
}
