/*
  Warnings:

  - A unique constraint covering the columns `[stripeProductId]` on the table `plans` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "stripeProductId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "plans_stripeProductId_key" ON "plans"("stripeProductId");
