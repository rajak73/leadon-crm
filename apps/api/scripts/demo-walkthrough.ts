export {};
/**
 * Demo walkthrough (presentation helper). Drives the LIVE API end-to-end and
 * narrates each step, so you can run it in front of an audience or record it.
 *
 * Prereq: the API must be running (pnpm --filter @leados/api dev).
 * Run:  API_URL=http://localhost:4000 tsx scripts/demo-walkthrough.ts
 *
 * It creates a throwaway demo workspace (unique email) and exercises the core
 * flows. It does not touch existing data.
 */

const API = process.env.API_URL || 'http://localhost:4000';
const PW = 'LeadOS@123';

let token = '';
let orgId = '';

function log(step: string, detail = '') {
  console.log(`\n\x1b[36m▶ ${step}\x1b[0m${detail ? '\n  ' + detail : ''}`);
}
function ok(msg: string) {
  console.log(`  \x1b[32m✔\x1b[0m ${msg}`);
}

async function call(method: string, path: string, body?: unknown, useOrg = true) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (useOrg && orgId) headers['X-Org-Id'] = orgId;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok && res.status >= 400) {
    // Some steps intentionally expect non-2xx; caller decides.
  }
  return { status: res.status, data };
}

async function main() {
  console.log('\n=========================================');
  console.log('  LeadOS — Live Demo Walkthrough');
  console.log('=========================================');

  // 1. Health
  log('1) API health check');
  const health = await call('GET', '/health', undefined, false);
  ok(`API is ${health.data.status} (env: ${health.data.env})`);

  // 2. Signup (creates workspace)
  const email = `demo.${Date.now()}@walkthrough.test`;
  log('2) Sign up — creates a user + workspace, user becomes OWNER (BRD §21.1)');
  const signup = await call('POST', '/api/v1/auth/signup', {
    firstName: 'Demo', lastName: 'Owner', email, password: PW, workspaceName: 'Demo Realty',
  }, false);
  token = signup.data.token;
  orgId = signup.data.organizations[0].organizationId;
  const slug = signup.data.organizations[0].organizationSlug;
  ok(`Workspace "Demo Realty" created (${slug}), logged in as OWNER`);

  // 3. Create a lead manually
  log('3) Create a lead manually (BRD §10.6)');
  const lead = await call('POST', '/api/v1/leads', { name: 'Ananya Gupta', phone: '9800011122', source: 'REFERRAL', status: 'NEW' });
  ok(`Lead "${lead.data.name}" created — source ${lead.data.source}`);

  // 4. Social simulation + interactive capture
  log('4) Simulate an Instagram DM — system asks for name/phone (BRD §11, §12)');
  const sim1 = await call('POST', '/api/v1/simulation/webhook', { channel: 'INSTAGRAM', senderId: 'demo_ig_1', text: 'Hi, I want pricing', drainNow: true });
  ok(`Captured: ${sim1.data.drained.results[0].detail}`);
  const sim2 = await call('POST', '/api/v1/simulation/webhook', { channel: 'INSTAGRAM', senderId: 'demo_ig_1', text: 'My name is Rahul and my phone is 9876543210', drainNow: true });
  ok(`After details: ${sim2.data.drained.results[0].detail}`);

  // 5. Inbox
  log('5) View the inbox — the DM became a conversation (BRD §10.10)');
  const convs = await call('GET', '/api/v1/conversations');
  ok(`${convs.data.length} conversation(s) in the inbox`);

  // 6. AI: score all leads + next best action
  log('6) AI — score leads & get next best action (rule-based, BRD §13)');
  const scoreAll = await call('POST', '/api/v1/ai/score-all', {});
  ok(`Scored ${scoreAll.data.updated} leads (mode: ${scoreAll.data.mode})`);
  const nba = await call('GET', `/api/v1/ai/next-best-action/${lead.data.id}`);
  ok(`Next best action for Ananya: "${nba.data.action}" — ${nba.data.why}`);

  // 7. Pipeline: create a deal + view kanban
  log('7) Create a deal and view the Kanban pipeline (BRD §10.8)');
  const board = await call('GET', '/api/v1/deals/pipeline');
  const stageId = board.data.columns[0].stage.id;
  await call('POST', '/api/v1/deals', { title: '3BHK Apartment', value: 8500000, stageId });
  const board2 = await call('GET', '/api/v1/deals/pipeline');
  ok(`Pipeline total value: ₹${board2.data.totalPipelineValue.toLocaleString('en-IN')}`);

  // 8. Workflow automation
  log('8) Automation — create a workflow, then trigger it (BRD §8.1)');
  await call('POST', '/api/v1/workflows', {
    name: 'Auto-task on qualify', isActive: true,
    definition: { trigger: { event: 'LEAD_STATUS_CHANGED', status: 'QUALIFIED' }, action: { type: 'CREATE_TASK', taskTitle: 'Prepare proposal', taskPriority: 'HIGH' } },
  });
  await call('PATCH', `/api/v1/leads/${lead.data.id}`, { status: 'QUALIFIED' });
  const tasks = await call('GET', `/api/v1/tasks?leadId=${lead.data.id}`);
  const autoTask = tasks.data.tasks.find((t: any) => t.title === 'Prepare proposal');
  ok(autoTask ? 'Workflow fired → task "Prepare proposal" auto-created' : 'Workflow created (task pending)');

  // 9. Web form
  log('9) Public web form — capture a website lead (BRD §15.2)');
  const form = await call('POST', `/api/v1/forms/${slug}/submit`, { name: 'Website Visitor', phone: '9111100011', message: 'Interested!' }, false);
  ok(form.data.ok ? 'Web-form lead captured (no auth needed)' : 'Web form responded');

  // 10. Billing
  log('10) Billing — view plan & usage (BRD §15)');
  const sub = await call('GET', '/api/v1/billing/subscription');
  ok(`Plan ${sub.data.plan} — leads ${sub.data.usage.leads}/${sub.data.limits.leads < 0 ? '∞' : sub.data.limits.leads} (mode: ${sub.data.mode})`);

  // 11. Dashboard
  log('11) Dashboard summary (BRD §10.5)');
  const dash = await call('GET', '/api/v1/dashboard');
  ok(`Leads ${dash.data.counts.leads} · Deals ${dash.data.counts.deals} · Open tasks ${dash.data.counts.openTasks} · Pipeline ₹${dash.data.pipelineValue.toLocaleString('en-IN')}`);

  console.log('\n\x1b[32m=========================================');
  console.log('  Walkthrough complete ✔');
  console.log('=========================================\x1b[0m');
  console.log(`\nDemo workspace: ${email} / ${PW}`);
  console.log('Open the web app and log in to explore the same data.\n');
}

main().catch((e) => {
  console.error('\n✖ Walkthrough failed:', e instanceof Error ? e.message : e);
  console.error('  Is the API running?  pnpm --filter @leados/api dev');
  process.exit(1);
});