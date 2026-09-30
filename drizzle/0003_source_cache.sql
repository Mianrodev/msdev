CREATE TABLE "source_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"fetched_at" text NOT NULL,
	"value" jsonb NOT NULL
);
