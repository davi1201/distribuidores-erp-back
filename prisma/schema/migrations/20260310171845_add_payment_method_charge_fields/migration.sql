-- AlterTable
ALTER TABLE "payment_terms" ADD COLUMN     "discountDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discountPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "finePercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "instructions" TEXT,
ADD COLUMN     "interestPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tenant_payment_methods" ADD COLUMN     "dueDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "finePercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "interestRatePerDay" DECIMAL(6,4) NOT NULL DEFAULT 0;
