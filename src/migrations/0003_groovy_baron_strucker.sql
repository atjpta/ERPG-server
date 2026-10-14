ALTER TABLE "skills" ADD COLUMN "animation_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- `cast_time_ms` cũ là thời lượng anim → chuyển sang `animation_ms`; `cast_time_ms` mới = thời gian chờ trước anim.
UPDATE "skills" SET "animation_ms" = "cast_time_ms", "cast_time_ms" = 0;
