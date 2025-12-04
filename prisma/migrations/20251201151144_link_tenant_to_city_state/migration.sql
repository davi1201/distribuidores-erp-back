-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "cityId" INTEGER,
ADD COLUMN     "stateId" INTEGER;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;
