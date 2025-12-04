/*
  Warnings:

  - You are about to drop the column `document` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `personType` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `tenants` table. All the data in the column will be lost.
  - Added the required column `email` to the `billing_profiles` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "tenants_document_key";

-- AlterTable
ALTER TABLE "billing_profiles" ADD COLUMN     "email" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "tenants" DROP COLUMN "document",
DROP COLUMN "email",
DROP COLUMN "personType",
DROP COLUMN "phone";
