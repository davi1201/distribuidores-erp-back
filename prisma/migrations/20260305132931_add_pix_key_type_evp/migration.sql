/*
  Warnings:

  - The values [RANDOM] on the enum `PixKeyType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PixKeyType_new" AS ENUM ('CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP');
ALTER TABLE "bank_accounts" ALTER COLUMN "pixKeyType" TYPE "PixKeyType_new" USING ("pixKeyType"::text::"PixKeyType_new");
ALTER TYPE "PixKeyType" RENAME TO "PixKeyType_old";
ALTER TYPE "PixKeyType_new" RENAME TO "PixKeyType";
DROP TYPE "PixKeyType_old";
COMMIT;
