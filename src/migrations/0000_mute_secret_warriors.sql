CREATE TYPE "public"."account_deletion_source" AS ENUM('app', 'web');--> statement-breakpoint
CREATE TYPE "public"."account_deletion_status" AS ENUM('pending', 'completed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."admin_role" AS ENUM('super_admin', 'admin', 'game_master');--> statement-breakpoint
CREATE TYPE "public"."admin_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."game_server_status" AS ENUM('online', 'maintenance', 'full', 'offline', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."player_status" AS ENUM('active', 'banned', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."oauth_provider" AS ENUM('google', 'play_games', 'guest');--> statement-breakpoint
CREATE TYPE "public"."client_platform" AS ENUM('android', 'pc');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive', 'banned', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."chat_channel" AS ENUM('world', 'general', 'party', 'whisper');--> statement-breakpoint
CREATE TYPE "public"."friendship_status" AS ENUM('pending', 'accepted');--> statement-breakpoint
CREATE TYPE "public"."item_rarity" AS ENUM('common', 'good', 'rare', 'epic', 'legendary');--> statement-breakpoint
CREATE TYPE "public"."item_type" AS ENUM('equipment', 'consumable', 'material');--> statement-breakpoint
CREATE TYPE "public"."mail_kind" AS ENUM('player', 'system');--> statement-breakpoint
CREATE TYPE "public"."map_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."map_type" AS ENUM('town', 'field', 'dungeon');--> statement-breakpoint
CREATE TYPE "public"."master_data_key" AS ENUM('auth_session_config', 'player_config', 'level_config', 'equipment_stat_config', 'equipment_set_config', 'equipment_enhance_config', 'equipment_refine_config', 'equipment_disassemble_config', 'equipment_drop_config', 'monster_scale_config', 'monster_level_config', 'monster_spawn_config', 'daily_quest_config', 'party_config', 'player_target_config', 'monster_ai_config', 'npc_config', 'chat_config', 'friend_config', 'mail_config');--> statement-breakpoint
CREATE TYPE "public"."biome" AS ENUM('starter', 'slime', 'werewolf', 'werebear');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('up', 'down', 'left', 'right');--> statement-breakpoint
CREATE TYPE "public"."quest_category" AS ENUM('hero', 'side', 'daily');--> statement-breakpoint
CREATE TYPE "public"."quest_repeat" AS ENUM('none', 'daily', 'infinite');--> statement-breakpoint
CREATE TYPE "public"."skill_owner_type" AS ENUM('MONSTER', 'CLASS');--> statement-breakpoint
CREATE TYPE "public"."skill_type" AS ENUM('MELEE', 'PROJECTILE', 'GROUND', 'AOE', 'BUFF', 'DEBUFF', 'HEAL', 'SUMMON', 'DASH', 'PASSIVE');--> statement-breakpoint
CREATE TYPE "public"."target_type" AS ENUM('NONE', 'SELF', 'TARGET', 'POSITION', 'DIRECTION', 'ALLY', 'ENEMY');--> statement-breakpoint
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
	"enabled" boolean DEFAULT true NOT NULL,
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
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"tier" integer DEFAULT 1 NOT NULL,
	"next_class_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_class_required_level" integer,
	"base_attributes" jsonb NOT NULL,
	"base_stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stat_bonuses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "classes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "dialogues" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "dialogues_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requester_id" uuid NOT NULL,
	"addressee_id" uuid NOT NULL,
	"status" "friendship_status" DEFAULT 'pending' NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "player_blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
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
CREATE TABLE "mail_broadcast_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"broadcast_id" uuid NOT NULL,
	"player_id" uuid NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "game_maps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
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
	"min_level" integer DEFAULT 1 NOT NULL,
	"layout_ready" boolean DEFAULT true NOT NULL,
	"missing_markers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dungeon" jsonb,
	"monster_spawns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"spawn_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"colliders" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_hash" text DEFAULT '' NOT NULL,
	"npcs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"interactables" jsonb DEFAULT '[]'::jsonb NOT NULL,
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
CREATE TABLE "monsters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"attack_cooldown_ms" integer NOT NULL,
	"hitbox" jsonb DEFAULT '{"width":0.47,"height":0.56,"offsetX":0,"offsetY":-0.3}'::jsonb NOT NULL,
	"collider" jsonb DEFAULT '{"width":0.31,"height":0.12,"offsetX":0,"offsetY":-0.08}'::jsonb NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"biome" "biome" DEFAULT 'slime' NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"drops" jsonb DEFAULT '{"currency":[],"items":[],"exp":0}'::jsonb NOT NULL,
	CONSTRAINT "monsters_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "npcs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"collider_width" real DEFAULT 0.8 NOT NULL,
	"collider_height" real DEFAULT 0.4 NOT NULL,
	"interact_radius" real DEFAULT 2 NOT NULL,
	"default_dialogue_code" text,
	"dialogue_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"functions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "npcs_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "player_states" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"class_id" uuid NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"exp" bigint DEFAULT 0 NOT NULL,
	"map_code" text NOT NULL,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"direction" "direction" DEFAULT 'down' NOT NULL,
	"hp" integer NOT NULL,
	"mp" integer NOT NULL,
	"hitbox" jsonb DEFAULT '{"width":0.44,"height":0.63,"offsetX":0,"offsetY":-0.34}'::jsonb NOT NULL,
	"collider" jsonb DEFAULT '{"width":0.34,"height":0.12,"offsetX":0,"offsetY":-0.08}'::jsonb NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"wallet" jsonb DEFAULT '{"gold":{"balance":0,"totalEarned":0,"totalSpent":0},"gem":{"balance":0,"totalEarned":0,"totalSpent":0}}'::jsonb NOT NULL,
	"equipment_inventory" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"consumable_inventory" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"material_inventory" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"equipments" jsonb DEFAULT '{"main_hand":null,"off_hand":null,"head":null,"armor":null,"shoulder":null,"gloves":null,"boots":null,"belt":null,"necklace":null,"earring_1":null,"earring_2":null,"ring_1":null,"ring_2":null,"back":null}'::jsonb NOT NULL,
	"attribute_points" integer DEFAULT 0 NOT NULL,
	"skill_points" integer DEFAULT 0 NOT NULL,
	"allocated_attributes" jsonb DEFAULT '{"strength":0,"dexterity":0,"intelligence":0,"vitality":0,"luck":0}'::jsonb NOT NULL,
	"flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"quests" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"daily_quests" jsonb,
	"last_town_map_code" text,
	"dungeon_session" jsonb,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"category" "quest_category" DEFAULT 'side' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"chapter" integer DEFAULT 0 NOT NULL,
	"unlock_features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_level" integer DEFAULT 1 NOT NULL,
	"prerequisite_quest_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"class_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"giver_npc_code" text NOT NULL,
	"turn_in_npc_code" text NOT NULL,
	"repeat" "quest_repeat" DEFAULT 'none' NOT NULL,
	"objectives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rewards" jsonb NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "quests_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"skill_type" "skill_type" NOT NULL,
	"target_type" "target_type" DEFAULT 'NONE' NOT NULL,
	"cast_range" real DEFAULT 0 NOT NULL,
	"cast_time_ms" integer DEFAULT 0 NOT NULL,
	"animation_ms" integer DEFAULT 0 NOT NULL,
	"cooldown_ms" integer DEFAULT 0 NOT NULL,
	"mana_cost" integer DEFAULT 0 NOT NULL,
	"stamina_cost" integer DEFAULT 0 NOT NULL,
	"max_level" integer DEFAULT 10 NOT NULL,
	"basic_attack" boolean DEFAULT false NOT NULL,
	"level_config" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skill_hit_events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"charge_config" jsonb,
	CONSTRAINT "skills_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_processed_by_admin_id_admins_id_fk" FOREIGN KEY ("processed_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_server_id_game_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."game_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_oauth_accounts" ADD CONSTRAINT "user_oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_server_id_game_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."game_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_player_id_players_id_fk" FOREIGN KEY ("sender_player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_target_player_id_players_id_fk" FOREIGN KEY ("target_player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requester_id_players_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_addressee_id_players_id_fk" FOREIGN KEY ("addressee_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_blocks" ADD CONSTRAINT "player_blocks_blocker_id_players_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_blocks" ADD CONSTRAINT "player_blocks_blocked_id_players_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_broadcast_receipts" ADD CONSTRAINT "mail_broadcast_receipts_broadcast_id_mail_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."mail_broadcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_broadcast_receipts" ADD CONSTRAINT "mail_broadcast_receipts_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_broadcasts" ADD CONSTRAINT "mail_broadcasts_server_id_game_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."game_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mails" ADD CONSTRAINT "mails_server_id_game_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."game_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mails" ADD CONSTRAINT "mails_recipient_player_id_players_id_fk" FOREIGN KEY ("recipient_player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mails" ADD CONSTRAINT "mails_sender_player_id_players_id_fk" FOREIGN KEY ("sender_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mails" ADD CONSTRAINT "mails_broadcast_id_mail_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."mail_broadcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_states" ADD CONSTRAINT "player_states_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_states" ADD CONSTRAINT "player_states_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_states" ADD CONSTRAINT "player_states_map_code_game_maps_code_fk" FOREIGN KEY ("map_code") REFERENCES "public"."game_maps"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_deletion_requests_status_idx" ON "account_deletion_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "players_server_id_name_lower_unique" ON "players" USING btree ("server_id",lower("name")) WHERE "players"."status" in ('active', 'banned');--> statement-breakpoint
CREATE INDEX "players_user_id_idx" ON "players" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_messages_channel_idx" ON "chat_messages" USING btree ("server_id","channel","scope_key","id");--> statement-breakpoint
CREATE INDEX "chat_messages_target_idx" ON "chat_messages" USING btree ("target_player_id","id");--> statement-breakpoint
CREATE INDEX "chat_messages_sender_idx" ON "chat_messages" USING btree ("sender_player_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "friendships_pair_unique" ON "friendships" USING btree (least("requester_id", "addressee_id"),greatest("requester_id", "addressee_id"));--> statement-breakpoint
CREATE INDEX "friendships_requester_idx" ON "friendships" USING btree ("requester_id","status");--> statement-breakpoint
CREATE INDEX "friendships_addressee_idx" ON "friendships" USING btree ("addressee_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "player_blocks_pair_unique" ON "player_blocks" USING btree ("blocker_id","blocked_id");--> statement-breakpoint
CREATE INDEX "player_blocks_blocked_idx" ON "player_blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_broadcast_receipts_unique" ON "mail_broadcast_receipts" USING btree ("broadcast_id","player_id");--> statement-breakpoint
CREATE INDEX "mail_broadcast_receipts_player_idx" ON "mail_broadcast_receipts" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "mails_recipient_idx" ON "mails" USING btree ("recipient_player_id","id");--> statement-breakpoint
CREATE INDEX "mails_sender_idx" ON "mails" USING btree ("sender_player_id","claimed_at");--> statement-breakpoint
CREATE INDEX "mails_expires_idx" ON "mails" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mails_broadcast_recipient_unique" ON "mails" USING btree ("broadcast_id","recipient_player_id");