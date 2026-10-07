CREATE TYPE "public"."quest_repeat" AS ENUM('none', 'daily', 'infinite');--> statement-breakpoint
CREATE TABLE "dialogues" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "dialogues_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "npcs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"collider_width" real DEFAULT 0.8 NOT NULL,
	"collider_height" real DEFAULT 0.4 NOT NULL,
	"interact_radius" real DEFAULT 2 NOT NULL,
	"default_dialogue_code" text,
	"dialogue_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"functions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "npcs_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "quests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"required_level" integer DEFAULT 1 NOT NULL,
	"prerequisite_quest_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"class_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"giver_npc_code" text NOT NULL,
	"turn_in_npc_code" text NOT NULL,
	"repeat" "quest_repeat" DEFAULT 'none' NOT NULL,
	"objectives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rewards" jsonb NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "quests_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "game_maps" ADD COLUMN "npcs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "game_maps" ADD COLUMN "interactables" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "player_states" ADD COLUMN "flags" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "player_states" ADD COLUMN "quests" jsonb DEFAULT '{}'::jsonb NOT NULL;