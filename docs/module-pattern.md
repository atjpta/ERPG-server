# Module Pattern

Stack: **Colyseus 0.18** (better-call router) · **PostgreSQL + Drizzle ORM** · **Zod 4** · **TypeScript 6**

## Cấu trúc

Mỗi module tách phần **user** (API cho game client) và **admin** (API cho trang quản trị), mỗi phần
có `controllers/ services/ validators/` riêng. Entity/repository/enum dùng chung đặt ở gốc module.

```
src/modules/foo/
├── enums/foo.enum.ts
├── entities/foo.entity.ts
├── repositories/foo.repository.ts
├── seeds/foo.seed.ts
├── user/
│   ├── controllers/foo.controller.ts
│   ├── services/foo.service.ts
│   └── validators/foo.validator.ts
└── admin/
    ├── controllers/admin.foo.controller.ts
    ├── services/admin.foo.service.ts
    └── validators/admin.foo.validator.ts
```

## Quy tắc đặt tên

- Phần admin: chữ **`admin` luôn đứng đầu** ở mọi layer — file `admin.foo.service.ts`, export
  `adminFooService`, `AdminFooQuerySchema`, endpoint key `adminFooIndex`, path `/admin/foos`.
- Controller export tên kết thúc bằng `Controller` (`fooController`, `adminFooController`) — đây là
  điều kiện để `loadControllers()` tự đăng ký. Key endpoint phải unique toàn project (trùng sẽ throw lúc boot).
- Enum: key IN HOA, value snake_case.
- Table: biến PascalCase số nhiều (`Foos`), tên bảng snake_case số nhiều (`foos`), export
  `type Foo = typeof Foos.$inferSelect` và `NewFoo`.
- Repository: export instance `FooRepo`; service: export instance `fooService`.

## 1. Entity

```ts
export const fooStatusEnum = pgEnum("foo_status", FooStatus);

export const Foos = pgTable("foos", {
    ...baseColumns(),
    name: text("name").notNull(),
    status: fooStatusEnum("status").notNull().default(FooStatus.ACTIVE),
});

export type Foo = typeof Foos.$inferSelect;
export type NewFoo = typeof Foos.$inferInsert;
```

Sửa entity xong: `yarn db:generate` → `yarn db:migrate`. Không sửa tay file trong `src/migrations/`.

## 2. Repository

```ts
export class FooRepository extends BaseRepository<typeof Foos> {
    constructor() {
        super(Foos);
    }

    async findByName(params: { name: string; dbOrTx?: Queryable }) {
        return this.findOne({ where: eq(Foos.name, params.name), dbOrTx: params.dbOrTx });
    }
}

export const FooRepo = new FooRepository();
```

- Mọi method nhận **1 object param**, `dbOrTx` optional.
- `.from(Foos)` chỉ được viết trong repo sở hữu bảng `Foos` — service không tự query.
- Query lặp lại ≥ 2 nơi → tách thành method riêng trong repo.

## 3. Service

```ts
export class AdminFooService extends BaseService<typeof Foos> {
    constructor() {
        super(FooRepo);
    }

    async list(query: AdminListFoosQuery) {
        const { search, page, limit } = query;
        const where = search ? ilike(Foos.name, `%${search}%`) : undefined;
        return this.paginate({ pagination: { page, limit }, where });
    }
}

export const adminFooService = new AdminFooService();
```

- `BaseService` có sẵn các hàm trùng tên/param với `BaseRepository` (`findById({ id })`,
  `create({ data })`, `updateById({ id, data })`, `paginate(...)`...).
- Lỗi nghiệp vụ: `serviceError(message, status, ResponseCode.X)`.
- **≥ 2 thao tác ghi** → bọc `withTransaction(async (tx) => ...)`, truyền `tx` vào mọi lệnh repo.

## 4. Controller

```ts
const adminEndpoint = createEndpoint.create({ use: [adminAuthMiddleware] });
const prefix = "/admin/foos";

export const adminFooController = {
    adminFooIndex: adminEndpoint(
        prefix,
        { method: "GET", query: AdminListFoosQuerySchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await adminFooService.list(ctx.query);
                return Response.ok({ data: result });
            })
    ),
};
```

- Luôn bọc handler trong `RouterContainer`.
- Middleware: `authMiddleware` (user token), `authPlayerMiddleware` (player token),
  `adminAuthMiddleware` (admin token).
- Param path không phải `:id` (vd `:key` enum) → `Schema.parse(ctx.params)` để có đúng kiểu.

## Response helpers

| Helper                                        | HTTP | Dùng khi          |
| --------------------------------------------- | ---- | ----------------- |
| `Response.ok({ data })`                       | 200  | GET / UPDATE      |
| `Response.created(ctx, { data })`             | 201  | POST tạo mới      |
| `Response.notFound(ctx)`                      | 404  | Không tìm thấy    |
| `Response.badRequest(ctx, { message, code })` | 400  | Input sai logic   |
| `Response.unauthorized(ctx)`                  | 401  | Thiếu / sai token |
| `Response.conflict(ctx)`                      | 409  | Trùng dữ liệu     |
