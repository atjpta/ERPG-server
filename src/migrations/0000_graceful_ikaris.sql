CREATE TYPE "public"."account_deletion_source" AS ENUM('app', 'web');--> statement-breakpoint
CREATE TYPE "public"."account_deletion_status" AS ENUM('pending', 'completed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."admin_role" AS ENUM('super_admin', 'admin', 'game_master');--> statement-breakpoint
CREATE TYPE "public"."admin_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."game_server_status" AS ENUM('online', 'maintenance', 'full', 'offline', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('up', 'down', 'left', 'right');--> statement-breakpoint
CREATE TYPE "public"."player_status" AS ENUM('active', 'banned');--> statement-breakpoint
CREATE TYPE "public"."oauth_provider" AS ENUM('google', 'play_games', 'guest');--> statement-breakpoint
CREATE TYPE "public"."client_platform" AS ENUM('android', 'pc');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive', 'banned', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."map_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."map_type" AS ENUM('town', 'field', 'dungeon');--> statement-breakpoint
CREATE TYPE "public"."master_data_key" AS ENUM('auth_session_config', 'player_config');--> statement-breakpoint
CREATE TABLE "account_deletion_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"contact_email" text,
	"player_name" text,
	"reason" text,
	"source" "account_deletion_source" NOT NULL,
	"status" "account_deletion_status" DEFAULT 'pending' NOT NULL,
	"processed_at" timestamp with time zone,
	"processed_by_admin_id" uuid,
	"admin_note" text
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"role" "admin_role" DEFAULT 'admin' NOT NULL,
	"status" "admin_status" DEFAULT 'active' NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "game_servers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" "game_server_status" DEFAULT 'online' NOT NULL,
	"max_players" integer DEFAULT 5000 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "game_servers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"server_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "player_status" DEFAULT 'active' NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"exp" bigint DEFAULT 0 NOT NULL,
	"hp" integer NOT NULL,
	"mp" integer NOT NULL,
	"map_code" text NOT NULL,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"direction" "direction" DEFAULT 'down' NOT NULL,
	"ban_reason" text,
	"last_played_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_oauth_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "oauth_provider" NOT NULL,
	"provider_user_id" text NOT NULL,
	"email" text,
	CONSTRAINT "user_oauth_accounts_provider_provider_user_id_unique" UNIQUE("provider","provider_user_id")
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" "client_platform" NOT NULL,
	"client_version" text NOT NULL,
	"device" text DEFAULT '' NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"password" text,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"ban_reason" text,
	"ban_expires_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "game_maps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "map_type" DEFAULT 'field' NOT NULL,
	"status" "map_status" DEFAULT 'active' NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"tile_size" integer DEFAULT 16 NOT NULL,
	"spawn_x" real NOT NULL,
	"spawn_y" real NOT NULL,
	"max_players_per_channel" integer DEFAULT 100 NOT NULL,
	"pvp_enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "game_maps_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "master_data" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"key" "master_data_key" NOT NULL,
	"value" jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "master_data_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_processed_by_admin_id_admins_id_fk" FOREIGN KEY ("processed_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_server_id_game_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."game_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_oauth_accounts" ADD CONSTRAINT "user_oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_deletion_requests_status_idx" ON "account_deletion_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "players_server_id_name_lower_unique" ON "players" USING btree ("server_id",lower("name"));--> statement-breakpoint
CREATE INDEX "players_user_id_idx" ON "players" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions" USING btree ("user_id");