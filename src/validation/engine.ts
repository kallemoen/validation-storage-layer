import type { ValidationResult, ValidationContext, ValidationIssue, BatchValidationResult, BatchSummary } from '../types/validation.js';
import { tier1Rules } from './tier1-schema.js';
import { tier2Rules } from './tier2-semantic.js';
import { tier3Rules } from './tier3-completeness.js';

export function validateListing(
  input: Record<string, unknown>,
  context: ValidationContext,
  mode: 'test' | 'live',
): ValidationResult {
  const listingId = (input.listing_id as string) ?? 'unknown';
  const configId = (input.config_id as string) ?? context.scraperConfig.config_id;
  const now = new Date().toISOString();

  // Tier 1: Schema validation
  const tier1Errors: ValidationIssue[] = [];
  for (const rule of tier1Rules) {
    tier1Errors.push(...rule.check(input, context));
  }

  if (tier1Errors.length > 0) {
    return {
      status: 'rejected',
      listing_id: listingId,
      config_id: configId,
      mode,
      tier_1_errors: tier1Errors,
      tier_2_errors: [],
      tier_3_warnings: [],
      evaluated_at: now,
    };
  }

  // Tier 2: Semantic validation
  const tier2Errors: ValidationIssue[] = [];
  for (const rule of tier2Rules) {
    tier2Errors.push(...rule.check(input, context));
  }

  if (tier2Errors.length > 0) {
    return {
      status: 'rejected',
      listing_id: listingId,
      config_id: configId,
      mode,
      tier_1_errors: [],
      tier_2_errors: tier2Errors,
      tier_3_warnings: [],
      evaluated_at: now,
    };
  }

  // Tier 3: Completeness validation
  const tier3Warnings: ValidationIssue[] = [];
  for (const rule of tier3Rules) {
    tier3Warnings.push(...rule.check(input, context));
  }

  return {
    status: tier3Warnings.length > 0 ? 'accepted_with_warnings' : 'accepted',
    listing_id: listingId,
    config_id: configId,
    mode,
    tier_1_errors: [],
    tier_2_errors: [],
    tier_3_warnings: tier3Warnings,
    evaluated_at: now,
  };
}

export function validateBatch(
  inputs: Record<string, unknown>[],
  context: ValidationContext,
  mode: 'test' | 'live',
): BatchValidationResult {
  const results = inputs.map(input => validateListing(input, context, mode));

  const summary: BatchSummary = {
    config_id: context.scraperConfig.config_id,
    total_submitted: results.length,
    accepted: results.filter(r => r.status === 'accepted').length,
    accepted_with_warnings: results.filter(r => r.status === 'accepted_with_warnings').length,
    rejected: results.filter(r => r.status === 'rejected').length,
    top_rejection_reasons: computeTopRejectionReasons(results),
  };

  return { results, summary };
}

function computeTopRejectionReasons(
  results: ValidationResult[],
): Array<{ rule: string; count: number }> {
  const counts = new Map<string, number>();

  for (const result of results) {
    if (result.status === 'rejected') {
      const allErrors = [...result.tier_1_errors, ...result.tier_2_errors];
      for (const error of allErrors) {
        counts.set(error.rule, (counts.get(error.rule) ?? 0) + 1);
      }
    }
  }

  return Array.from(counts.entries())
    .map(([rule, count]) => ({ rule, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}
