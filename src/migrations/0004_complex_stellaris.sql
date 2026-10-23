CREATE TABLE "mail_broadcast_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"broadcast_id" uuid NOT NULL,
	"player_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_broadcast_receipts" ADD CONSTRAINT "mail_broadcast_receipts_broadcast_id_mail_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."mail_broadcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_broadcast_receipts" ADD CONSTRAINT "mail_broadcast_receipts_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mail_broadcast_receipts_unique" ON "mail_broadcast_receipts" USING btree ("broadcast_id","player_id");--> statement-breakpoint
CREATE INDEX "mail_broadcast_receipts_player_idx" ON "mail_broadcast_receipts" USING btree ("player_id");