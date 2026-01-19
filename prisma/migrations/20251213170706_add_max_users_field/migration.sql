-- DropIndex
DROP INDEX "subscriptions_tenantId_key";

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "maxUsers" INTEGER NOT NULL DEFAULT 1;
