/*
  Warnings:

  - You are about to drop the column `billingCity` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `billingComplement` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `billingNeighborhood` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `billingNumber` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `billingState` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `billingStreet` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `billingZipCode` on the `tenants` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "tenants" DROP COLUMN "billingCity",
DROP COLUMN "billingComplement",
DROP COLUMN "billingNeighborhood",
DROP COLUMN "billingNumber",
DROP COLUMN "billingState",
DROP COLUMN "billingStreet",
DROP COLUMN "billingZipCode";

-- CreateTable
CREATE TABLE "billing_profiles" (
    "id" TEXT NOT NULL,
    "personType" "PersonType" NOT NULL DEFAULT 'PJ',
    "document" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "zipCode" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "complement" TEXT,
    "neighborhood" TEXT NOT NULL,
    "cityName" TEXT NOT NULL,
    "stateUf" TEXT NOT NULL,
    "cityId" INTEGER,
    "stateId" INTEGER,
    "tenantId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_profiles_document_key" ON "billing_profiles"("document");

-- CreateIndex
CREATE UNIQUE INDEX "billing_profiles_tenantId_key" ON "billing_profiles"("tenantId");

-- AddForeignKey
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
