ALTER TABLE "skills" ADD COLUMN "basic_attack" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Trước đây combo đánh thường = các skill MELEE; giữ nguyên tới khi `yarn seed` ghi lại từng skill.
UPDATE "skills" SET "basic_attack" = true WHERE "skill_type" = 'MELEE';
