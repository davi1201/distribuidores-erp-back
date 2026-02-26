-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "maxBoletos" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "availableBoletos" INTEGER NOT NULL DEFAULT 0;
