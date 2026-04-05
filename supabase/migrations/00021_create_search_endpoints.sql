-- Read-only SQL search system: two Postgres functions for AI agent query access.
-- execute_readonly_query: accepts arbitrary SQL, enforces read-only + timeout + row limit.
-- get_table_schema: returns column metadata for allowed tables.

-- 1. Function: execute_readonly_query
-- Accepts a SQL string, validates it, and executes in a read-only context.
-- Safety: keyword blocklist + SET LOCAL transaction_read_only + 5s timeout + 500-row limit.
CREATE OR REPLACE FUNCTION execute_readonly_query(query_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '5s'
AS $$
DECLARE
  result JSONB;
  normalized TEXT;
BEGIN
  -- Normalize: collapse whitespace, trim, uppercase for keyword check
  normalized := upper(btrim(regexp_replace(query_text, '\s+', ' ', 'g')));

  -- Must start with SELECT or WITH
  IF normalized !~ '^(SELECT|WITH)\b' THEN
    RAISE EXCEPTION 'Only SELECT and WITH...SELECT statements are allowed';
  END IF;

  -- Block DML/DDL keywords
  IF normalized ~ '\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY)\b' THEN
    RAISE EXCEPTION 'Statement contains a prohibited keyword';
  END IF;

  -- Engine-level read-only enforcement (belt-and-suspenders)
  SET LOCAL transaction_read_only = on;

  -- Inject LIMIT if not present
  IF normalized NOT LIKE '%LIMIT %' THEN
    query_text := query_text || ' LIMIT 500';
  END IF;

  -- Execute and return as JSON array
  EXECUTE 'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (' || query_text || ') t'
  INTO result;

  RETURN result;
END;
$$;

-- 2. Function: get_table_schema
-- Returns column metadata for allowed public tables (auto-updates with new columns).
CREATE OR REPLACE FUNCTION get_table_schema()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_agg(jsonb_build_object(
    'table_name', t.table_name,
    'columns', t.columns
  ))
  FROM (
    SELECT
      c.table_name,
      jsonb_agg(
        jsonb_build_object(
          'column_name', c.column_name,
          'data_type', c.data_type,
          'udt_name', c.udt_name,
          'is_nullable', c.is_nullable
        ) ORDER BY c.ordinal_position
      ) AS columns
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name IN (
        'listings', 'scraper_registry', 'run_receipts',
        'rejections', 'admin_regions', 'currencies',
        'admin_level_config'
      )
    GROUP BY c.table_name
  ) t;
$$;
