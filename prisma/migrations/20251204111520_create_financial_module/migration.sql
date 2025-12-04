-- CreateEnum
CREATE TYPE "TitleStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'CANCELED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "TitleType" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('PAYMENT', 'REVERSAL', 'INTEREST', 'DISCOUNT', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "financial_titles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "titleNumber" TEXT NOT NULL,
    "description" TEXT,
    "type" "TitleType" NOT NULL DEFAULT 'RECEIVABLE',
    "customerId" TEXT,
    "orderId" TEXT,
    "originalAmount" DECIMAL(10,2) NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "competenceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "TitleStatus" NOT NULL DEFAULT 'OPEN',
    "paymentMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_titles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_movements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "observation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_titles_tenantId_status_idx" ON "financial_titles"("tenantId", "status");

-- CreateIndex
CREATE INDEX "financial_titles_tenantId_dueDate_idx" ON "financial_titles"("tenantId", "dueDate");

-- CreateIndex
CREATE INDEX "financial_titles_customerId_idx" ON "financial_titles"("customerId");

-- AddForeignKey
ALTER TABLE "financial_titles" ADD CONSTRAINT "financial_titles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_titles" ADD CONSTRAINT "financial_titles_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_titles" ADD CONSTRAINT "financial_titles_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "financial_titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
