-- The activity log is append-only: entries can be added, never changed or removed.
CREATE OR REPLACE FUNCTION history_is_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'history is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER history_no_update BEFORE UPDATE OR DELETE ON history FOR EACH ROW EXECUTE FUNCTION history_is_append_only();
--> statement-breakpoint
CREATE TRIGGER history_no_truncate BEFORE TRUNCATE ON history FOR EACH STATEMENT EXECUTE FUNCTION history_is_append_only();
