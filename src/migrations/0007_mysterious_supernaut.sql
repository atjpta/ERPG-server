ALTER TYPE "public"."player_status" ADD VALUE 'deleted';--> statement-breakpoint
DROP INDEX "players_server_id_name_lower_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "players_server_id_name_lower_unique" ON "players" USING btree ("server_id",lower("name")) WHERE "players"."status" in ('active', 'banned');
