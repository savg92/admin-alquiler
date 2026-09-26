export const DOMAIN_VERSION = "0.1.0";
export { buildAuditEvent } from "./audit";
export type { AuditEvent, AuditEventInput } from "./audit";
export {
  MAX_CONFIG_BYTES,
  MAX_CONFIG_KEYS,
  setupChecklist,
  tenancyPeriodsOverlap,
  validateBulkUnits,
  validateConfigRecord,
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
  applyIndexIncrease,
  buildRentSchedule,
  chargePaymentStatus,
  expiringPolicies,
  periodDueDate,
  periodKey,
  quoteIndemnity,
  renewalStage,
  validateCodeudorTerms,
  validateContractTerms,
  validateIndexValue,
  validateRenewalTerms,
  validateTermination,
} from "./rental";
export type {
  AllocationResult,
  ChargeBalance,
  ChargePaymentStatus,
  CodeudorTermsInput,
  ContractTermsInput,
  IndemnityQuote,
  IndemnityRuleId,
  PaymentAllocation,
  PolicyExpiry,
  RenewalStage,
  RenewalTermsInput,
  ScheduleEntry,
  TerminationInput,
} from "./rental";
export {
  ATTACHMENT_KINDS,
  ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  validateAttachment,
} from "./attachments";
export type { AttachmentInput, AttachmentKind, ValidAttachment } from "./attachments";
export {
  decideImport,
  dedupeKey,
  parseAmountToMinor,
  parseBankCsv,
  suggestMatches,
} from "./finance-import";
export type {
  ImportDecision,
  MatchCandidate,
  MatchSuggestion,
  ParsedBankRow,
  SupportedBank,
} from "./finance-import";
export {
  delinquencyRate,
  occupancyRate,
  statementTotals,
  upcomingExpirations,
  validateCurrencyCode,
  validateTransferRef,
} from "./reporting";
