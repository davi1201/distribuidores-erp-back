-- AlterTable
ALTER TABLE "bank_accounts" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pixKey" TEXT;
