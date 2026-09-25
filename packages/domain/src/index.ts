export const DOMAIN_VERSION = "0.1.0";
export { buildAuditEvent } from "./audit";
export type { AuditEvent, AuditEventInput } from "./audit";
export {
  setupChecklist,
  tenancyPeriodsOverlap,
  validateBulkUnits,
  validateOwnershipShares,
} from "./property-setup";
export type {
  BulkUnitInput,
  OwnershipShareInput,
  SetupChecklist,
  SetupStatusInput,
  TenancyPeriod,
  UnitSubtype,
} from "./property-setup";
export {
  allocatePayment,
  chargePaymentStatus,
  periodDueDate,
  periodKey,
  validateContractTerms,
} from "./rental";
export type {
  AllocationResult,
  ChargeBalance,
  ChargePaymentStatus,
  ContractTermsInput,
  PaymentAllocation,
} from "./rental";
