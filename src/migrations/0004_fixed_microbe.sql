ALTER TABLE "monsters" ADD COLUMN "hitbox" jsonb DEFAULT '{"width":1,"height":1}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "monsters" ADD COLUMN "collider" jsonb DEFAULT '{"width":0.8,"height":0.8}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "player_states" ADD COLUMN "hitbox" jsonb DEFAULT '{"width":0.8,"height":0.8}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "player_states" ADD COLUMN "collider" jsonb DEFAULT '{"width":0.6,"height":0.6}'::jsonb NOT NULL;