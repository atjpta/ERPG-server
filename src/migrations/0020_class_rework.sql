-- 3 class khởi đầu: swordsman / archer / cleric (thay guardian / swordman / archer / mage).
-- Giữ nguyên id để nhân vật, đồ trong túi và đồ đang mặc vẫn trỏ đúng:
--   swordman → swordsman, mage → cleric: đổi code ngay trên dòng cũ;
--   guardian → swordsman: chuyển nhân vật + đồ sang dòng swordsman tương ứng rồi xoá guardian.
-- Tên hiển thị, metadata, chỉ số... được seed (`yarn seed`) ghi lại theo code mới.

-- 1. Đổi code class.
UPDATE "classes" SET "code" = 'swordsman', "name" = 'Swordsman'
WHERE "code" = 'swordman' AND NOT EXISTS (SELECT 1 FROM "classes" WHERE "code" = 'swordsman');
--> statement-breakpoint
UPDATE "classes" SET "code" = 'cleric', "name" = 'Cleric'
WHERE "code" = 'mage' AND NOT EXISTS (SELECT 1 FROM "classes" WHERE "code" = 'cleric');
--> statement-breakpoint

-- 2. Đổi code skill combo chém của swordman.
UPDATE "skills" AS s SET "code" = replace(s."code", 'swordman_slash_', 'swordsman_slash_')
WHERE s."code" LIKE 'swordman\_slash\_%'
  AND NOT EXISTS (SELECT 1 FROM "skills" t WHERE t."code" = replace(s."code", 'swordman_slash_', 'swordsman_slash_'));
--> statement-breakpoint

-- 3. Đổi code trang bị theo class (template `{biome}_{class}_{type}`).
UPDATE "items" AS i
SET "code" = replace(i."code", '_swordman_', '_swordsman_'),
    "metadata" = jsonb_set(i."metadata", '{classCode}', '"swordsman"')
WHERE i."metadata"->>'classCode' = 'swordman'
  AND NOT EXISTS (SELECT 1 FROM "items" t WHERE t."code" = replace(i."code", '_swordman_', '_swordsman_'));
--> statement-breakpoint
UPDATE "items" AS i
SET "code" = replace(i."code", '_mage_', '_cleric_'),
    "metadata" = jsonb_set(i."metadata", '{classCode}', '"cleric"')
WHERE i."metadata"->>'classCode' = 'mage'
  AND NOT EXISTS (SELECT 1 FROM "items" t WHERE t."code" = replace(i."code", '_mage_', '_cleric_'));
--> statement-breakpoint

-- 4. Guardian → Swordsman: class của nhân vật.
UPDATE "player_states"
SET "class_id" = (SELECT "id" FROM "classes" WHERE "code" = 'swordsman')
WHERE "class_id" = (SELECT "id" FROM "classes" WHERE "code" = 'guardian')
  AND EXISTS (SELECT 1 FROM "classes" WHERE "code" = 'swordsman');
--> statement-breakpoint

-- 5. Guardian → Swordsman: đồ trong túi trang bị và đồ đang mặc trỏ sang món swordsman cùng biome + loại.
CREATE TEMP TABLE "guardian_item_remap" AS
SELECT g."id"::text AS "old_id", s."id"::text AS "new_id"
FROM "items" g
JOIN "items" s ON s."code" = replace(g."code", '_guardian_', '_swordsman_')
WHERE g."metadata"->>'classCode' = 'guardian';
--> statement-breakpoint
UPDATE "player_states" AS ps
SET "equipment_inventory" = (
    SELECT coalesce(
        jsonb_agg(
            CASE WHEN r."new_id" IS NULL THEN e ELSE jsonb_set(e, '{itemId}', to_jsonb(r."new_id")) END
            ORDER BY o
        ),
        '[]'::jsonb
    )
    FROM jsonb_array_elements(ps."equipment_inventory") WITH ORDINALITY AS x(e, o)
    LEFT JOIN "guardian_item_remap" r ON r."old_id" = e->>'itemId'
)
WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements(ps."equipment_inventory") e
    JOIN "guardian_item_remap" r ON r."old_id" = e->>'itemId'
);
--> statement-breakpoint
UPDATE "player_states" AS ps
SET "equipments" = (
    SELECT jsonb_object_agg(
        k,
        CASE WHEN r."new_id" IS NULL THEN v ELSE jsonb_set(v, '{itemId}', to_jsonb(r."new_id")) END
    )
    FROM jsonb_each(ps."equipments") AS x(k, v)
    LEFT JOIN "guardian_item_remap" r ON r."old_id" = v->>'itemId'
)
WHERE EXISTS (
    SELECT 1 FROM jsonb_each(ps."equipments") AS x(k, v)
    JOIN "guardian_item_remap" r ON r."old_id" = v->>'itemId'
);
--> statement-breakpoint

-- 6. Xoá guardian (chỉ phần đã chuyển hết được).
DELETE FROM "items" WHERE "id"::text IN (SELECT "old_id" FROM "guardian_item_remap");
--> statement-breakpoint
DELETE FROM "classes" c
WHERE c."code" = 'guardian'
  AND NOT EXISTS (SELECT 1 FROM "player_states" ps WHERE ps."class_id" = c."id");
--> statement-breakpoint
DROP TABLE "guardian_item_remap";
