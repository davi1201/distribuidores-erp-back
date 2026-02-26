/*
  Warnings:

  - You are about to drop the column `availableBoletos` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `baseBoletoLimit` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `extraBoletosCurrentMonth` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `prepaidBoletosBalance` on the `tenants` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "tenants" DROP COLUMN "availableBoletos",
DROP COLUMN "baseBoletoLimit",
DROP COLUMN "extraBoletosCurrentMonth",
DROP COLUMN "prepaidBoletosBalance",
ADD COLUMN     "extraBoletoBalance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "monthlyBoletoBalance" INTEGER NOT NULL DEFAULT 0;
