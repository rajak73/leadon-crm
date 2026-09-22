import type { UserRole } from '@leados/shared';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: UserRole; email: string; sessionFamily: string | null };
    }
  }
}

export {};
