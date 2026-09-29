import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';
export { purgeBurnedChats } from './burn';

// Reuse one client across hot reloads (tsx watch, Next dev) to avoid exhausting connections.
const globalForPrisma = globalThis as unknown as { __fathomPrisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.__fathomPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.__fathomPrisma = prisma;
