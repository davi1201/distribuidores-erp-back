-- AlterTable
ALTER TABLE "financial_movements" ADD COLUMN     "tenantPaymentMethodId" TEXT;

-- AlterTable
ALTER TABLE "financial_titles" ADD COLUMN     "orderPaymentId" TEXT,
ADD COLUMN     "tenantPaymentMethodId" TEXT;

-- CreateTable
CREATE TABLE "order_payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tenantPaymentMethodId" TEXT NOT NULL,
    "baseAmount" DECIMAL(10,2) NOT NULL,
    "installments" INTEGER NOT NULL DEFAULT 1,
    "discountApplied" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "feeApplied" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "finalAmount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_payments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "financial_titles" ADD CONSTRAINT "financial_titles_orderPaymentId_fkey" FOREIGN KEY ("orderPaymentId") REFERENCES "order_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_titles" ADD CONSTRAINT "financial_titles_tenantPaymentMethodId_fkey" FOREIGN KEY ("tenantPaymentMethodId") REFERENCES "tenant_payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_tenantPaymentMethodId_fkey" FOREIGN KEY ("tenantPaymentMethodId") REFERENCES "tenant_payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_tenantPaymentMethodId_fkey" FOREIGN KEY ("tenantPaymentMethodId") REFERENCES "tenant_payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
