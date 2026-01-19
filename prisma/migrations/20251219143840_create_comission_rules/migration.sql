-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('PERCENTAGE', 'FIXED', 'HYBRID');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'CANCELED');

-- CreateEnum
CREATE TYPE "CommissionScope" AS ENUM ('GLOBAL', 'SELLER', 'PRODUCT');

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "CommissionScope" NOT NULL DEFAULT 'GLOBAL',
    "type" "CommissionType" NOT NULL,
    "percentage" DECIMAL(5,2),
    "fixedValue" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "specificUserId" TEXT,
    "specificProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "calculationBase" DECIMAL(10,2) NOT NULL,
    "appliedPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "commissionAmount" DECIMAL(10,2) NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "referenceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "payoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_payouts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "receiptUrl" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commission_rules_tenantId_idx" ON "commission_rules"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "commission_records_orderId_key" ON "commission_records"("orderId");

-- CreateIndex
CREATE INDEX "commission_records_tenantId_sellerId_status_idx" ON "commission_records"("tenantId", "sellerId", "status");

-- CreateIndex
CREATE INDEX "commission_records_referenceDate_idx" ON "commission_records"("referenceDate");

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_records" ADD CONSTRAINT "commission_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_records" ADD CONSTRAINT "commission_records_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_records" ADD CONSTRAINT "commission_records_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_records" ADD CONSTRAINT "commission_records_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "commission_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
