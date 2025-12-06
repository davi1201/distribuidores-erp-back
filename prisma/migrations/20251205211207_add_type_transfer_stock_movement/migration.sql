/*
  Warnings:

  - A unique constraint covering the columns `[productId,warehouseId]` on the table `stock_items` will be added. If there are existing duplicate values, this will fail.
  - Made the column `warehouseId` on table `stock_items` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'TRANSFER';

-- DropForeignKey
ALTER TABLE "stock_items" DROP CONSTRAINT "stock_items_warehouseId_fkey";

-- AlterTable
ALTER TABLE "stock_items" ALTER COLUMN "warehouseId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "stock_items_productId_warehouseId_key" ON "stock_items"("productId", "warehouseId");

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
