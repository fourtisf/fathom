-- CreateTable
CREATE TABLE "EncryptedMemory" (
    "userId" TEXT NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EncryptedMemory_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "EncryptedMemory" ADD CONSTRAINT "EncryptedMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
