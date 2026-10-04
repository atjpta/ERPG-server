CREATE TYPE "public"."item_rarity" AS ENUM('common', 'rare', 'epic', 'legendary');--> statement-breakpoint
CREATE TYPE "public"."item_type" AS ENUM('equipment', 'consumable', 'material');--> statement-breakpoint
CREATE TYPE "public"."monster_type" AS ENUM('normal', 'elite', 'boss');--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"name" text NOT NULL,
	"tier" integer DEFAULT 1 NOT NULL,
	"next_class_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_class_required_level" integer,
	"base_attributes" jsonb NOT NULL,
	"stat_bonuses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "classes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"name" text NOT NULL,
	"type" "item_type" NOT NULL,
	"rarity" "item_rarity" DEFAULT 'common' NOT NULL,
	"required_level" integer DEFAULT 1 NOT NULL,
	"stackable" boolean DEFAULT false NOT NULL,
	"max_stack" integer DEFAULT 1 NOT NULL,
	"sell_price" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "items_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "levels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"level" integer NOT NULL,
	"exp" bigint NOT NULL,
	CONSTRAINT "levels_level_unique" UNIQUE("level")
);
--> statement-breakpoint
ALTER TABLE "monsters" ADD COLUMN "type" "monster_type" DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "monsters" ADD COLUMN "rarity" "item_rarity" DEFAULT 'common' NOT NULL;--> statement-breakpoint
ALTER TABLE "monsters" ADD COLUMN "stats" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "monsters" ADD COLUMN "drops" jsonb DEFAULT '{"currency":[],"items":[],"exp":0}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "player_states" ADD COLUMN "class_id" uuid;--> statement-breakpoint
ALTER TABLE "player_states" ADD COLUMN "wallet" jsonb DEFAULT '{"gold":{"balance":0,"totalEarned":0,"totalSpent":0},"gem":{"balance":0,"totalEarned":0,"totalSpent":0}}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "player_states" ADD COLUMN "inventory" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "player_states" ADD COLUMN "equipments" jsonb DEFAULT '{"main_hand":null,"off_hand":null,"head":null,"armor":null,"shoulder":null,"gloves":null,"boots":null,"belt":null,"necklace":null,"earring_1":null,"earring_2":null,"ring_1":null,"ring_2":null,"back":null}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "player_states" ADD COLUMN "attribute_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_states" ADD COLUMN "skill_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_states" ADD COLUMN "allocated_attributes" jsonb DEFAULT '{"strength":0,"dexterity":0,"intelligence":0,"vitality":0,"luck":0}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "player_states" ADD CONSTRAINT "player_states_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;