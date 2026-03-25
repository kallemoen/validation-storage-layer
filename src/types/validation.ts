export interface ValidationIssue {
  field: string;
  rule: string;
  value: unknown;
  expected?: string;
  detail?: string;
}

export type ValidationStatus = 'accepted' | 'rejected' | 'accepted_with_warnings';

export interface ValidationResult {
  status: ValidationStatus;
  listing_id: string;
  config_id: string;
  mode: 'test' | 'live';
  tier_1_errors: ValidationIssue[];
  tier_2_errors: ValidationIssue[];
  tier_3_warnings: ValidationIssue[];
  evaluated_at: string;
}

export interface BatchValidationResult {
  results: ValidationResult[];
  summary: BatchSummary;
}

export interface BatchSummary {
  config_id: string;
  total_submitted: number;
  accepted: number;
  accepted_with_warnings: number;
  rejected: number;
  top_rejection_reasons: Array<{ rule: string; count: number }>;
}

export interface ValidationContext {
  scraperConfig: {
    config_id: string;
    country_code: string;
    listing_type: string;
    config: Record<string, unknown>;
  };
  countryBounds: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }>;
  priceRanges: Record<string, { min: number; max: number }>;
}

export type ValidationRule = {
  name: string;
  check: (input: Record<string, unknown>, context: ValidationContext) => ValidationIssue[];
};
