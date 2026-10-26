ALTER TYPE "public"."master_data_key" ADD VALUE 'gift_code_config';--> statement-breakpoint
CREATE TABLE "gift_code_redemptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"gift_code_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"mail_id" uuid
);
--> statement-breakpoint
CREATE TABLE "gift_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"server_id" uuid,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"reward" jsonb NOT NULL,
	"template_code" text DEFAULT 'gift_code' NOT NULL,
	"params" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "gift_code_redemptions" ADD CONSTRAINT "gift_code_redemptions_gift_code_id_gift_codes_id_fk" FOREIGN KEY ("gift_code_id") REFERENCES "public"."gift_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_code_redemptions" ADD CONSTRAINT "gift_code_redemptions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_codes" ADD CONSTRAINT "gift_codes_server_id_game_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."game_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gift_code_redemptions_unique" ON "gift_code_redemptions" USING btree ("gift_code_id","player_id");--> statement-breakpoint
CREATE INDEX "gift_code_redemptions_player_idx" ON "gift_code_redemptions" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gift_codes_code_unique" ON "gift_codes" USING btree ("code");