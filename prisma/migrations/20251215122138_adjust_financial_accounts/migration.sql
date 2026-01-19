-- AlterTable
ALTER TABLE "financial_movements" ADD COLUMN     "bankAccountId" TEXT,
ADD COLUMN     "reconciled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reconciledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "financial_titles" ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "importId" TEXT,
ADD COLUMN     "supplierId" TEXT;

-- AddForeignKey
ALTER TABLE "financial_titles" ADD CONSTRAINT "financial_titles_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
