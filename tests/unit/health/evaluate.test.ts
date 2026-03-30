import { describe, it, expect } from 'vitest';
import { evaluateBatchHealth, evaluateRunHealth } from '../../../src/health/evaluate.js';
import type { ScraperRow } from '../../../src/types/scraper.js';
import type { BatchSummary } from '../../../src/types/validation.js';

// --- Helpers ---

function makeScraper(overrides: Partial<ScraperRow> = {}): ScraperRow {
  return {
    config_id: 'test-config-id',
    agency_name: 'Test Agency',
    country_code: 'PT',
    area_key: 'lisbon',
    listing_type: 'rent',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    last_run_at: null,
    last_run_status: null,
    last_run_listings: null,
    failure_count: 0,
    broken_at: null,
    repair_count: 0,
    config: {},
    acceptance_rate: null,
    last_batch_at: null,
    last_batch_submitted: null,
    last_batch_accepted: null,
    top_rejection_rule: null,
    degraded_at: null,
    expected_discovery_count: 100,
    run_interval_hours: 24,
    last_successful_insert_at: null,
    status_reason: null,
    ...overrides,
  };
}

function makeSummary(overrides: Partial<BatchSummary> = {}): BatchSummary {
  return {
    config_id: 'test-config-id',
    total_submitted: 20,
    accepted: 18,
    accepted_with_warnings: 0,
    rejected: 2,
    top_rejection_reasons: [],
    ...overrides,
  };
}

// --- evaluateBatchHealth ---

describe('evaluateBatchHealth', () => {
  describe('Check 4: Validation failure', () => {
    it('should mark as broken when >1 submitted and 100% rejected', () => {
      const result = evaluateBatchHealth({
        scraper: makeScraper(),
        summary: makeSummary({ total_submitted: 10, accepted: 0, accepted_with_warnings: 0, rejected: 10 }),
        insertedCount: 0,
      });
      expect(result.newStatus).toBe('broken');
      expect(result.reason).toContain('Validation failure');
      expect(result.reason).toContain('10');
    });

    it('should pass when only 1 submitted and 100% rejected', () => {
      const result = evaluateBatchHealth({
        scraper: makeScraper(),
        summary: makeSummary({ total_submitted: 1, accepted: 0, accepted_with_warnings: 0, rejected: 1 }),
        insertedCount: 0,
      });
      expect(result.newStatus).not.toBe('broken');
    });

    it('should not change status if already broken', () => {
      const result = evaluateBatchHealth({
        scraper: makeScraper({ status: 'broken' }),
        summary: makeSummary({ total_submitted: 10, accepted: 0, accepted_with_warnings: 0, rejected: 10 }),
        insertedCount: 0,
      });
      expect(result.newStatus).toBeNull();
      expect(result.reason).toContain('Validation failure');
    });
  });

  describe('Check 3: Validation degradation', () => {
    it('should mark as degraded when >1 rejected and rate >10%', () => {
      const result = evaluateBatchHealth({
        scraper: makeScraper(),
        summary: makeSummary({ total_submitted: 20, accepted: 17, rejected: 3 }),
        insertedCount: 17,
      });
      expect(result.newStatus).toBe('degraded');
      expect(result.reason).toContain('Validation degradation');
      expect(result.reason).toContain('15%');
    });

    it('should pass when only 1 rejected (needs >1)', () => {
      const result = evaluateBatchHealth({
        scraper: makeScraper(),
        summary: makeSummary({ total_submitted: 20, accepted: 19, rejected: 1 }),
        insertedCount: 19,
      });
      expect(result.newStatus).toBeNull();
    });

    it('should pass when rate is below 10%', () => {
      const result = evaluateBatchHealth({
        scraper: makeScraper(),
        summary: makeSummary({ total_submitted: 50, accepted: 48, rejected: 2 }),
        insertedCount: 48,
      });
      expect(result.newStatus).toBeNull();
    });
  });

  describe('Recovery', () => {
    it('should recover degraded to active when all checks pass', () => {
      const result = evaluateBatchHealth({
        scraper: makeScraper({ status: 'degraded' }),
        summary: makeSummary({ total_submitted: 20, accepted: 20, rejected: 0 }),
        insertedCount: 20,
      });
      expect(result.newStatus).toBe('active');
      expect(result.reason).toContain('All health checks passed');
    });

    it('should NOT auto-recover from broken', () => {
      const result = evaluateBatchHealth({
        scraper: makeScraper({ status: 'broken' }),
        summary: makeSummary({ total_submitted: 20, accepted: 20, rejected: 0 }),
        insertedCount: 20,
      });
      expect(result.newStatus).toBeNull();
    });
  });

  describe('Insert timestamp tracking', () => {
    it('should set updateInsertTimestamp when insertedCount > 0', () => {
      const result = evaluateBatchHealth({
        scraper: makeScraper(),
        summary: makeSummary(),
        insertedCount: 5,
      });
      expect(result.updateInsertTimestamp).toBe(true);
    });

    it('should not set updateInsertTimestamp when insertedCount is 0', () => {
      const result = evaluateBatchHealth({
        scraper: makeScraper(),
        summary: makeSummary(),
        insertedCount: 0,
      });
      expect(result.updateInsertTimestamp).toBe(false);
    });
  });

  describe('Paused/testing scrapers', () => {
    it('should skip paused scrapers', () => {
      const result = evaluateBatchHealth({
        scraper: makeScraper({ status: 'paused' }),
        summary: makeSummary({ total_submitted: 10, accepted: 0, rejected: 10 }),
        insertedCount: 0,
      });
      expect(result.newStatus).toBeNull();
    });

    it('should skip testing scrapers', () => {
      const result = evaluateBatchHealth({
        scraper: makeScraper({ status: 'testing' }),
        summary: makeSummary({ total_submitted: 10, accepted: 0, rejected: 10 }),
        insertedCount: 0,
      });
      expect(result.newStatus).toBeNull();
    });
  });
});

