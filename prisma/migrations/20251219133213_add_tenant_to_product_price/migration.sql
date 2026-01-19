/*
  Warnings:

  - Added the required column `tenantId` to the `product_prices` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "product_prices" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
