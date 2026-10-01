CREATE TABLE "monsters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"max_hp" integer NOT NULL,
	"attack" integer NOT NULL,
	"defense" integer DEFAULT 0 NOT NULL,
	"move_speed" real NOT NULL,
	"attack_range" real NOT NULL,
	"attack_cooldown_ms" integer NOT NULL,
	CONSTRAINT "monsters_code_unique" UNIQUE("code")
);
