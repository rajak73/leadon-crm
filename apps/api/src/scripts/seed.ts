/**
 * `pnpm db:seed [-- --demo] [-- --force]`
 * On an empty database: creates the admin user, settings and the default pipeline.
 * `--demo` also adds realistic sample leads, contacts, deals, tasks and notes.
 * Refuses to run in production unless `--force` is given.
 */
import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { env, isProduction } from '../config/env.js';
import { encryptSecret } from '../lib/crypto.js';
import { hashPassword } from '../lib/password.js';
import { prisma, type Tx } from '../lib/prisma.js';
import { scoreWithRules } from '../modules/ai/index.js';
import {
  AUTO_REPLY_SETTINGS_ID,
  SANDBOX_ACCOUNT,
  simulatedIgsid,
} from '../modules/instagram/index.js';
import { createDefaultPipeline } from '../modules/pipelines/index.js';
import { SETTINGS_ID } from '../modules/settings/index.js';

const args = new Set(process.argv.slice(2));
const demo = args.has('--demo');
const force = args.has('--force');

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (d: number, hour = 11) =>
  new Date(now - d * DAY - (now % DAY) + hour * 60 * 60 * 1000);

// Small deterministic PRNG so demo data is the same on every run.
let seed = 42;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;

async function main(): Promise<void> {
  if (isProduction && !force) {
    console.error(
      'Refusing to seed a production database. Re-run with --force if you really mean it.',
    );
    process.exit(1);
  }

  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    console.log(`Database already has ${existingUsers} user(s); nothing to seed.`);
    return;
  }

  const email = (env.SEED_ADMIN_EMAIL ?? 'admin@leados.local').toLowerCase();
  const generated = !env.SEED_ADMIN_PASSWORD;
  const password = env.SEED_ADMIN_PASSWORD ?? crypto.randomBytes(9).toString('base64url');

  const passwordHash = await hashPassword(password);
  const memberHashes = demo ? await Promise.all([1, 2, 3].map(() => hashPassword(password))) : [];

  await prisma.$transaction(
    async (tx) => {
      await tx.appSettings.upsert({
        where: { id: SETTINGS_ID },
        create: { id: SETTINGS_ID, companyName: demo ? 'Sharma Interiors Pvt Ltd' : 'My Company' },
        update: {},
      });
      if ((await tx.pipeline.count()) === 0) await createDefaultPipeline(tx);
      const admin = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: 'Admin',
          lastName: demo ? 'Sharma' : '',
          role: 'ADMIN',
        },
      });
      if (demo) {
        await seedDemo(tx, admin.id, memberHashes);
        await seedInstagram(tx, admin.id);
      }
    },
    { timeout: 60_000 },
  );

  console.log('\nLeadOS is ready.');
  console.log(`  Admin email:    ${email}`);
  if (generated)
    console.log(`  Admin password: ${password}   (generated — change it after signing in)`);
  else console.log('  Admin password: (from SEED_ADMIN_PASSWORD)');
  if (demo) {
    console.log(
      '  Demo team members (same password): priya@leados.local, rahul@leados.local, ananya@leados.local',
    );
    console.log(
      env.INSTAGRAM_TEST_MODE
        ? '  Instagram: test account connected with demo conversations. AI replies are off until you add an AI key and enable them in Settings → Auto-reply.'
        : '  Instagram: demo conversations added. Connect your account in Settings → Instagram.',
    );
  }
}

