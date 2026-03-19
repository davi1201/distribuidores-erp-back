/*
  Warnings:

  - You are about to drop the column `cityName` on the `billing_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `billing_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `billing_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `stateUf` on the `billing_profiles` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "billing_profiles" DROP COLUMN "cityName",
DROP COLUMN "email",
DROP COLUMN "phone",
DROP COLUMN "stateUf",
ADD COLUMN     "billingEmail" TEXT,
ADD COLUMN     "commercialEmail" TEXT,
ADD COLUMN     "commercialPhone" TEXT,
ADD COLUMN     "commercialPhoneContact" TEXT,
ADD COLUMN     "companyName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "ownerDocument" TEXT,
ADD COLUMN     "ownerName" TEXT,
ALTER COLUMN "zipCode" SET DEFAULT '',
ALTER COLUMN "street" SET DEFAULT '',
ALTER COLUMN "number" SET DEFAULT '',
ALTER COLUMN "neighborhood" SET DEFAULT '';

-- CreateTable
CREATE TABLE "billing_profile_partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "document" TEXT NOT NULL DEFAULT '',
    "qualification" TEXT NOT NULL DEFAULT '',
    "entryDate" TIMESTAMP(3),
    "ageGroup" TEXT,
    "type" TEXT,
    "billingProfileId" TEXT NOT NULL,

    CONSTRAINT "billing_profile_partners_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "billing_profile_partners" ADD CONSTRAINT "billing_profile_partners_billingProfileId_fkey" FOREIGN KEY ("billingProfileId") REFERENCES "billing_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
