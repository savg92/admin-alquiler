-- CreateTable
CREATE TABLE "Handover" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "contractId" TEXT,
    "maintenanceId" TEXT,
    "kind" TEXT NOT NULL,
    "notes" TEXT,
    "evidence" JSONB,
    "documentId" TEXT,
    "depositDeduction" JSONB,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Handover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Handover_orgId_idx" ON "Handover"("orgId");

-- CreateIndex
CREATE INDEX "Handover_propertyId_idx" ON "Handover"("propertyId");

-- CreateIndex
CREATE INDEX "Handover_contractId_idx" ON "Handover"("contractId");

-- AddForeignKey
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_maintenanceId_fkey" FOREIGN KEY ("maintenanceId") REFERENCES "MaintenanceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
