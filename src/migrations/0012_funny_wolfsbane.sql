ALTER TYPE "public"."item_rarity" ADD VALUE 'good' BEFORE 'rare';--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "base_stats" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "player_states" DROP COLUMN "inventory";