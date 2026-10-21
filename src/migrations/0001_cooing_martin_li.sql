CREATE TYPE "public"."chat_channel" AS ENUM('world', 'general', 'party', 'whisper');--> statement-breakpoint
ALTER TYPE "public"."master_data_key" ADD VALUE 'chat_config';--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_id" uuid NOT NULL,
	"channel" "chat_channel" NOT NULL,
	"sender_player_id" uuid NOT NULL,
	"target_player_id" uuid,
	"scope_key" text,
	"content" text NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_server_id_game_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."game_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_player_id_players_id_fk" FOREIGN KEY ("sender_player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_target_player_id_players_id_fk" FOREIGN KEY ("target_player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_channel_idx" ON "chat_messages" USING btree ("server_id","channel","scope_key","id");--> statement-breakpoint
CREATE INDEX "chat_messages_target_idx" ON "chat_messages" USING btree ("target_player_id","id");--> statement-breakpoint
CREATE INDEX "chat_messages_sender_idx" ON "chat_messages" USING btree ("sender_player_id","id");