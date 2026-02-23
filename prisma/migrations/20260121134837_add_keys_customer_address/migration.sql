/*
  Warnings:

  - You are about to drop the column `city` on the `customer_addresses` table. All the data in the column will be lost.
  - You are about to drop the column `state` on the `customer_addresses` table. All the data in the column will be lost.
  - Added the required column `cityCode` to the `customer_addresses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stateCode` to the `customer_addresses` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "customer_addresses" DROP COLUMN "city",
DROP COLUMN "state",
ADD COLUMN     "cityCode" INTEGER NOT NULL,
ADD COLUMN     "stateCode" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_cityCode_fkey" FOREIGN KEY ("cityCode") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_stateCode_fkey" FOREIGN KEY ("stateCode") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
