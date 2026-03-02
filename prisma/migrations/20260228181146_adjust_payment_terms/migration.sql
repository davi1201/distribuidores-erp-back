/*
  Warnings:

  - Changed the type of `rules` on the `payment_terms` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "payment_terms" ADD COLUMN     "installmentsCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "minAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
DROP COLUMN "rules",
ADD COLUMN     "rules" JSONB NOT NULL;

-- CreateTable
CREATE TABLE "_TermToMethod" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_TermToMethod_AB_unique" ON "_TermToMethod"("A", "B");

-- CreateIndex
CREATE INDEX "_TermToMethod_B_index" ON "_TermToMethod"("B");

-- AddForeignKey
ALTER TABLE "_TermToMethod" ADD CONSTRAINT "_TermToMethod_A_fkey" FOREIGN KEY ("A") REFERENCES "payment_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TermToMethod" ADD CONSTRAINT "_TermToMethod_B_fkey" FOREIGN KEY ("B") REFERENCES "tenant_payment_methods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
