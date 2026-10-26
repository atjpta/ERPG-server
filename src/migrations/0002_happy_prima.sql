CREATE TYPE "public"."npc_kind" AS ENUM('npc', 'object');--> statement-breakpoint
ALTER TABLE "npcs" ADD COLUMN "kind" "npc_kind" DEFAULT 'npc' NOT NULL;--> statement-breakpoint
ALTER TABLE "npcs" ADD COLUMN "auto_open" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "game_maps" DROP COLUMN "interactables";