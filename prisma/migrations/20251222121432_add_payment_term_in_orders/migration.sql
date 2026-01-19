-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "paymentTermId" TEXT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
