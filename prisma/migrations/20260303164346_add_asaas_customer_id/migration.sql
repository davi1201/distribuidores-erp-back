/*
  Warnings:

  - A unique constraint covering the columns `[asaasCustomerId]` on the table `billing_profiles` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "billing_profiles" ADD COLUMN     "asaasCustomerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "billing_profiles_asaasCustomerId_key" ON "billing_profiles"("asaasCustomerId");
