-- CreateTable
CREATE TABLE "AIModel" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "runtime" TEXT NOT NULL,
    "quantization" TEXT,
    "capabilities" TEXT[] NOT NULL,
    "contextSize" INTEGER,
    "languages" TEXT[] NOT NULL,
    "privacyTier" TEXT NOT NULL,
    "hardware" JSONB,
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "score" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIModel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AIModel_modelId_key" ON "AIModel"("modelId");

-- CreateIndex
CREATE INDEX "AIModel_status_idx" ON "AIModel"("status");

-- CreateIndex
CREATE INDEX "AIModel_runtime_idx" ON "AIModel"("runtime");

-- CreateTable
CREATE TABLE "AIDecisionObservation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "modelId" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIDecisionObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIDecisionObservation_modelId_questionType_idx" ON "AIDecisionObservation"("modelId", "questionType");

-- CreateIndex
CREATE INDEX "AIDecisionObservation_createdAt_idx" ON "AIDecisionObservation"("createdAt");
