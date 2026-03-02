-- AlterTable
ALTER TABLE "payment_methods" ADD COLUMN     "discountPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "isAnticipated" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maxInstallments" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "minInstallmentValue" DECIMAL(10,2) NOT NULL DEFAULT 0;
