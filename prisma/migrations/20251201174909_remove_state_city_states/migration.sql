/*
  Warnings:

  - You are about to drop the column `cityId` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `stateId` on the `tenants` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "tenants" DROP CONSTRAINT "tenants_cityId_fkey";

-- DropForeignKey
ALTER TABLE "tenants" DROP CONSTRAINT "tenants_stateId_fkey";

-- AlterTable
ALTER TABLE "tenants" DROP COLUMN "cityId",
DROP COLUMN "stateId";
