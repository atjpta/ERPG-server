ALTER TYPE "public"."master_data_key" ADD VALUE 'monster_level_config';--> statement-breakpoint
ALTER TABLE "monsters" DROP COLUMN "stats_per_level";