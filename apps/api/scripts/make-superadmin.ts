export {};
/**
 * Promote a user to Super Admin (BRD §17: User.isSuperAdmin = true).
 * Usage: tsx scripts/make-superadmin.ts user@example.com
 */
import { prisma } from '../src/prisma.js';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: tsx scripts/make-superadmin.ts <email>');
    process.exit(1);
  }
  const user = await prisma.user.update({
    where: { email: email.toLowerCase() },
    data: { isSuperAdmin: true },
  });
  console.log(`✔ ${user.email} is now a Super Admin.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());