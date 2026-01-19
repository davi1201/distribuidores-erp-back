/*
  Warnings:

  - You are about to drop the column `maxUsers` on the `plans` table. All the data in the column will be lost.
  - You are about to drop the column `canceledAt` on the `subscriptions` table. All the data in the column will be lost.
  - Made the column `customerId` on table `subscriptions` required. This step will fail if there are existing NULL values in that column.
  - Changed the type of `status` on the `subscriptions` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Made the column `currentPeriodStart` on table `subscriptions` required. This step will fail if there are existing NULL values in that column.
  - Made the column `currentPeriodEnd` on table `subscriptions` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "plans" DROP COLUMN "maxUsers",
ADD COLUMN     "stripeMonthlyPriceId" TEXT,
ADD COLUMN     "stripeYearlyPriceId" TEXT;

-- AlterTable
ALTER TABLE "subscriptions" DROP COLUMN "canceledAt",
ALTER COLUMN "customerId" SET NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL,
ALTER COLUMN "currentPeriodStart" SET NOT NULL,
ALTER COLUMN "currentPeriodEnd" SET NOT NULL;
