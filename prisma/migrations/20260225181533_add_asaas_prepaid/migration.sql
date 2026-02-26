/*
  Warnings:

  - You are about to drop the column `lastLimitResetDate` on the `tenants` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "tenants" DROP COLUMN "lastLimitResetDate",
ADD COLUMN     "prepaidBoletosBalance" INTEGER NOT NULL DEFAULT 0;
