-- Nothing is hard-deleted: rejected/closed items are archived, rules are disabled.
CREATE OR REPLACE FUNCTION crm_block_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% are never deleted; archive or disable instead', TG_TABLE_NAME;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION crm_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER records_no_delete BEFORE DELETE ON records FOR EACH ROW EXECUTE FUNCTION crm_block_delete();
--> statement-breakpoint
CREATE TRIGGER target_accounts_no_delete BEFORE DELETE ON target_accounts FOR EACH ROW EXECUTE FUNCTION crm_block_delete();
--> statement-breakpoint
CREATE TRIGGER rules_no_delete BEFORE DELETE ON rules FOR EACH ROW EXECUTE FUNCTION crm_block_delete();
--> statement-breakpoint
CREATE TRIGGER history_no_update BEFORE UPDATE OR DELETE ON history FOR EACH ROW EXECUTE FUNCTION crm_append_only();
--> statement-breakpoint
CREATE TRIGGER history_no_truncate BEFORE TRUNCATE ON history FOR EACH STATEMENT EXECUTE FUNCTION crm_append_only();
--> statement-breakpoint
CREATE TRIGGER import_rows_immutable BEFORE UPDATE OR DELETE ON import_rows FOR EACH ROW EXECUTE FUNCTION crm_append_only();
--> statement-breakpoint
CREATE TRIGGER records_no_truncate BEFORE TRUNCATE ON records FOR EACH STATEMENT EXECUTE FUNCTION crm_block_delete();
