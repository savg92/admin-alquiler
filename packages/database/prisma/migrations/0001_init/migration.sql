-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "UnitSubtype" AS ENUM ('RESIDENTIAL', 'OFFICE', 'PARKING', 'STORAGE');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATED', 'RENEWED');

-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('RENT', 'UTILITY', 'PH_ORDINARY', 'PH_EXTRAORDINARY', 'FINE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'WAIVED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('TRANSFER', 'PSE', 'CASH', 'CHECK', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SIGNED', 'FINAL', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "MaintenancePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "DunningStage" AS ENUM ('DAY_3', 'DAY_7', 'DAY_15', 'DAY_30');

-- CreateEnum
CREATE TYPE "LateFeeScope" AS ENUM ('COUNTRY', 'ORGANIZATION', 'CONTRACT');

-- CreateEnum
CREATE TYPE "LateFeeRateType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "LateFeeBase" AS ENUM ('TOTAL_DUE', 'RENT_ONLY');

-- CreateEnum
CREATE TYPE "IndexSource" AS ENUM ('PROVIDER', 'MANUAL');

-- CreateEnum
CREATE TYPE "VoteChoice" AS ENUM ('APPROVE', 'REJECT', 'ABSTAIN');

-- CreateEnum
CREATE TYPE "AssemblyMajority" AS ENUM ('ORDINARY', 'QUALIFIED');

-- CreateEnum
CREATE TYPE "AdminFeeType" AS ENUM ('ORDINARY', 'EXTRAORDINARY');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" CHAR(2) NOT NULL,
    "locale" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'es-CO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "rotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" CHAR(2) NOT NULL,
    "phEnabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "subtype" "UnitSubtype" NOT NULL,
    "areaM2" DECIMAL(10,2),
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Owner" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyOwnership" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sharePct" DECIMAL(5,2) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,

    CONSTRAINT "PropertyOwnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "documentId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenancy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "tenantId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,

    CONSTRAINT "Tenancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "rentAmount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "terms" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Codeudor" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "documentId" TEXT,
    "contact" TEXT,
    "validFrom" DATE NOT NULL,
    "validUntil" DATE,

    CONSTRAINT "Codeudor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractTermination" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "noticeDate" DATE NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "cause" TEXT NOT NULL,
    "indemnityRef" TEXT,

    CONSTRAINT "ContractTermination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Charge" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "type" "ChargeType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "dueDate" DATE NOT NULL,
    "period" TEXT NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeterReading" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "utility" TEXT NOT NULL,
    "value" DECIMAL(19,4) NOT NULL,
    "readingDate" DATE NOT NULL,
    "photoRef" TEXT,
    "anomaly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeterReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "Allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "held" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "deducted" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "returned" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DunningEvent" (
    "id" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "stage" "DunningStage" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "state" TEXT NOT NULL DEFAULT 'sent',

    CONSTRAINT "DunningEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LateFeeRule" (
    "id" TEXT NOT NULL,
    "scope" "LateFeeScope" NOT NULL,
    "orgId" TEXT,
    "contractId" TEXT,
    "rateType" "LateFeeRateType" NOT NULL,
    "rate" DECIMAL(10,4) NOT NULL,
    "graceDays" INTEGER NOT NULL DEFAULT 0,
    "base" "LateFeeBase" NOT NULL DEFAULT 'TOTAL_DUE',

    CONSTRAINT "LateFeeRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentIncreaseIndex" (
    "id" TEXT NOT NULL,
    "country" CHAR(2) NOT NULL,
    "period" TEXT NOT NULL,
    "value" DECIMAL(8,4) NOT NULL,
    "source" "IndexSource" NOT NULL,
    "fetchedBy" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentIncreaseIndex_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTransaction" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "source" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "accountRef" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "reference" TEXT,
    "transactionAt" TIMESTAMP(3) NOT NULL,
    "raw" JSONB,
    "quarantined" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reconciliation" (
    "id" TEXT NOT NULL,
    "bankTransactionId" TEXT NOT NULL,
    "confirmedBy" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "Reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT,
    "percentage" DECIMAL(5,2),
    "fixedFee" DECIMAL(19,4),
    "currency" CHAR(3),

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "collected" DECIMAL(19,4) NOT NULL,
    "commission" DECIMAL(19,4) NOT NULL,
    "deductions" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "net" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "payoutRef" TEXT,
    "payoutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementLine" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sharePct" DECIMAL(5,2) NOT NULL,
    "gross" DECIMAL(19,4) NOT NULL,
    "net" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "SettlementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "body" TEXT NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "storageRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "approved" BOOLEAN,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signature" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "signerId" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proof" TEXT,

    CONSTRAINT "Signature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceRequest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "MaintenancePriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "supplierId" TEXT,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'OPEN',
    "cost" DECIMAL(19,4),
    "currency" CHAR(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "contact" TEXT,
    "taxId" TEXT,
    "address" TEXT,
    "notes" TEXT,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "supplierId" TEXT,
    "place" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "date" DATE NOT NULL,
    "receiptRef" TEXT,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "reporter" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insurance" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "propertyId" TEXT,
    "contractId" TEXT,
    "provider" TEXT NOT NULL,
    "policyRef" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "validUntil" DATE NOT NULL,

    CONSTRAINT "Insurance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRecord" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "country" CHAR(2) NOT NULL,
    "label" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "receiptRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseRule" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminFee" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "type" "AdminFeeType" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "dueDate" DATE NOT NULL,
    "assemblyActId" TEXT,

    CONSTRAINT "AdminFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyAct" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "heldAt" TIMESTAMP(3) NOT NULL,
    "attendance" JSONB,
    "quorumMet" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssemblyAct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "assemblyActId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "majority" "AssemblyMajority" NOT NULL,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "ownerId" TEXT,
    "weight" DECIMAL(8,4) NOT NULL,
    "choice" "VoteChoice" NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Communication" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "recipients" JSONB NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Communication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Role_orgId_idx" ON "Role"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_orgId_name_key" ON "Role"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "Membership_orgId_idx" ON "Membership"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_orgId_key" ON "Membership"("userId", "orgId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Property_orgId_idx" ON "Property"("orgId");

-- CreateIndex
CREATE INDEX "Unit_propertyId_idx" ON "Unit"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_propertyId_code_key" ON "Unit"("propertyId", "code");

-- CreateIndex
CREATE INDEX "Owner_orgId_idx" ON "Owner"("orgId");

-- CreateIndex
CREATE INDEX "PropertyOwnership_propertyId_idx" ON "PropertyOwnership"("propertyId");

-- CreateIndex
CREATE INDEX "PropertyOwnership_ownerId_idx" ON "PropertyOwnership"("ownerId");

-- CreateIndex
CREATE INDEX "Tenant_orgId_idx" ON "Tenant"("orgId");

-- CreateIndex
CREATE INDEX "Tenancy_orgId_idx" ON "Tenancy"("orgId");

-- CreateIndex
CREATE INDEX "Tenancy_propertyId_idx" ON "Tenancy"("propertyId");

-- CreateIndex
CREATE INDEX "Tenancy_tenantId_idx" ON "Tenancy"("tenantId");

-- CreateIndex
CREATE INDEX "Contract_orgId_idx" ON "Contract"("orgId");

-- CreateIndex
CREATE INDEX "Contract_propertyId_idx" ON "Contract"("propertyId");

-- CreateIndex
CREATE INDEX "Contract_tenantId_idx" ON "Contract"("tenantId");

-- CreateIndex
CREATE INDEX "Contract_status_idx" ON "Contract"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_orgId_number_key" ON "Contract"("orgId", "number");

-- CreateIndex
CREATE INDEX "Codeudor_contractId_idx" ON "Codeudor"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractTermination_contractId_key" ON "ContractTermination"("contractId");

-- CreateIndex
CREATE INDEX "Charge_orgId_idx" ON "Charge"("orgId");

-- CreateIndex
CREATE INDEX "Charge_contractId_idx" ON "Charge"("contractId");

-- CreateIndex
CREATE INDEX "Charge_status_idx" ON "Charge"("status");

-- CreateIndex
CREATE INDEX "Charge_dueDate_idx" ON "Charge"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Charge_contractId_period_type_key" ON "Charge"("contractId", "period", "type");

-- CreateIndex
CREATE INDEX "MeterReading_unitId_idx" ON "MeterReading"("unitId");

-- CreateIndex
CREATE INDEX "Payment_orgId_idx" ON "Payment"("orgId");

-- CreateIndex
CREATE INDEX "Payment_contractId_idx" ON "Payment"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_paymentId_key" ON "Receipt"("paymentId");

-- CreateIndex
CREATE INDEX "Receipt_number_idx" ON "Receipt"("number");

-- CreateIndex
CREATE INDEX "Allocation_paymentId_idx" ON "Allocation"("paymentId");

-- CreateIndex
CREATE INDEX "Allocation_chargeId_idx" ON "Allocation"("chargeId");

-- CreateIndex
CREATE INDEX "Deposit_contractId_idx" ON "Deposit"("contractId");

-- CreateIndex
CREATE INDEX "DunningEvent_chargeId_idx" ON "DunningEvent"("chargeId");

-- CreateIndex
CREATE UNIQUE INDEX "DunningEvent_chargeId_stage_channel_key" ON "DunningEvent"("chargeId", "stage", "channel");

-- CreateIndex
CREATE INDEX "LateFeeRule_orgId_idx" ON "LateFeeRule"("orgId");

-- CreateIndex
CREATE INDEX "LateFeeRule_contractId_idx" ON "LateFeeRule"("contractId");

-- CreateIndex
CREATE INDEX "RentIncreaseIndex_country_idx" ON "RentIncreaseIndex"("country");

-- CreateIndex
CREATE UNIQUE INDEX "RentIncreaseIndex_country_period_key" ON "RentIncreaseIndex"("country", "period");

-- CreateIndex
CREATE INDEX "Account_orgId_idx" ON "Account"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_orgId_code_key" ON "Account"("orgId", "code");

-- CreateIndex
CREATE INDEX "Category_orgId_idx" ON "Category"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_orgId_name_key" ON "Category"("orgId", "name");

-- CreateIndex
CREATE INDEX "FinancialTransaction_orgId_idx" ON "FinancialTransaction"("orgId");

-- CreateIndex
CREATE INDEX "FinancialTransaction_accountId_idx" ON "FinancialTransaction"("accountId");

-- CreateIndex
CREATE INDEX "BankTransaction_orgId_idx" ON "BankTransaction"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_bank_accountRef_transactionAt_amount_refere_key" ON "BankTransaction"("bank", "accountRef", "transactionAt", "amount", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Reconciliation_bankTransactionId_key" ON "Reconciliation"("bankTransactionId");

-- CreateIndex
CREATE INDEX "CommissionRule_orgId_idx" ON "CommissionRule"("orgId");

-- CreateIndex
CREATE INDEX "Settlement_orgId_idx" ON "Settlement"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_propertyId_period_key" ON "Settlement"("propertyId", "period");

-- CreateIndex
CREATE INDEX "SettlementLine_settlementId_idx" ON "SettlementLine"("settlementId");

-- CreateIndex
CREATE INDEX "DocumentTemplate_orgId_idx" ON "DocumentTemplate"("orgId");

-- CreateIndex
CREATE INDEX "Document_orgId_idx" ON "Document"("orgId");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE INDEX "DocumentVersion_documentId_idx" ON "DocumentVersion"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_version_key" ON "DocumentVersion"("documentId", "version");

-- CreateIndex
CREATE INDEX "Approval_documentId_idx" ON "Approval"("documentId");

-- CreateIndex
CREATE INDEX "Signature_documentId_idx" ON "Signature"("documentId");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_orgId_idx" ON "MaintenanceRequest"("orgId");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_propertyId_idx" ON "MaintenanceRequest"("propertyId");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_status_idx" ON "MaintenanceRequest"("status");

-- CreateIndex
CREATE INDEX "WorkOrder_requestId_idx" ON "WorkOrder"("requestId");

-- CreateIndex
CREATE INDEX "Supplier_orgId_idx" ON "Supplier"("orgId");

-- CreateIndex
CREATE INDEX "Purchase_orgId_idx" ON "Purchase"("orgId");

-- CreateIndex
CREATE INDEX "Purchase_propertyId_idx" ON "Purchase"("propertyId");

-- CreateIndex
CREATE INDEX "Complaint_orgId_idx" ON "Complaint"("orgId");

-- CreateIndex
CREATE INDEX "Complaint_propertyId_idx" ON "Complaint"("propertyId");

-- CreateIndex
CREATE INDEX "Claim_orgId_idx" ON "Claim"("orgId");

-- CreateIndex
CREATE INDEX "Claim_propertyId_idx" ON "Claim"("propertyId");

-- CreateIndex
CREATE INDEX "Insurance_orgId_idx" ON "Insurance"("orgId");

-- CreateIndex
CREATE INDEX "TaxRecord_orgId_idx" ON "TaxRecord"("orgId");

-- CreateIndex
CREATE INDEX "TaxRecord_dueDate_idx" ON "TaxRecord"("dueDate");

-- CreateIndex
CREATE INDEX "HouseRule_propertyId_idx" ON "HouseRule"("propertyId");

-- CreateIndex
CREATE INDEX "AdminFee_propertyId_idx" ON "AdminFee"("propertyId");

-- CreateIndex
CREATE INDEX "AssemblyAct_propertyId_idx" ON "AssemblyAct"("propertyId");

-- CreateIndex
CREATE INDEX "Decision_assemblyActId_idx" ON "Decision"("assemblyActId");

-- CreateIndex
CREATE INDEX "Vote_decisionId_idx" ON "Vote"("decisionId");

-- CreateIndex
CREATE INDEX "Communication_orgId_idx" ON "Communication"("orgId");

-- CreateIndex
CREATE INDEX "Notification_orgId_idx" ON "Notification"("orgId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "AuditEvent_orgId_createdAt_idx" ON "AuditEvent"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "OutboxEvent_processedAt_occurredAt_idx" ON "OutboxEvent"("processedAt", "occurredAt");

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyOwnership" ADD CONSTRAINT "PropertyOwnership_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyOwnership" ADD CONSTRAINT "PropertyOwnership_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Codeudor" ADD CONSTRAINT "Codeudor_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractTermination" ADD CONSTRAINT "ContractTermination_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeterReading" ADD CONSTRAINT "MeterReading_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DunningEvent" ADD CONSTRAINT "DunningEvent_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LateFeeRule" ADD CONSTRAINT "LateFeeRule_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LateFeeRule" ADD CONSTRAINT "LateFeeRule_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MaintenanceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseRule" ADD CONSTRAINT "HouseRule_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminFee" ADD CONSTRAINT "AdminFee_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminFee" ADD CONSTRAINT "AdminFee_assemblyActId_fkey" FOREIGN KEY ("assemblyActId") REFERENCES "AssemblyAct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyAct" ADD CONSTRAINT "AssemblyAct_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_assemblyActId_fkey" FOREIGN KEY ("assemblyActId") REFERENCES "AssemblyAct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

