ALTER TABLE "player_states" ADD COLUMN "equipment_inventory" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "player_states" ADD COLUMN "consumable_inventory" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "player_states" ADD COLUMN "material_inventory" jsonb DEFAULT '[]'::jsonb NOT NULL;