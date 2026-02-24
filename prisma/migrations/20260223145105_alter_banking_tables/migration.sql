/*
  Warnings:

  - You are about to drop the column `financialTitleId` on the `bank_transactions` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[financialMovementId]` on the table `bank_transactions` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "bank_transactions_financialTitleId_key";

-- AlterTable
ALTER TABLE "bank_transactions" DROP COLUMN "financialTitleId",
ADD COLUMN     "financialMovementId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_financialMovementId_key" ON "bank_transactions"("financialMovementId");

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_financialMovementId_fkey" FOREIGN KEY ("financialMovementId") REFERENCES "financial_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
