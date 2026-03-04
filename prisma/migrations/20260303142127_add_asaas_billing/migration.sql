-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "asaasMonthlyPlanId" TEXT,
ADD COLUMN     "asaasYearlyPlanId" TEXT;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "gateway" TEXT NOT NULL DEFAULT 'STRIPE';
