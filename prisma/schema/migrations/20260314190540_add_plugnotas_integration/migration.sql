-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "plugnotasAmbiente" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "plugnotasApiKey" TEXT,
ADD COLUMN     "plugnotasCertificadoValido" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "plugnotasCertificadoVencimento" TIMESTAMP(3),
ADD COLUMN     "plugnotasEmpresaCnpj" TEXT;

-- CreateTable
CREATE TABLE "nfe_emitidas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "idIntegracao" TEXT NOT NULL,
    "orderId" TEXT,
    "status" TEXT NOT NULL,
    "chaveAcesso" VARCHAR(44),
    "numero" INTEGER,
    "serie" INTEGER,
    "protocolo" TEXT,
    "dataAutorizacao" TIMESTAMP(3),
    "mensagem" TEXT,
    "destinatarioDocumento" TEXT,
    "destinatarioNome" TEXT,
    "valorTotal" DECIMAL(10,2) NOT NULL,
    "naturezaOperacao" TEXT NOT NULL,
    "protocoloCancelamento" TEXT,
    "dataCancelamento" TIMESTAMP(3),
    "justificativaCancelamento" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nfe_emitidas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfe_eventos" (
    "id" TEXT NOT NULL,
    "nfeId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "sequencia" INTEGER,
    "protocolo" TEXT,
    "dataEvento" TIMESTAMP(3) NOT NULL,
    "descricao" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nfe_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfe_inutilizacoes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serie" INTEGER NOT NULL,
    "numeroInicial" INTEGER NOT NULL,
    "numeroFinal" INTEGER NOT NULL,
    "justificativa" TEXT NOT NULL,
    "protocolo" TEXT,
    "status" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nfe_inutilizacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nfe_emitidas_idIntegracao_key" ON "nfe_emitidas"("idIntegracao");

-- CreateIndex
CREATE INDEX "nfe_emitidas_tenantId_status_idx" ON "nfe_emitidas"("tenantId", "status");

-- CreateIndex
CREATE INDEX "nfe_emitidas_tenantId_orderId_idx" ON "nfe_emitidas"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "nfe_emitidas_tenantId_chaveAcesso_idx" ON "nfe_emitidas"("tenantId", "chaveAcesso");

-- CreateIndex
CREATE INDEX "nfe_emitidas_tenantId_createdAt_idx" ON "nfe_emitidas"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "nfe_eventos_nfeId_tipo_idx" ON "nfe_eventos"("nfeId", "tipo");

-- CreateIndex
CREATE INDEX "nfe_inutilizacoes_tenantId_idx" ON "nfe_inutilizacoes"("tenantId");

-- AddForeignKey
ALTER TABLE "nfe_emitidas" ADD CONSTRAINT "nfe_emitidas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfe_emitidas" ADD CONSTRAINT "nfe_emitidas_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfe_emitidas" ADD CONSTRAINT "nfe_emitidas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfe_eventos" ADD CONSTRAINT "nfe_eventos_nfeId_fkey" FOREIGN KEY ("nfeId") REFERENCES "nfe_emitidas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfe_inutilizacoes" ADD CONSTRAINT "nfe_inutilizacoes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfe_inutilizacoes" ADD CONSTRAINT "nfe_inutilizacoes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
