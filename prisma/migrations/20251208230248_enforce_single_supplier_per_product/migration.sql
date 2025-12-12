/*
  Warnings:

  - You are about to drop the column `isMain` on the `product_suppliers` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[productId]` on the table `product_suppliers` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "product_suppliers_productId_supplierId_key";

-- AlterTable
ALTER TABLE "product_suppliers" DROP COLUMN "isMain";

-- CreateIndex
CREATE UNIQUE INDEX "product_suppliers_productId_key" ON "product_suppliers"("productId");
