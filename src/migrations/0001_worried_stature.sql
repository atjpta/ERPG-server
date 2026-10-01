CREATE TABLE "player_states" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"exp" bigint DEFAULT 0 NOT NULL,
	"map_code" text NOT NULL,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"direction" "direction" DEFAULT 'down' NOT NULL,
	"hp" integer NOT NULL,
	"mp" integer NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "player_states" (
	"player_id", "level", "exp", "map_code", "x", "y", "direction", "hp", "mp"
)
SELECT p."id", p."level", p."exp",
	COALESCE(m."code", fallback."code"),
	CASE WHEN m."code" IS NULL THEN fallback."spawn_x" ELSE p."x" END,
	CASE WHEN m."code" IS NULL THEN fallback."spawn_y" ELSE p."y" END,
	CASE WHEN m."code" IS NULL THEN 'down'::"direction" ELSE p."direction" END,
	p."hp", p."mp"
FROM "players" p
LEFT JOIN "game_maps" m ON m."code" = p."map_code"
LEFT JOIN LATERAL (
	SELECT gm."code", gm."spawn_x", gm."spawn_y"
	FROM "game_maps" gm
	WHERE gm."status" = 'active'
	ORDER BY (
		gm."code" = (
			SELECT md."value"->>'startMapCode'
			FROM "master_data" md
			WHERE md."key" = 'player_config'
		)
	) DESC, gm."created_at" ASC
	LIMIT 1
) fallback ON m."code" IS NULL;
--> statement-breakpoint
ALTER TABLE "player_states" ADD CONSTRAINT "player_states_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_states" ADD CONSTRAINT "player_states_map_code_game_maps_code_fk" FOREIGN KEY ("map_code") REFERENCES "public"."game_maps"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" DROP COLUMN "level";--> statement-breakpoint
ALTER TABLE "players" DROP COLUMN "exp";--> statement-breakpoint
ALTER TABLE "players" DROP COLUMN "hp";--> statement-breakpoint
ALTER TABLE "players" DROP COLUMN "mp";--> statement-breakpoint
ALTER TABLE "players" DROP COLUMN "map_code";--> statement-breakpoint
ALTER TABLE "players" DROP COLUMN "x";--> statement-breakpoint
ALTER TABLE "players" DROP COLUMN "y";--> statement-breakpoint
ALTER TABLE "players" DROP COLUMN "direction";
