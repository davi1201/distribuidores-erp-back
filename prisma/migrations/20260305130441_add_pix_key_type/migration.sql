-- CreateEnum
CREATE TYPE "PixKeyType" AS ENUM ('CPF', 'CNPJ', 'EMAIL', 'PHONE');

-- AlterTable
ALTER TABLE "bank_accounts" ADD COLUMN     "pixKeyType" "PixKeyType";
