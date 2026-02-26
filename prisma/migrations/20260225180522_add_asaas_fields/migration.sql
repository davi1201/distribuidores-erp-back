-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "asaasApiKey" TEXT,
ADD COLUMN     "asaasWalletId" TEXT,
ADD COLUMN     "baseBoletoLimit" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "extraBoletosCurrentMonth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastLimitResetDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
