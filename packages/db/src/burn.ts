import type { PrismaClient } from '@prisma/client';

/** Hard-deletes chats whose burn time has passed. Returns the number of rows removed. */
export async function purgeBurnedChats(prisma: PrismaClient, now: Date = new Date()): Promise<number> {
  const { count } = await prisma.encryptedChat.deleteMany({ where: { burnAt: { lt: now } } });
  return count;
}
