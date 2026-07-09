export {};
/**
 * Demo seed (BRD §18). Creates three demo organizations with fake, safe data
 * for local/staging verification and presentation. NEVER runs in production.
 *
 * Guardrails (BRD §18, §20, Risk 2):
 *   - Requires ALLOW_DEMO_SEED=true
 *   - Refuses NODE_ENV=production
 *   - Blocks production-looking DB URLs
 *   - Fake emails (@demo.test) and fake phone numbers
 *   - Idempotent (scoped deleteMany by demo org slugs, then recreate)
 *   - No real Meta calls
 *
 * Safe run:
 *   ALLOW_DEMO_SEED=true pnpm --filter @leados/api demo:seed
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/prisma.js';
import { config } from '../src/config.js';
import { DEFAULT_PIPELINE_STAGES, OrgRole } from '@leados/shared';

function assertSafe() {
  if (!config.allowDemoSeed) throw new Error('Refusing to seed: set ALLOW_DEMO_SEED=true.');
  if (config.isProduction) throw new Error('Refusing to seed: NODE_ENV=production is blocked (BRD §18).');
  const url = process.env.DATABASE_URL ?? '';
  const looksProd = /neon\.tech|render\.com|amazonaws|prod/i.test(url) && !/staging|dev|local/i.test(url);
  if (looksProd) throw new Error('Refusing to seed: DATABASE_URL looks like production (BRD §18).');
}

const DEMO = [
  {
    slug: 'technova-realty',
    name: 'TechNova Realty',
    owner: { firstName: 'Meera', lastName: 'Nair', email: 'meera@demo.test' },
    leads: [
      { name: 'Rahul Verma', phone: '9000000001', source: 'INSTAGRAM', status: 'NEW', score: 60 },
      { name: 'Priya Singh', phone: '9000000002', source: 'WHATSAPP', status: 'CONTACTED', score: 75 },
      { name: 'Amit Shah', phone: '9000000003', source: 'WEBSITE', status: 'QUALIFIED', score: 82 },
    ],
    deals: [
      { title: '3BHK Sea View Apartment', value: 12000000, stageKey: 'QUALIFIED' },
      { title: 'Commercial Plot - Sector 21', value: 8500000, stageKey: 'PROPOSAL_SENT' },
    ],
  },
  {
    slug: 'growthbridge-agency',
    name: 'GrowthBridge Agency',
    owner: { firstName: 'Karan', lastName: 'Mehta', email: 'karan@demo.test' },
    leads: [
      { name: 'Startup Founder A', phone: '9000000011', source: 'CAMPAIGN', status: 'NEW', score: 50 },
      { name: 'D2C Brand B', phone: '9000000012', source: 'REFERRAL', status: 'NEGOTIATION', score: 90 },
    ],
    deals: [
      { title: 'Monthly Retainer - Brand B', value: 250000, stageKey: 'NEGOTIATION' },
      { title: 'Launch Campaign - Startup A', value: 150000, stageKey: 'CONTACTED' },
    ],
  },
  {
    slug: 'curecare-clinic',
    name: 'CureCare Clinic',
    owner: { firstName: 'Dr. Anita', lastName: 'Rao', email: 'anita@demo.test' },
    leads: [
      { name: 'Patient Inquiry 1', phone: '9000000021', source: 'WHATSAPP', status: 'NEW', score: 40 },
      { name: 'Patient Inquiry 2', phone: '9000000022', source: 'INSTAGRAM', status: 'CONTACTED', score: 55 },
    ],
    deals: [{ title: 'Dental Package - 6 sittings', value: 45000, stageKey: 'PROPOSAL_SENT' }],
  },
];

async function main() {
  assertSafe();
  console.log('Seeding demo data (safe mode)...');

  const passwordHash = await bcrypt.hash('LeadOS@123', 10);

  // Idempotent: remove existing demo orgs (cascades child rows).
  for (const d of DEMO) {
    await prisma.organization.deleteMany({ where: { slug: d.slug } });
  }

  for (const d of DEMO) {
    const user = await prisma.user.upsert({
      where: { email: d.owner.email },
      update: {},
      create: {
        email: d.owner.email,
        passwordHash,
        firstName: d.owner.firstName,
        lastName: d.owner.lastName,
      },
    });

    const org = await prisma.organization.create({ data: { name: d.name, slug: d.slug } });
    await prisma.organizationMember.create({
      data: { userId: user.id, organizationId: org.id, role: OrgRole.OWNER },
    });
    await prisma.subscription.create({ data: { organizationId: org.id, plan: 'TRIAL' } });

    const pipeline = await prisma.pipeline.create({
      data: { organizationId: org.id, name: 'Sales Pipeline', isDefault: true },
    });
    await prisma.pipelineStage.createMany({
      data: DEFAULT_PIPELINE_STAGES.map((s) => ({
        pipelineId: pipeline.id,
        key: s.key,
        name: s.name,
        order: s.order,
        probability: s.probability,
      })),
    });
    const stages = await prisma.pipelineStage.findMany({ where: { pipelineId: pipeline.id } });

    for (const l of d.leads) {
      await prisma.lead.create({
        data: {
          organizationId: org.id,
          name: l.name,
          phone: l.phone,
          source: l.source,
          status: l.status,
          score: l.score,
          assignedUserId: user.id,
          lastActivityAt: new Date(),
        },
      });
    }

    for (const dl of d.deals) {
      const stage = stages.find((s) => s.key === dl.stageKey) ?? stages[0];
      await prisma.deal.create({
        data: {
          organizationId: org.id,
          title: dl.title,
          value: dl.value,
          pipelineId: pipeline.id,
          stageId: stage.id,
          probability: stage.probability,
          ownerId: user.id,
          status: stage.key === 'WON' ? 'WON' : stage.key === 'LOST' ? 'LOST' : 'OPEN',
        },
      });
    }

    // A few tasks with due dates (some overdue, some upcoming).
    await prisma.task.createMany({
      data: [
        { organizationId: org.id, title: `Call first lead (${d.name})`, status: 'OPEN', priority: 'HIGH', assignedUserId: user.id, dueDate: new Date(Date.now() + 86400000) },
        { organizationId: org.id, title: 'Send brochure', status: 'OPEN', priority: 'MEDIUM', assignedUserId: user.id, dueDate: new Date(Date.now() - 86400000) },
        { organizationId: org.id, title: 'Schedule site visit', status: 'DONE', priority: 'LOW', assignedUserId: user.id },
      ],
    });

    // Rich inbox: a couple of conversations per org, including a full
    // interactive capture journey (§12) shown as real messages.
    const createdLeads = await prisma.lead.findMany({ where: { organizationId: org.id }, take: 2 });
    const channels = ['INSTAGRAM', 'WHATSAPP'];
    for (let ci = 0; ci < channels.length; ci++) {
      const channel = channels[ci];
      const lead = createdLeads[ci] ?? createdLeads[0];
      const conv = await prisma.conversation.create({
        data: {
          organizationId: org.id,
          channel,
          externalId: `demo_${channel.toLowerCase()}_${ci}`,
          customerName: lead?.name ?? 'Prospect',
          leadId: lead?.id ?? null,
        },
      });
      // A realistic capture thread.
      const thread = [
        { direction: 'INBOUND', body: 'Hi, I saw your post — can you share pricing?' },
        { direction: 'OUTBOUND', body: 'Thanks for reaching out! Please share your name and phone number so our team can help you faster.' },
        { direction: 'INBOUND', body: `My name is ${lead?.name?.split(' ')[0] ?? 'Sam'} and my phone is ${lead?.phone ?? '9000000000'}` },
        { direction: 'OUTBOUND', body: `Thanks ${lead?.name?.split(' ')[0] ?? 'Sam'}. Our team will contact you shortly.` },
      ];
      let t = Date.now() - 3600_000;
      for (const m of thread) {
        await prisma.message.create({
          data: {
            organizationId: org.id,
            conversationId: conv.id,
            direction: m.direction,
            body: m.body,
            status: m.direction === 'OUTBOUND' ? 'SENT' : 'RECEIVED',
            isSimulation: true,
            createdAt: new Date(t),
          },
        });
        t += 60_000;
      }
      await prisma.activity.create({
        data: { organizationId: org.id, type: 'LEAD_DETAILS_CAPTURED', message: `Captured details via ${channel}`, leadId: lead?.id ?? null },
      });
    }

    // A sample active workflow (auto-task on qualify).
    await prisma.workflow.create({
      data: {
        organizationId: org.id,
        name: 'Auto-task on qualify',
        isActive: true,
        definition: JSON.stringify({
          trigger: { event: 'LEAD_STATUS_CHANGED', status: 'QUALIFIED' },
          action: { type: 'CREATE_TASK', taskTitle: 'Prepare proposal for qualified lead', taskPriority: 'HIGH' },
        }),
      },
    });

    console.log(`  ✔ ${d.name} (owner ${d.owner.email} / LeadOS@123) — leads, deals, tasks, 2 conversations, 1 workflow`);
  }

  console.log('\n✔ Demo seed complete. Login with any owner email above / password LeadOS@123');

  // Promote the first demo owner to Super Admin so the admin panel is usable
  // immediately in the demo (BRD §9.1). Idempotent.
  const superAdminEmail = DEMO[0].owner.email;
  await prisma.user.update({ where: { email: superAdminEmail }, data: { isSuperAdmin: true } });
  console.log(`✔ Super Admin ready → login as ${superAdminEmail} / LeadOS@123 (see /admin)`);
}

main()
  .catch((e) => {
    console.error('✖', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());