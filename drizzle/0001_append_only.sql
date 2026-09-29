-- Nothing is hard-deleted: rejected/closed items are archived, rules are disabled.
CREATE TRIGGER records_no_delete BEFORE DELETE ON records
BEGIN SELECT RAISE(ABORT, 'records are never deleted; archive instead'); END;
--> statement-breakpoint
CREATE TRIGGER target_accounts_no_delete BEFORE DELETE ON target_accounts
BEGIN SELECT RAISE(ABORT, 'target accounts are never deleted; archive instead'); END;
--> statement-breakpoint
CREATE TRIGGER rules_no_delete BEFORE DELETE ON rules
BEGIN SELECT RAISE(ABORT, 'rules are never deleted; disable instead'); END;
--> statement-breakpoint
-- History is append-only.
CREATE TRIGGER history_no_update BEFORE UPDATE ON history
BEGIN SELECT RAISE(ABORT, 'history is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER history_no_delete BEFORE DELETE ON history
BEGIN SELECT RAISE(ABORT, 'history is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER import_rows_no_update BEFORE UPDATE ON import_rows
BEGIN SELECT RAISE(ABORT, 'import rows are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER import_rows_no_delete BEFORE DELETE ON import_rows
BEGIN SELECT RAISE(ABORT, 'import rows are immutable'); END;
