-- The activity log is append-only: entries can be added, never changed or removed.
CREATE TRIGGER `history_no_update` BEFORE UPDATE ON `history` BEGIN SELECT RAISE(ABORT, 'history is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `history_no_delete` BEFORE DELETE ON `history` BEGIN SELECT RAISE(ABORT, 'history is append-only'); END;
