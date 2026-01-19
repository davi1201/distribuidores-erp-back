/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,sku]` on the table `products` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "products_sku_key";

-- DropIndex
DROP INDEX "products_tenantId_sku_idx";

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "description" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "products_tenantId_sku_key" ON "products"("tenantId", "sku");
