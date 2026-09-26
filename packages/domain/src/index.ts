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
  agingReport,
  allocatePayment,
  applyIndexIncrease,
  buildRentSchedule,
  chargePaymentStatus,
  consumptionBetween,
  depositRemaining,
  detectReadingAnomaly,
  evaluateLateFee,
  expiringPolicies,
  periodDueDate,
  periodKey,
  quoteIndemnity,
  renewalStage,
  validateCodeudorTerms,
  validateContractTerms,
  validateDepositMovement,
  validateIndexValue,
  validateLateFeeRule,
  validateMeterReading,
  validateRenewalTerms,
  validateTermination,
  COLOMBIA_DEFAULT_LATE_FEE,
} from "./rental";
export type {
  AgingBuckets,
  AgingItem,
  AllocationResult,
  AnomalyVerdict,
  ChargeBalance,
  ChargePaymentStatus,
  CodeudorTermsInput,
  ContractTermsInput,
  DepositLedger,
  IndemnityQuote,
  IndemnityRuleId,
  LateFeeBase,
  LateFeeQuote,
  LateFeeRateType,
  LateFeeRuleInput,
  MeterReadingInput,
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
