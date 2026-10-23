CREATE TYPE "public"."mail_kind" AS ENUM('player', 'system');--> statement-breakpoint
ALTER TYPE "public"."master_data_key" ADD VALUE 'mail_config';--> statement-breakpoint
CREATE TABLE "mail_broadcasts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_id" uuid NOT NULL,
	"template_code" text,
	"params" jsonb,
	"content" jsonb,
	"reward" jsonb,
	"skip_new_players" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"content" jsonb NOT NULL,
	"note" text,
	CONSTRAINT "mail_templates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "mails" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_id" uuid NOT NULL,
	"recipient_player_id" uuid NOT NULL,
	"kind" "mail_kind" NOT NULL,
	"sender_player_id" uuid,
	"sender_name" text,
	"template_code" text,
	"params" jsonb,
	"content" jsonb,
	"subject" text,
	"body" text,
	"reward" jsonb,
	"cod" jsonb,
	"broadcast_id" uuid,
	"read_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_broadcasts" ADD CONSTRAINT "mail_broadcasts_server_id_game_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."game_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mails" ADD CONSTRAINT "mails_server_id_game_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."game_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mails" ADD CONSTRAINT "mails_recipient_player_id_players_id_fk" FOREIGN KEY ("recipient_player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mails" ADD CONSTRAINT "mails_sender_player_id_players_id_fk" FOREIGN KEY ("sender_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mails" ADD CONSTRAINT "mails_broadcast_id_mail_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."mail_broadcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mails_recipient_idx" ON "mails" USING btree ("recipient_player_id","id");--> statement-breakpoint
CREATE INDEX "mails_sender_idx" ON "mails" USING btree ("sender_player_id","claimed_at");--> statement-breakpoint
CREATE INDEX "mails_expires_idx" ON "mails" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mails_broadcast_recipient_unique" ON "mails" USING btree ("broadcast_id","recipient_player_id");