const FIRST = [
  'Aarav',
  'Vivaan',
  'Aditya',
  'Ishaan',
  'Kavya',
  'Diya',
  'Meera',
  'Rohan',
  'Sneha',
  'Arjun',
  'Pooja',
  'Karthik',
  'Nisha',
  'Siddharth',
  'Lakshmi',
  'Farhan',
  'Gurpreet',
  'Harini',
  'Manoj',
  'Neha',
];
const LAST = [
  'Patel',
  'Iyer',
  'Reddy',
  'Khan',
  'Singh',
  'Nair',
  'Mehta',
  'Gupta',
  'Das',
  'Joshi',
  'Menon',
  'Bose',
  'Kulkarni',
  'Chopra',
  'Rao',
];
const COMPANIES = [
  'Tata Consultancy Services',
  'Infosys',
  'Zomato',
  'Swiggy',
  'Razorpay',
  'Freshworks',
  'Nykaa',
  'Byju’s',
  'Ola',
  'PhonePe',
  'Urban Company',
  'Zerodha',
  'Lenskart',
  'Meesho',
  'Cred',
  null,
  null,
];
const CITIES = [
  'Mumbai',
  'Bengaluru',
  'Pune',
  'Hyderabad',
  'Chennai',
  'Delhi',
  'Ahmedabad',
  'Kochi',
];
const SOURCES = [
  'WEBSITE',
  'REFERRAL',
  'INSTAGRAM',
  'WHATSAPP',
  'FACEBOOK',
  'EVENT',
  'PHONE',
  'EMAIL',
  'MANUAL',
] as const;
const STATUSES = [
  'NEW',
  'NEW',
  'CONTACTED',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL',
  'NEGOTIATION',
  'LOST',
] as const;
const TAGS = [
  'hot',
  'vip',
  '2BHK',
  '3BHK',
  'office',
  'modular kitchen',
  'follow-up',
  'cold',
  'renovation',
];
const NOTES = [
  'Called — interested in a full home interior for their new 3BHK. Budget around ₹12 lakh.',
  'Visited the showroom with family. Liked the modular kitchen samples.',
  'Asked for a revised quote without the false ceiling.',
  'Prefers WhatsApp over calls. Available after 6 pm.',
  'Site measurement done. Possession expected next month.',
  'Comparing us with two other vendors; price is the main concern.',
];

