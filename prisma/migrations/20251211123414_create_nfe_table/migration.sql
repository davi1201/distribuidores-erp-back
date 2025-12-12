-- CreateEnum
CREATE TYPE "NfeInboxStatus" AS ENUM ('PENDING', 'IMPORTED', 'IGNORED', 'ERROR');

-- CreateTable
CREATE TABLE "nfe_inbox" (
    "id" TEXT NOT NULL,
    "accessKey" TEXT,
    "senderEmail" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "xmlContent" TEXT NOT NULL,
    "status" "NfeInboxStatus" NOT NULL DEFAULT 'PENDING',
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nfe_inbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nfe_inbox_tenantId_status_idx" ON "nfe_inbox"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "nfe_inbox" ADD CONSTRAINT "nfe_inbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
