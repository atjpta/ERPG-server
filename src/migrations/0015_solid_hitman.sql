CREATE TYPE "public"."biome" AS ENUM('starter', 'orc', 'skeleton', 'shapeshifter');--> statement-breakpoint
ALTER TABLE "game_maps" ADD COLUMN "monster_spawns" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "monsters" ADD COLUMN "biome" "biome" DEFAULT 'orc' NOT NULL;