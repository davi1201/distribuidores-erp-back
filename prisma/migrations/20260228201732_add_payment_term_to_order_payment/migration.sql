-- AlterTable
ALTER TABLE "order_payments" ADD COLUMN     "paymentTermId" TEXT;

-- AddForeignKey
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
