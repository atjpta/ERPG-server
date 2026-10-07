ALTER TABLE "game_maps" ADD COLUMN "spawn_points" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "game_maps" ADD COLUMN "colliders" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "game_maps" ADD COLUMN "content_hash" text DEFAULT '' NOT NULL;