CREATE TABLE IF NOT EXISTS "media_asset_source" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "media_asset_source_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"media_asset_id" bigint NOT NULL,
	"source_url" text NOT NULL,
	"license_url" text,
	"retrieved_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_asset_source_media_asset_id_unique" UNIQUE("media_asset_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_asset_source" ADD CONSTRAINT "media_asset_source_media_asset_id_media_asset_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_asset"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
