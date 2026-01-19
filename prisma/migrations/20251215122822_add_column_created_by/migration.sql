-- AlterEnum
ALTER TYPE "MovementType" ADD VALUE 'RECEIPT';

-- AlterTable
ALTER TABLE "financial_titles" ADD COLUMN     "createdById" TEXT;

-- AddForeignKey
ALTER TABLE "financial_titles" ADD CONSTRAINT "financial_titles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
