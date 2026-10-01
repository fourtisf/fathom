-- CreateTable
CREATE TABLE "SharedChat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedChat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SharedChat_userId_idx" ON "SharedChat"("userId");

-- CreateIndex
CREATE INDEX "SharedChat_expiresAt_idx" ON "SharedChat"("expiresAt");

-- AddForeignKey
ALTER TABLE "SharedChat" ADD CONSTRAINT "SharedChat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

