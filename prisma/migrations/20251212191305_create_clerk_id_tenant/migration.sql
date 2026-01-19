/*
  Warnings:

  - You are about to drop the column `clerkId` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[clerkId]` on the table `tenants` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "users_clerkId_key";

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "clerkId" TEXT;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "clerkId";

-- CreateIndex
CREATE UNIQUE INDEX "tenants_clerkId_key" ON "tenants"("clerkId");
