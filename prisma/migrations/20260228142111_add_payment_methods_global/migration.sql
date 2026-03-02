/*
  Warnings:

  - You are about to drop the column `paymentMethodId` on the `financial_movements` table. All the data in the column will be lost.
  - You are about to drop the column `paymentMethodId` on the `financial_titles` table. All the data in the column will be lost.
  - You are about to drop the `payment_method_installments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `payment_methods` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "financial_movements" DROP CONSTRAINT "financial_movements_paymentMethodId_fkey";

-- DropForeignKey
ALTER TABLE "financial_titles" DROP CONSTRAINT "financial_titles_paymentMethodId_fkey";

-- DropForeignKey
ALTER TABLE "payment_method_installments" DROP CONSTRAINT "payment_method_installments_paymentMethodId_fkey";

-- DropForeignKey
ALTER TABLE "payment_methods" DROP CONSTRAINT "payment_methods_tenantId_fkey";

-- AlterTable
ALTER TABLE "financial_movements" DROP COLUMN "paymentMethodId";

-- AlterTable
ALTER TABLE "financial_titles" DROP COLUMN "paymentMethodId";

-- DropTable
DROP TABLE "payment_method_installments";

-- DropTable
DROP TABLE "payment_methods";

-- CreateTable
CREATE TABLE "system_payment_methods" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isAcquirer" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_payment_methods" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemPaymentMethodId" TEXT NOT NULL,
    "customName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "discountPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "maxInstallments" INTEGER NOT NULL DEFAULT 1,
    "minInstallmentValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "passFeeToCustomer" BOOLEAN NOT NULL DEFAULT false,
    "isAnticipated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_payment_installments" (
    "id" TEXT NOT NULL,
    "tenantPaymentMethodId" TEXT NOT NULL,
    "installment" INTEGER NOT NULL,
    "feePercentage" DECIMAL(5,2) NOT NULL,
    "receiveInDays" INTEGER NOT NULL DEFAULT 30,

    CONSTRAINT "tenant_payment_installments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_payment_methods_code_key" ON "system_payment_methods"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_payment_methods_tenantId_systemPaymentMethodId_key" ON "tenant_payment_methods"("tenantId", "systemPaymentMethodId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_payment_installments_tenantPaymentMethodId_installme_key" ON "tenant_payment_installments"("tenantPaymentMethodId", "installment");

-- AddForeignKey
ALTER TABLE "tenant_payment_methods" ADD CONSTRAINT "tenant_payment_methods_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_payment_methods" ADD CONSTRAINT "tenant_payment_methods_systemPaymentMethodId_fkey" FOREIGN KEY ("systemPaymentMethodId") REFERENCES "system_payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_payment_installments" ADD CONSTRAINT "tenant_payment_installments_tenantPaymentMethodId_fkey" FOREIGN KEY ("tenantPaymentMethodId") REFERENCES "tenant_payment_methods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
