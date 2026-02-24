-- AddForeignKey
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
