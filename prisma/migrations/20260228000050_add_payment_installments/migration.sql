-- AlterTable
ALTER TABLE "payment_methods" ADD COLUMN     "isAcquirer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passFeeToCustomer" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "payment_method_installments" (
    "id" TEXT NOT NULL,
    "paymentMethodId" TEXT NOT NULL,
    "installment" INTEGER NOT NULL,
    "feePercentage" DECIMAL(5,2) NOT NULL,
    "receiveInDays" INTEGER NOT NULL DEFAULT 30,

    CONSTRAINT "payment_method_installments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_method_installments_paymentMethodId_installment_key" ON "payment_method_installments"("paymentMethodId", "installment");

-- AddForeignKey
ALTER TABLE "payment_method_installments" ADD CONSTRAINT "payment_method_installments_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
