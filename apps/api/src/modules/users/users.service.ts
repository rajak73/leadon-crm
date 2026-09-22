import type { CreateUserInput, UpdateUserInput, User } from '@leados/shared';
import { conflict, fieldError, notFound } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';
import { lockTx, prisma, type Tx } from '../../lib/prisma.js';
import { toUser } from '../../lib/serializers.js';

export async function listUsers(): Promise<User[]> {
  const users = await prisma.user.findMany({
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  return users.map(toUser);
}

async function assertEmailFree(email: string, exceptUserId?: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing && existing.id !== exceptUserId) {
    throw conflict('Someone on your team already uses that email address.', {
      email: ['This email is already in use'],
    });
  }
}

export async function createUser(input: CreateUserInput): Promise<User> {
  await assertEmailFree(input.email);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      passwordHash: await hashPassword(input.password),
    },
  });
  return toUser(user);
}

export async function updateUser(
  actorId: string,
  id: string,
  input: UpdateUserInput,
): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound('team member');

  const demoting = input.role === 'MEMBER' && user.role === 'ADMIN';
  const disabling = input.status === 'DISABLED' && user.status === 'ACTIVE';
  if (id === actorId && (demoting || disabling)) {
    throw conflict(
      demoting ? "You can't remove your own admin access." : "You can't disable your own account.",
    );
  }
  const updated = await prisma.$transaction(async (tx) => {
    if ((demoting || disabling) && user.role === 'ADMIN' && user.status === 'ACTIVE') {
      // Serialised so two admins demoting each other at once can't leave nobody in charge.
      await lockTx(tx, 'active-admins');
      const activeAdmins = await tx.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } });
      if (activeAdmins <= 1) throw conflict('Your team needs at least one active admin.');
    }
    const u = await tx.user.update({ where: { id }, data: input });
    if (disabling)
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    return u;
  });
  return toUser(updated);
}

export async function resetUserPassword(id: string, password: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) throw notFound('team member');
  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

/** Validates that a record can be assigned to `userId` (must exist and be active). */
export async function assertAssignable(
  db: Tx,
  userId: string | null | undefined,
  field = 'assignedToId',
): Promise<void> {
  if (!userId) return;
  const user = await db.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (!user) throw fieldError(field, 'Choose a team member from the list');
  if (user.status !== 'ACTIVE') throw fieldError(field, "This team member's account is disabled");
}
