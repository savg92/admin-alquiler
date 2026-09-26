-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('PHOTO', 'RECORD', 'DOCUMENT');

-- CreateTable
CREATE TABLE "PropertyAttachment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "kind" "AttachmentKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PropertyAttachment_orgId_idx" ON "PropertyAttachment"("orgId");

-- CreateIndex
CREATE INDEX "PropertyAttachment_propertyId_idx" ON "PropertyAttachment"("propertyId");

-- AddForeignKey
ALTER TABLE "PropertyAttachment" ADD CONSTRAINT "PropertyAttachment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyAttachment" ADD CONSTRAINT "PropertyAttachment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
