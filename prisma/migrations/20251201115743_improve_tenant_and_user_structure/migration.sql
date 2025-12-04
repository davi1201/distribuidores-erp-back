-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "billingCity" TEXT,
ADD COLUMN     "billingComplement" TEXT,
ADD COLUMN     "billingNeighborhood" TEXT,
ADD COLUMN     "billingNumber" TEXT,
ADD COLUMN     "billingState" TEXT,
ADD COLUMN     "billingStreet" TEXT,
ADD COLUMN     "billingZipCode" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "personType" "PersonType" NOT NULL DEFAULT 'PJ',
ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "phone" TEXT,
ALTER COLUMN "password" DROP NOT NULL;
