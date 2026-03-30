import type { ScraperRow, ScraperStatus } from '../types/scraper.js';
import type { BatchSummary } from '../types/validation.js';

// --- Input types ---

export interface BatchHealthInput {
  scraper: ScraperRow;
  summary: BatchSummary;
  insertedCount: number;
}

export interface RunHealthInput {
  scraper: ScraperRow;
  urlsDiscovered: number;
  urlsNew: number;
  listingsSubmitted: number;
}

// --- Output type ---

export interface HealthCheckResult {
  /** New status to transition to, or null if no change. */
  newStatus: ScraperStatus | null;
  /** Human-readable reason for the transition (or current state). */
  reason: string | null;
  /** Whether to update last_successful_insert_at to now. */
  updateInsertTimestamp: boolean;
}

// --- Evaluation functions ---

/**
 * Evaluate scraper health based on batch validation results.
 * Called from the /batch endpoint. Checks 3 (validation degradation) and 4 (validation failure).
 *
 * Broken checks are evaluated first so they take priority.
 * Recovery (degraded → active) only happens when ALL checks pass.
 * Broken never auto-recovers.
 */
export function evaluateBatchHealth(input: BatchHealthInput): HealthCheckResult {
  const { scraper, summary, insertedCount } = input;
  const shouldUpdateInsert = insertedCount > 0;

  // Skip paused/testing scrapers
  if (scraper.status === 'paused' || scraper.status === 'testing') {
    return { newStatus: null, reason: null, updateInsertTimestamp: shouldUpdateInsert };
  }

  const totalAccepted = summary.accepted + summary.accepted_with_warnings;

  // Check 4: Validation failure — all listings rejected (>1 submitted)
  if (summary.total_submitted > 1 && totalAccepted === 0) {
    if (scraper.status !== 'broken') {
      return {
        newStatus: 'broken',
        reason: `Validation failure: all ${summary.total_submitted} listings rejected`,
        updateInsertTimestamp: shouldUpdateInsert,
      };
    }
    // Already broken — no change but update reason
    return {
      newStatus: null,
      reason: `Validation failure: all ${summary.total_submitted} listings rejected`,
      updateInsertTimestamp: shouldUpdateInsert,
    };
  }

  // Check 3: Validation degradation — >1 rejected AND rejection rate >10%
  if (summary.rejected > 1 && summary.total_submitted > 0) {
    const rejectionRate = summary.rejected / summary.total_submitted;
    if (rejectionRate > 0.1) {
      const ratePercent = Math.round(rejectionRate * 100);
      if (scraper.status === 'active') {
        return {
          newStatus: 'degraded',
          reason: `Validation degradation: ${ratePercent}% rejection rate`,
          updateInsertTimestamp: shouldUpdateInsert,
        };
      }
      if (scraper.status === 'broken') {
        return {
          newStatus: null,
          reason: `Validation degradation: ${ratePercent}% rejection rate`,
          updateInsertTimestamp: shouldUpdateInsert,
        };
      }
      // Already degraded — no status change
      return {
        newStatus: null,
        reason: `Validation degradation: ${ratePercent}% rejection rate`,
        updateInsertTimestamp: shouldUpdateInsert,
      };
    }
  }

  // All batch checks passed — recover if degraded
  if (scraper.status === 'degraded') {
    return {
      newStatus: 'active',
      reason: 'All health checks passed',
      updateInsertTimestamp: shouldUpdateInsert,
    };
  }

  // No change needed
  return { newStatus: null, reason: null, updateInsertTimestamp: shouldUpdateInsert };
}

/**
 * Evaluate scraper health based on pipeline run report.
 * Called from the /run endpoint. Checks 1a (discovery total failure),
 * 1b (discovery mismatch), and 2 (pipeline leakage).
 *
 * Broken checks are evaluated first so they take priority.
 * Recovery (degraded → active) only happens when ALL checks pass.
 * Broken never auto-recovers.
 */
export function evaluateRunHealth(input: RunHealthInput): HealthCheckResult {
  const { scraper, urlsDiscovered, urlsNew, listingsSubmitted } = input;

  // Skip paused/testing scrapers
  if (scraper.status === 'paused' || scraper.status === 'testing') {
    return { newStatus: null, reason: null, updateInsertTimestamp: false };
  }

  // Check 1a: Discovery total failure — 0 listings discovered
  if (urlsDiscovered === 0) {
    if (scraper.status !== 'broken') {
      return {
        newStatus: 'broken',
        reason: 'Discovery failure: 0 listings discovered',
        updateInsertTimestamp: false,
      };
    }
    return {
      newStatus: null,
      reason: 'Discovery failure: 0 listings discovered',
      updateInsertTimestamp: false,
    };
  }

  // Check 1b: Discovery mismatch — discovered != expected
  if (scraper.expected_discovery_count > 0 && urlsDiscovered !== scraper.expected_discovery_count) {
    if (scraper.status === 'active') {
      return {
        newStatus: 'degraded',
        reason: `Discovery mismatch: ${urlsDiscovered} found, expected ${scraper.expected_discovery_count}`,
        updateInsertTimestamp: false,
      };
    }
    if (scraper.status === 'broken') {
      return {
        newStatus: null,
        reason: `Discovery mismatch: ${urlsDiscovered} found, expected ${scraper.expected_discovery_count}`,
        updateInsertTimestamp: false,
      };
    }
    // Already degraded
    return {
      newStatus: null,
      reason: `Discovery mismatch: ${urlsDiscovered} found, expected ${scraper.expected_discovery_count}`,
      updateInsertTimestamp: false,
    };
  }

  // Check 2: Pipeline leakage — submitted < urls_new
  if (listingsSubmitted < urlsNew) {
    if (scraper.status === 'active') {
      return {
        newStatus: 'degraded',
        reason: `Pipeline leakage: ${listingsSubmitted} submitted but ${urlsNew} expected from pipeline`,
        updateInsertTimestamp: false,
      };
    }
    if (scraper.status === 'broken') {
      return {
        newStatus: null,
        reason: `Pipeline leakage: ${listingsSubmitted} submitted but ${urlsNew} expected from pipeline`,
        updateInsertTimestamp: false,
      };
    }
    return {
      newStatus: null,
      reason: `Pipeline leakage: ${listingsSubmitted} submitted but ${urlsNew} expected from pipeline`,
      updateInsertTimestamp: false,
    };
  }

  // All run checks passed — recover if degraded
  if (scraper.status === 'degraded') {
    return {
      newStatus: 'active',
      reason: 'All health checks passed',
      updateInsertTimestamp: false,
    };
  }

  // No change needed
  return { newStatus: null, reason: null, updateInsertTimestamp: false };
}