async function seedDemo(tx: Tx, adminId: string, hashes: string[]): Promise<void> {
  const members = await Promise.all(
    [
      ['Priya', 'Nair', 'priya@leados.local'],
      ['Rahul', 'Verma', 'rahul@leados.local'],
      ['Ananya', 'Iyer', 'ananya@leados.local'],
    ].map(([firstName, lastName, email], i) =>
      tx.user.create({
        data: {
          firstName: firstName!,
          lastName: lastName!,
          email: email!,
          passwordHash: hashes[i]!,
          role: 'MEMBER',
          createdAt: daysAgo(120 - i),
        },
      }),
    ),
  );
  const team = [adminId, ...members.map((m) => m.id)];
  const pipeline = await tx.pipeline.findFirstOrThrow({
    where: { isDefault: true },
    include: { stages: { orderBy: { order: 'asc' } } },
  });
  const stages = pipeline.stages;
  const openStages = stages.filter((s) => !s.isWon && !s.isLost);
  const wonStage = stages.find((s) => s.isWon)!;
  const lostStage = stages.find((s) => s.isLost)!;

  for (let i = 0; i < 40; i++) {
    const firstName = FIRST[i % FIRST.length]!;
    const lastName = pick(LAST);
    const company = pick(COMPANIES);
    const created = daysAgo(Math.floor(rand() * 85), 9 + Math.floor(rand() * 9));
    const converted = i % 8 === 0;
    const status = converted ? 'WON' : pick(STATUSES);
    const assignee = rand() < 0.85 ? pick(team) : null;
    const tags = [...new Set([pick(TAGS), ...(rand() < 0.4 ? [pick(TAGS)] : [])])];
    const hasEmail = rand() < 0.85;
    const leadEmail = hasEmail ? `${firstName}.${lastName}${i}@example.in`.toLowerCase() : null;
    const phone = rand() < 0.9 ? `+91 9${Math.floor(100000000 + rand() * 899999999)}` : null;
    const source = pick(SOURCES);
    const lastActivityAt = new Date(Math.min(now, created.getTime() + rand() * 20 * DAY));

    let contactId: string | null = null;
    if (converted) {
      const contact = await tx.contact.create({
        data: {
          firstName,
          lastName,
          email: leadEmail,
          phone,
          company,
          jobTitle: pick(['Founder', 'Operations Manager', 'Homeowner', 'Admin Head', 'Director']),
          tags,
          assignedToId: assignee,
          createdById: adminId,
          createdAt: created,
          lastActivityAt,
        },
      });
      contactId = contact.id;
    }

    const lead = await tx.lead.create({
      data: {
        firstName,
        lastName,
        email: leadEmail,
        phone,
        company,
        source,
        status,
        tags,
        lostReason:
          status === 'LOST'
            ? pick(['Budget too low', 'Chose another vendor', 'Project postponed'])
            : null,
        assignedToId: assignee,
        createdById: adminId,
        convertedToContactId: contactId,
        createdAt: created,
        lastActivityAt,
      },
    });
    await activity(tx, {
      type: 'LEAD_CREATED',
      description: `Lead created from ${source.charAt(0)}${source.slice(1).toLowerCase()} (${pick(CITIES)})`,
      performedById: adminId,
      relatedLeadId: lead.id,
      createdAt: created,
    });

    if (rand() < 0.6) {
      const content = pick(NOTES);
      const at = new Date(created.getTime() + 2 * DAY);
      await tx.note.create({
        data: { content, createdById: assignee ?? adminId, relatedLeadId: lead.id, createdAt: at },
      });
      await activity(tx, {
        type: 'NOTE_ADDED',
        description: `Note added: “${content.slice(0, 80)}”`,
        performedById: assignee ?? adminId,
        relatedLeadId: lead.id,
        createdAt: at,
      });
    }

    // Deals for qualified-and-later leads.
    if (
      ['PROPOSAL', 'NEGOTIATION', 'WON', 'QUALIFIED'].includes(status) ||
      (status === 'LOST' && rand() < 0.5)
    ) {
      const stage = status === 'WON' ? wonStage : status === 'LOST' ? lostStage : pick(openStages);
      const closed = stage.isWon || stage.isLost;
      const deal = await tx.deal.create({
        data: {
          title: `${company ?? `${firstName} ${lastName}`} — ${pick(['Full home interiors', 'Modular kitchen', 'Office fit-out', 'Wardrobes', 'Living room makeover'])}`,
          value: Math.round((1.5 + rand() * 20) * 100000),
          currency: 'INR',
          status: stage.isWon ? 'WON' : stage.isLost ? 'LOST' : 'OPEN',
          pipelineId: pipeline.id,
          stageId: stage.id,
          leadId: lead.id,
          contactId,
          assignedToId: assignee,
          createdById: adminId,
          expectedCloseDate: new Date(now + (5 + rand() * 50) * DAY),
          closedAt: closed
            ? new Date(Math.min(now, created.getTime() + (5 + rand() * 25) * DAY))
            : null,
          lostReason: stage.isLost ? 'Chose another vendor' : null,
          createdAt: new Date(created.getTime() + DAY),
        },
      });
      await activity(tx, {
        type: 'DEAL_CREATED',
        description: `Deal "${deal.title}" created in ${stage.name}`,
        performedById: assignee ?? adminId,
        relatedLeadId: lead.id,
        relatedDealId: deal.id,
        relatedContactId: contactId,
        createdAt: deal.createdAt,
      });
    }

    if (status !== 'WON' && status !== 'LOST' && rand() < 0.7) {
      const due = new Date(now + (rand() * 10 - 3) * DAY);
      await tx.task.create({
        data: {
          title: pick([
            'Call to discuss quote',
            'Send design catalogue',
            'Schedule site visit',
            'Share revised estimate',
            'Follow up on WhatsApp',
          ]),
          type: pick(['CALL', 'EMAIL', 'MEETING', 'FOLLOW_UP', 'DEMO'] as const),
          priority: pick(['LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'URGENT'] as const),
          dueDate: due,
          reminderSentAt: due.getTime() < now ? due : null, // don't flood new installs with reminders
          assignedToId: assignee ?? adminId,
          createdById: adminId,
          relatedLeadId: lead.id,
          createdAt: created,
        },
      });
    }

    // Initial rules-based score so lists and filters have data.
    const score = scoreWithRules({
      lead: {
        firstName,
        lastName,
        email: leadEmail,
        phone,
        company,
        source,
        status,
        tags,
        createdAt: created,
        lastActivityAt,
      },
      openDeals: [],
      activities: [],
      now: new Date(),
    });
    await tx.aiScore.create({
      data: {
        leadId: lead.id,
        score: score.score,
        factors: score.factors as unknown as Prisma.InputJsonValue,
        recommendation: score.recommendation,
        modelVersion: score.modelVersion,
        triggeredBy: 'auto',
      },
    });
    await tx.lead.update({
      where: { id: lead.id },
      data: { aiScore: score.score, aiScoreUpdatedAt: new Date() },
    });
  }
}

// ─── Instagram demo ──────────────────────────────────────────────────────────

const DEMO_BUSINESS_INFO = `Sharma Interiors — home interiors in Bengaluru, Pune and Mumbai since 2012.

SERVICES
- Modular kitchens (straight, L-shaped, U-shaped, island, parallel)
- Wardrobes (sliding, hinged, walk-in) and TV units
- Full-home interiors for 1, 2 and 3BHK flats and villas
- False ceilings, lighting and wall panelling (only as part of a kitchen or full-home project)

PRICES (starting points; the exact quote depends on size, materials and finish)
- Modular kitchen: from ₹1.5 lakh (typical 2BHK kitchen ₹1.5–3 lakh)
- Wardrobes: from ₹1,200 per sq ft
- Full-home interiors: 2BHK from ₹5 lakh, 3BHK from ₹8 lakh
- Finishes: laminate (standard), acrylic and PU (premium)
We do not share exact quotes on chat — a designer gives one after the site visit.

HOW IT WORKS
1. Free site visit and measurement (we come to your home, no charge)
2. 3D design and a detailed quote within 5 working days
3. Factory-made modules; installation in 30–45 days after the design is confirmed
Warranty: 10 years on kitchen and wardrobe modules, 1 year on installation.
EMI available through partner banks.

HOURS & CONTACT
Showroom: HSR Layout, Bengaluru. Monday–Saturday, 10 am – 7 pm. Closed on Sundays.
Phone / WhatsApp: +91 98450 12345. Email: hello@sharmainteriors.in

TONE
Warm and helpful. Reply in the customer's language (lots of customers write in Hinglish).
Always offer the free site visit when someone is interested.`;

const minsAgo = (m: number) => new Date(now - m * 60 * 1000);

interface DemoMessage {
  from: 'customer' | 'ai' | 'user' | 'app';
  text: string;
  at: Date;
  status?: 'DRAFT';
}

async function seedInstagram(tx: Tx, adminId: string): Promise<void> {
  await tx.autoReplySettings.upsert({
    where: { id: AUTO_REPLY_SETTINGS_ID },
    create: {
      id: AUTO_REPLY_SETTINGS_ID,
      dmEnabled: false, // turned on by the admin after adding an AI key
      commentsEnabled: false,
      mode: 'DRAFT',
      commentReplyMode: 'BOTH',
      businessInfo: DEMO_BUSINESS_INFO,
      tone: 'Warm, friendly and professional. Short replies, like a helpful person on Instagram.',
      handoffMessage:
        'Thanks for your message! Someone from our design team will reply to you shortly. 🙏',
      replyDelaySeconds: 20,
      maxRepliesPerDay: 20,
      createLeads: true,
    },
    update: {},
  });

  if (env.INSTAGRAM_TEST_MODE) {
    await tx.igAccount.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        igUserId: SANDBOX_ACCOUNT.userId,
        username: SANDBOX_ACCOUNT.username,
        name: SANDBOX_ACCOUNT.name,
        accessTokenEnc: encryptSecret('sandbox-demo-token'),
        tokenExpiresAt: new Date(now + 55 * DAY),
        connectedAt: new Date(now - 5 * DAY),
        lastWebhookAt: minsAgo(4),
      },
      update: {},
    });
  }

  const leads = new Map<string, string>();
  const leadFor = async (username: string, name: string | null, createdAt: Date) => {
    const existing = leads.get(username);
    if (existing) return existing;
    const lead = await tx.lead.create({
      data: {
        firstName: name ?? `@${username}`,
        source: 'INSTAGRAM',
        status: 'NEW',
        tags: ['instagram'],
        createdById: adminId,
        createdAt,
        lastActivityAt: createdAt,
      },
    });
    await activity(tx, {
      type: 'LEAD_CREATED',
      description: 'Lead created from Instagram',
      relatedLeadId: lead.id,
      createdAt,
    });
    leads.set(username, lead.id);
    return lead.id;
  };

  const conversations: Array<{
    username: string;
    name: string | null;
    messages: DemoMessage[];
    aiEnabled?: boolean;
    aiPausedReason?: string;
    needsAttention?: boolean;
    unread?: number;
  }> = [
    {
      username: 'asha.homes',
      name: 'Asha Kulkarni',
      unread: 1,
      messages: [
        {
          from: 'customer',
          text: 'Hi! 2BHK ke liye modular kitchen ka price kya hai?',
          at: minsAgo(95),
        },
        {
          from: 'ai',
          text: 'Namaste Asha! 2BHK ka modular kitchen ₹1.5–3 lakh ke beech aata hai, size aur finish pe depend karta hai. Exact quote ke liye hum free site visit karte hain — aapka area kaunsa hai?',
          at: minsAgo(94),
        },
        {
          from: 'customer',
          text: 'HSR Layout mein hoon. Saturday ko visit ho sakta hai?',
          at: minsAgo(12),
        },
      ],
    },
    {
      username: 'rohit_builds',
      name: 'Rohit Mehta',
      unread: 1,
      needsAttention: true,
      messages: [
        {
          from: 'customer',
          text: 'Hello, do you do full home interiors for a 3BHK in Baner? Budget around 12 lakh.',
          at: minsAgo(38),
        },
        {
          from: 'ai',
          status: 'DRAFT',
          text: 'Hi Rohit! Yes, we do full-home interiors in Pune, and 3BHK projects start from ₹8 lakh, so your budget works well. Would you like a free site visit so our designer can measure and share an exact quote?',
          at: minsAgo(37),
        },
      ],
    },
    {
      username: 'meera.creates',
      name: 'Meera Iyer',
      aiEnabled: false,
      aiPausedReason: 'Complaint about a delayed wardrobe installation',
      needsAttention: true,
      unread: 1,
      messages: [
        {
          from: 'customer',
          text: 'My wardrobe installation was promised last week and nobody has come yet. Very disappointed.',
          at: minsAgo(180),
        },
        {
          from: 'ai',
          text: 'Thanks for your message! Someone from our design team will reply to you shortly. 🙏',
          at: minsAgo(179),
        },
      ],
    },
    {
      username: 'karthik.r',
      name: 'Karthik Reddy',
      unread: 1,
      messages: [
        { from: 'customer', text: 'Bhai office interiors bhi karte ho?', at: minsAgo(300) },
        {
          from: 'user',
          text: 'Haan ji, small offices bhi karte hain. Aapka area kitna hai aur kahan hai?',
          at: minsAgo(280),
        },
        {
          from: 'customer',
          text: 'Around 1200 sq ft, Koramangala. Call kar sakte ho?',
          at: minsAgo(270),
        },
      ],
    },
    {
      username: 'priya_nair_',
      name: 'Priya Nair',
      messages: [
        { from: 'customer', text: 'What are your showroom timings?', at: new Date(now - 3 * DAY) },
        {
          from: 'ai',
          text: 'Hi Priya! Our showroom in HSR Layout is open Monday to Saturday, 10 am to 7 pm (closed on Sundays). Would you like us to book a free site visit too?',
          at: new Date(now - 3 * DAY + 60_000),
        },
        {
          from: 'customer',
          text: 'Thanks, will visit this weekend 😊',
          at: new Date(now - 3 * DAY + 10 * 60_000),
        },
      ],
    },
    {
      username: 'sanjay.decor',
      name: null,
      aiEnabled: false,
      aiPausedReason: 'You replied from the Instagram app',
      messages: [
        { from: 'customer', text: 'Can I get your wardrobe catalogue?', at: minsAgo(8 * 60) },
        { from: 'app', text: 'Sent it on WhatsApp 👍', at: minsAgo(8 * 60 - 5) },
      ],
    },
  ];

  for (const c of conversations) {
    const first = c.messages[0]!.at;
    const leadId = await leadFor(c.username, c.name, first);
    const inbound = c.messages.filter((m) => m.from === 'customer');
    const lastInbound = inbound.at(-1)?.at ?? null;
    const visible = c.messages.filter((m) => m.status !== 'DRAFT');
    const last = visible.at(-1)!;
    const conv = await tx.igConversation.create({
      data: {
        igsid: simulatedIgsid(c.username),
        username: c.username,
        name: c.name,
        leadId,
        aiEnabled: c.aiEnabled ?? true,
        aiPausedReason: c.aiPausedReason ?? null,
        needsAttention: c.needsAttention ?? false,
        unreadCount: c.unread ?? 0,
        lastMessageAt: last.at,
        lastMessagePreview: last.text.slice(0, 200),
        lastInboundAt: lastInbound,
        createdAt: first,
      },
    });
    for (const [i, m] of c.messages.entries()) {
      const outbound = m.from !== 'customer';
      await tx.igMessage.create({
        data: {
          conversationId: conv.id,
          direction: outbound ? 'OUTBOUND' : 'INBOUND',
          author: { customer: 'CUSTOMER', ai: 'AI', user: 'USER', app: 'INSTAGRAM_APP' }[m.from],
          sentById: m.from === 'user' ? adminId : null,
          status: m.status ?? (outbound ? 'SENT' : 'RECEIVED'),
          mid: m.status === 'DRAFT' ? null : `demo_${c.username}_${i}`,
          text: m.text,
          createdAt: m.at,
          sentAt: outbound && m.status !== 'DRAFT' ? m.at : null,
        },
      });
      if (m.status === 'DRAFT') continue;
      const handle = `@${c.username}`;
      const quoted = `“${m.text.length > 80 ? `${m.text.slice(0, 79)}…` : m.text}”`;
      await activity(tx, {
        type: outbound ? 'INSTAGRAM_MESSAGE_SENT' : 'INSTAGRAM_MESSAGE_RECEIVED',
        description: outbound
          ? m.from === 'ai'
            ? `AI replied on Instagram to ${handle}: ${quoted}`
            : m.from === 'app'
              ? `Replied from the Instagram app to ${handle}: ${quoted}`
              : `Instagram reply to ${handle}: ${quoted}`
          : `Instagram message from ${handle}: ${quoted}`,
        performedById: m.from === 'user' ? adminId : null,
        relatedLeadId: leadId,
        metadata: { conversationId: conv.id },
        createdAt: m.at,
      });
    }
  }

  const posts = {
    kitchen: {
      mediaId: 'demo_post_kitchen',
      mediaPermalink: 'https://www.instagram.com/p/demo_post_kitchen/',
      mediaCaption:
        'L-shaped modular kitchen with acrylic shutters and a quartz top — delivered in Whitefield ✨ #modularkitchen #bangalorehomes',
    },
    wardrobe: {
      mediaId: 'demo_reel_wardrobe',
      mediaPermalink: 'https://www.instagram.com/reel/demo_reel_wardrobe/',
      mediaCaption:
        'Sliding wardrobe with loft storage for a 3BHK in Baner, Pune 🏡 #wardrobedesign',
    },
  };
  const comments: Array<{
    post: keyof typeof posts;
    username: string;
    text: string;
    minutesAgo: number;
    replyStatus: 'NONE' | 'DRAFT' | 'REPLIED' | 'SKIPPED' | 'FAILED';
    publicReply?: string;
    privateReply?: string;
    skipReason?: string;
    replyError?: string;
    lead?: boolean;
  }> = [
    {
      post: 'kitchen',
      username: 'asha.homes',
      text: 'Price for this kitchen?',
      minutesAgo: 100,
      replyStatus: 'REPLIED',
      publicReply: 'Thank you! Sent you a DM with the details 😊',
      privateReply:
        'Hi Asha! Kitchens like this start from ₹1.5 lakh depending on size and finish. We also do a free site visit for an exact quote.',
      lead: true,
    },
    {
      post: 'kitchen',
      username: 'neha_s',
      text: 'Gorgeous 😍😍',
      minutesAgo: 240,
      replyStatus: 'REPLIED',
      publicReply: 'Thank you so much, Neha! ❤️',
    },
    {
      post: 'kitchen',
      username: 'vikram.j',
      text: 'Do you work in Mumbai too? Need something similar for Andheri.',
      minutesAgo: 45,
      replyStatus: 'DRAFT',
      publicReply: 'Yes, we do! Sent you a DM 😊',
      privateReply:
        'Hi Vikram! Yes, we work in Mumbai. A kitchen like this starts from ₹1.5 lakh. Shall we book a free site visit in Andheri?',
      lead: true,
    },
    {
      post: 'kitchen',
      username: 'followers4u_',
      text: 'Get 10k real followers in 1 day!! DM us',
      minutesAgo: 60,
      replyStatus: 'SKIPPED',
      skipReason: 'Spam: promotes another account',
    },
    {
      post: 'wardrobe',
      username: 'meera.creates',
      text: 'Still waiting for my own wardrobe installation…',
      minutesAgo: 170,
      replyStatus: 'SKIPPED',
      skipReason: 'Needs a person: complaint about a delayed installation',
      lead: true,
    },
    {
      post: 'wardrobe',
      username: 'anil.k',
      text: 'Kitna time lagta hai banane mein?',
      minutesAgo: 20,
      replyStatus: 'NONE',
      lead: true,
    },
    {
      post: 'wardrobe',
      username: 'divya_p',
      text: 'What finish is this? Laminate or acrylic?',
      minutesAgo: 33,
      replyStatus: 'NONE',
    },
    {
      post: 'wardrobe',
      username: 'rahul.designs',
      text: 'Loved the loft idea 🙌',
      minutesAgo: 400,
      replyStatus: 'FAILED',
      publicReply: 'Thank you, Rahul! 🙌',
      replyError: 'Instagram is limiting requests right now. Try again in a few minutes.',
    },
  ];
  for (const [i, c] of comments.entries()) {
    const at = minsAgo(c.minutesAgo);
    const leadId = c.lead ? await leadFor(c.username, null, at) : null;
    const comment = await tx.igComment.create({
      data: {
        commentId: `demo_comment_${i + 1}`,
        ...posts[c.post],
        fromIgId: simulatedIgsid(c.username),
        fromUsername: c.username,
        text: c.text,
        leadId,
        replyStatus: c.replyStatus,
        publicReply: c.publicReply ?? null,
        privateReply: c.privateReply ?? null,
        replyCommentId: c.replyStatus === 'REPLIED' ? `demo_reply_${i + 1}` : null,
        privateReplySent: c.replyStatus === 'REPLIED' && !!c.privateReply,
        skipReason: c.skipReason ?? null,
        replyError: c.replyError ?? null,
        commentedAt: at,
        createdAt: at,
      },
    });
    if (leadId) {
      await activity(tx, {
        type: 'INSTAGRAM_COMMENT_RECEIVED',
        description: `Instagram comment from @${c.username}: “${c.text}”`,
        relatedLeadId: leadId,
        metadata: { commentId: comment.id },
        createdAt: at,
      });
    }
  }
}

function activity(tx: Tx, data: Prisma.ActivityUncheckedCreateInput) {
  return tx.activity.create({ data });
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
