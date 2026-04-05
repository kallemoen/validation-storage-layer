-- Fix: PostgreSQL uses POSIX regex, not PCRE. \b (word boundary) is not
-- supported — must use \y instead. This caused the SELECT/WITH check and
-- DML keyword blocklist to never match, rejecting all queries.

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

  -- Must start with SELECT or WITH (\y = word boundary in POSIX regex)
  IF normalized !~ '^(SELECT|WITH)\y' THEN
    RAISE EXCEPTION 'Only SELECT and WITH...SELECT statements are allowed';
  END IF;

  -- Block DML/DDL keywords
  IF normalized ~ '\y(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY)\y' THEN
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
