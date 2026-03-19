-- CreateEnum
CREATE TYPE "CfopType" AS ENUM ('ENTRY', 'EXIT');

-- CreateTable
CREATE TABLE "tax_ncms" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(8) NOT NULL,
    "description" TEXT NOT NULL,
    "unit" VARCHAR(10),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_ncms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_cests" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(7) NOT NULL,
    "ncmCode" VARCHAR(8),
    "description" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_cests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_cfops" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(4) NOT NULL,
    "description" TEXT NOT NULL,
    "type" "CfopType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_cfops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_ncms_code_key" ON "tax_ncms"("code");

-- CreateIndex
CREATE INDEX "tax_ncms_code_idx" ON "tax_ncms"("code");

-- CreateIndex
CREATE INDEX "tax_ncms_description_idx" ON "tax_ncms"("description");

-- CreateIndex
CREATE UNIQUE INDEX "tax_cests_code_key" ON "tax_cests"("code");

-- CreateIndex
CREATE INDEX "tax_cests_code_idx" ON "tax_cests"("code");

-- CreateIndex
CREATE INDEX "tax_cests_ncmCode_idx" ON "tax_cests"("ncmCode");

-- CreateIndex
CREATE UNIQUE INDEX "tax_cfops_code_key" ON "tax_cfops"("code");

-- CreateIndex
CREATE INDEX "tax_cfops_code_idx" ON "tax_cfops"("code");

-- CreateIndex
CREATE INDEX "tax_cfops_type_idx" ON "tax_cfops"("type");
