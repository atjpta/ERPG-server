CREATE TYPE "public"."skill_owner_type" AS ENUM('MONSTER', 'CLASS');--> statement-breakpoint
CREATE TYPE "public"."skill_type" AS ENUM('MELEE', 'PROJECTILE', 'GROUND', 'AOE', 'BUFF', 'DEBUFF', 'HEAL', 'SUMMON', 'DASH', 'PASSIVE');--> statement-breakpoint
CREATE TYPE "public"."target_type" AS ENUM('NONE', 'SELF', 'TARGET', 'POSITION', 'DIRECTION', 'ALLY', 'ENEMY');--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"skill_type" "skill_type" NOT NULL,
	"target_type" "target_type" DEFAULT 'NONE' NOT NULL,
	"cast_range" real DEFAULT 0 NOT NULL,
	"cast_time_ms" integer DEFAULT 0 NOT NULL,
	"cooldown_ms" integer DEFAULT 0 NOT NULL,
	"mana_cost" integer DEFAULT 0 NOT NULL,
	"stamina_cost" integer DEFAULT 0 NOT NULL,
	"max_level" integer DEFAULT 10 NOT NULL,
	"level_config" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skill_hit_events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "skills_code_unique" UNIQUE("code")
);
