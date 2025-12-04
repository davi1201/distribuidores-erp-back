/*
  Warnings:

  - A unique constraint covering the columns `[ibgeCode]` on the table `cities` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `ibgeCode` to the `cities` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "cities" ADD COLUMN     "ibgeCode" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "cities_ibgeCode_key" ON "cities"("ibgeCode");
