/*
  Warnings:

  - You are about to drop the column `paymentMethod` on the `financial_titles` table. All the data in the column will be lost.
  - Changed the type of `type` on the `financial_categories` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "TitleOrigin" AS ENUM ('MANUAL', 'ORDER', 'PURCHASE', 'IMPORT');

-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('INCOME', 'EXPENSE');

-- DropIndex
DROP INDEX "financial_titles_customerId_idx";

-- AlterTable
ALTER TABLE "financial_categories" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
DROP COLUMN "type",
ADD COLUMN     "type" "CategoryType" NOT NULL;

-- AlterTable
ALTER TABLE "financial_movements" ADD COLUMN     "paymentMethodId" TEXT,
ADD COLUMN     "paymentTermId" TEXT;

-- AlterTable
ALTER TABLE "financial_titles" DROP COLUMN "paymentMethod",
ADD COLUMN     "installmentNumber" INTEGER DEFAULT 1,
ADD COLUMN     "origin" "TitleOrigin" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "paymentMethodId" TEXT,
ADD COLUMN     "paymentTermId" TEXT,
ADD COLUMN     "totalInstallments" INTEGER DEFAULT 1;

-- AlterTable
ALTER TABLE "payment_methods" ADD COLUMN     "code" TEXT;

-- CreateIndex
CREATE INDEX "financial_titles_orderId_idx" ON "financial_titles"("orderId");

-- AddForeignKey
ALTER TABLE "financial_titles" ADD CONSTRAINT "financial_titles_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_titles" ADD CONSTRAINT "financial_titles_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
