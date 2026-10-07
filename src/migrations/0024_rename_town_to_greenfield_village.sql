-- Map `town_01` becomes `greenfield_village`. player_states.map_code references game_maps.code, so the row is
-- copied under the new code first, the players are moved, then the old row is removed. No-op on a fresh database.
INSERT INTO "game_maps" ("id", "created_at", "updated_at", "code", "enabled", "name", "type", "status", "width", "height", "tile_size", "spawn_x", "spawn_y", "max_players_per_channel", "pvp_enabled", "monster_spawns", "spawn_points", "colliders", "content_hash", "npcs", "interactables")
SELECT gen_random_uuid(), "created_at", now(), 'greenfield_village', "enabled", "name", "type", "status", "width", "height", "tile_size", "spawn_x", "spawn_y", "max_players_per_channel", "pvp_enabled", "monster_spawns", "spawn_points", "colliders", "content_hash", "npcs", "interactables"
FROM "game_maps" WHERE "code" = 'town_01'
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
UPDATE "player_states" SET "map_code" = 'greenfield_village' WHERE "map_code" = 'town_01';--> statement-breakpoint
DELETE FROM "game_maps" WHERE "code" = 'town_01';
