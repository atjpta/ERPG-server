ALTER TYPE "public"."master_data_key" ADD VALUE 'crafting_config';--> statement-breakpoint
CREATE TABLE "crafting_recipe_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "crafting_recipe_groups_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "crafting_recipes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"group_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"required_level" integer DEFAULT 1 NOT NULL,
	"result_item_code" text NOT NULL,
	"result_quantity" integer DEFAULT 1 NOT NULL,
	"result_level" integer,
	"result_rarity" text,
	"result_metadata" jsonb,
	"ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cost" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "crafting_recipes_code_unique" UNIQUE("code")
);
