/*
  Warnings:

  - You are about to drop the column `cest` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `cfop` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `ncm` on the `products` table. All the data in the column will be lost.
  - Added the required column `ncmCode` to the `products` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "products" DROP COLUMN "cest",
DROP COLUMN "cfop",
DROP COLUMN "ncm",
ADD COLUMN     "cestCode" TEXT,
ADD COLUMN     "cfopCode" TEXT,
ADD COLUMN     "ncmCode" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_ncmCode_fkey" FOREIGN KEY ("ncmCode") REFERENCES "tax_ncms"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_cestCode_fkey" FOREIGN KEY ("cestCode") REFERENCES "tax_cests"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_cfopCode_fkey" FOREIGN KEY ("cfopCode") REFERENCES "tax_cfops"("code") ON DELETE SET NULL ON UPDATE CASCADE;
