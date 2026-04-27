-- Enforce non-empty title at the DB level. Mirrors the API-layer Zod rule
-- (z.string().trim().min(1)) so that direct DB writes can't bypass it.
-- Migration 00024 must run first to clear any pre-existing empty rows.
ALTER TABLE listings
  ADD CONSTRAINT listings_title_nonempty CHECK (btrim(title) <> '');