// --- evaluateRunHealth ---

describe('evaluateRunHealth', () => {
  describe('Check 1a: Discovery total failure', () => {
    it('should mark as broken when 0 discovered', () => {
      const result = evaluateRunHealth({
        scraper: makeScraper(),
        urlsDiscovered: 0,
        urlsNew: 0,
        listingsSubmitted: 0,
      });
      expect(result.newStatus).toBe('broken');
      expect(result.reason).toContain('Discovery failure');
      expect(result.reason).toContain('0 listings discovered');
    });

    it('should not change status if already broken', () => {
      const result = evaluateRunHealth({
        scraper: makeScraper({ status: 'broken' }),
        urlsDiscovered: 0,
        urlsNew: 0,
        listingsSubmitted: 0,
      });
      expect(result.newStatus).toBeNull();
      expect(result.reason).toContain('Discovery failure');
    });
  });

  describe('Check 1b: Discovery mismatch', () => {
    it('should mark as degraded when discovered < expected', () => {
      const result = evaluateRunHealth({
        scraper: makeScraper({ expected_discovery_count: 100 }),
        urlsDiscovered: 85,
        urlsNew: 10,
        listingsSubmitted: 10,
      });
      expect(result.newStatus).toBe('degraded');
      expect(result.reason).toContain('Discovery mismatch');
      expect(result.reason).toContain('85');
      expect(result.reason).toContain('100');
    });

    it('should mark as degraded when discovered > expected', () => {
      const result = evaluateRunHealth({
        scraper: makeScraper({ expected_discovery_count: 100 }),
        urlsDiscovered: 105,
        urlsNew: 10,
        listingsSubmitted: 10,
      });
      expect(result.newStatus).toBe('degraded');
      expect(result.reason).toContain('Discovery mismatch');
    });

    it('should pass when discovered == expected', () => {
      const result = evaluateRunHealth({
        scraper: makeScraper({ expected_discovery_count: 100 }),
        urlsDiscovered: 100,
        urlsNew: 23,
        listingsSubmitted: 23,
      });
      expect(result.newStatus).toBeNull();
    });
  });

  describe('Check 2: Pipeline leakage', () => {
    it('should mark as degraded when submitted < urlsNew', () => {
      const result = evaluateRunHealth({
        scraper: makeScraper({ expected_discovery_count: 94 }),
        urlsDiscovered: 94,
        urlsNew: 23,
        listingsSubmitted: 15,
      });
      expect(result.newStatus).toBe('degraded');
      expect(result.reason).toContain('Pipeline leakage');
      expect(result.reason).toContain('15');
      expect(result.reason).toContain('23');
    });

    it('should pass when submitted == urlsNew', () => {
      const result = evaluateRunHealth({
        scraper: makeScraper({ expected_discovery_count: 94 }),
        urlsDiscovered: 94,
        urlsNew: 23,
        listingsSubmitted: 23,
      });
      expect(result.newStatus).toBeNull();
    });
  });

  describe('Priority: broken wins over degraded', () => {
    it('check 1a (broken) takes priority even when check 1b would also fire', () => {
      // discovered=0 triggers both 1a (broken) and 1b (mismatch/degraded)
      // but 1a is evaluated first → broken
      const result = evaluateRunHealth({
        scraper: makeScraper({ expected_discovery_count: 100 }),
        urlsDiscovered: 0,
        urlsNew: 0,
        listingsSubmitted: 0,
      });
      expect(result.newStatus).toBe('broken');
      expect(result.reason).toContain('Discovery failure');
    });
  });

  describe('Recovery', () => {
    it('should recover degraded to active when all run checks pass', () => {
      const result = evaluateRunHealth({
        scraper: makeScraper({ status: 'degraded', expected_discovery_count: 100 }),
        urlsDiscovered: 100,
        urlsNew: 23,
        listingsSubmitted: 23,
      });
      expect(result.newStatus).toBe('active');
      expect(result.reason).toContain('All health checks passed');
    });

    it('should NOT auto-recover from broken', () => {
      const result = evaluateRunHealth({
        scraper: makeScraper({ status: 'broken', expected_discovery_count: 100 }),
        urlsDiscovered: 100,
        urlsNew: 23,
        listingsSubmitted: 23,
      });
      expect(result.newStatus).toBeNull();
    });
  });

  describe('Paused/testing scrapers', () => {
    it('should skip paused scrapers', () => {
      const result = evaluateRunHealth({
        scraper: makeScraper({ status: 'paused' }),
        urlsDiscovered: 0,
        urlsNew: 0,
        listingsSubmitted: 0,
      });
      expect(result.newStatus).toBeNull();
    });

    it('should skip testing scrapers', () => {
      const result = evaluateRunHealth({
        scraper: makeScraper({ status: 'testing' }),
        urlsDiscovered: 0,
        urlsNew: 0,
        listingsSubmitted: 0,
      });
      expect(result.newStatus).toBeNull();
    });
  });
});
