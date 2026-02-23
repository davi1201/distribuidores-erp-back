-- DropForeignKey
ALTER TABLE "customer_addresses" DROP CONSTRAINT "customer_addresses_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "customer_addresses" DROP CONSTRAINT "customer_addresses_cityCode_fkey";

-- DropForeignKey
ALTER TABLE "customer_addresses" DROP CONSTRAINT "customer_addresses_stateCode_fkey";

-- AlterTable
ALTER TABLE "customer_addresses" ALTER COLUMN "zipCode" DROP NOT NULL,
ALTER COLUMN "street" DROP NOT NULL,
ALTER COLUMN "number" DROP NOT NULL,
ALTER COLUMN "neighborhood" DROP NOT NULL,
ALTER COLUMN "categoryId" DROP NOT NULL,
ALTER COLUMN "cityCode" DROP NOT NULL,
ALTER COLUMN "stateCode" DROP NOT NULL;

-- AlterTable
ALTER TABLE "customer_contacts" ALTER COLUMN "name" DROP NOT NULL,
ALTER COLUMN "phone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "customers" ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "document" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "address_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_cityCode_fkey" FOREIGN KEY ("cityCode") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_stateCode_fkey" FOREIGN KEY ("stateCode") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;
