ALTER TABLE "monsters" ALTER COLUMN "hitbox" SET DEFAULT '{"width":0.47,"height":0.56,"offsetX":0,"offsetY":-0.3}'::jsonb;--> statement-breakpoint
ALTER TABLE "monsters" ALTER COLUMN "collider" SET DEFAULT '{"width":0.31,"height":0.12,"offsetX":0,"offsetY":-0.08}'::jsonb;--> statement-breakpoint
ALTER TABLE "player_states" ALTER COLUMN "hitbox" SET DEFAULT '{"width":0.44,"height":0.63,"offsetX":0,"offsetY":-0.34}'::jsonb;--> statement-breakpoint
ALTER TABLE "player_states" ALTER COLUMN "collider" SET DEFAULT '{"width":0.34,"height":0.12,"offsetX":0,"offsetY":-0.08}'::jsonb;