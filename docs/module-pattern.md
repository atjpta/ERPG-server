# Module Pattern

Stack: **Colyseus 0.18** (better-call router) · **PostgreSQL + Drizzle ORM** · **Zod 4** · **TypeScript 6**

## Structure and dependencies

`src/modules` contains business logic and data shared by HTTP APIs and realtime rooms.
HTTP adapters live in `src/apis/admin/<module>` and `src/apis/user/<module>`.

```text
src/
|-- apis/
|   |-- admin/foo/
|   |   |-- controllers/admin.foo.controller.ts
|   |   `-- validators/admin.foo.validator.ts
|   `-- user/foo/
|       |-- controllers/user.foo.controller.ts
|       `-- validators/user.foo.validator.ts
|-- modules/foo/
|   |-- constants/
|   |-- entities/
|   |-- enums/
|   |-- interfaces/
|   |-- repositories/
|   |-- middlewares/
|   |-- schemas/
|   |-- seeds/
|   |-- state/         # *.state.ts, class names end with State
|   |-- types/
|   |-- data/
|   `-- services/
`-- rooms/
```

Create folders only when needed. A module may keep a `README.md` documenting its business rules.
Pure business functions belong in `services`; seed-only helpers belong in `seeds`.
A class file contains only the class: interfaces/types go to `types/` (or `interfaces/`), enums to `enums/`.
Unity-authored map definitions live in `src/modules/maps/data/definitions/<code>.json`.

- API and rooms import modules. Modules must not import API or rooms, including type-only imports.
- Admin and user APIs share business logic through modules, not by importing the other API role.
- `src/apis` has only `controllers/` and `validators/`. A controller may call repositories directly for basic CRUD and shapes the response. Logic used in >= 2 places, complex or heavy goes to a service in `src/modules`.
- Services only process and return `Response<T>` (`Response.success(data)` / `Response.error(code)` from `core/response/response.ts`); they never answer the client. The controller (`HttpResponse.from(ctx, response)`) or room command (`this.result = response`) turns it into the client envelope.
- API validators validate request bodies, queries and params. Shared Zod data schemas belong in modules.
- Infer types from Zod alongside their schema. Other shared types belong in `modules/<module>/types`.
- Module middleware calls shared token/session services; login flows live in module services (`user-auth.service.ts`).

`loadControllers()` scans only `src/apis` (or `build/apis`). Operational `/health` and Colyseus protocol
endpoints remain managed by the entrypoint. Application endpoints use `/admin/...` or `/user/...`.

`loadControllers()` returns `{ admin, user }` as separate endpoint maps. Controllers declare local
resource paths such as `/maps` or `/auth/login`. Only `src/index.ts` mounts the groups:

```ts
const { admin, user } = await loadControllers();
const routes = createRouter({
    ...prefixEndpoints("/admin", admin),
    ...prefixEndpoints("/user", user),
});
```

`prefixEndpoints` preserves endpoint handlers, middleware and validation without mutating the
controller definitions. Do not repeat `/admin` or `/user` in controller paths.

## Naming

- Admin: `admin.foo.service.ts`, `AdminFooService`, `adminFooService`, `AdminFooQuerySchema`,
  endpoint key `adminFooIndex`, URL `/admin/foos`.
- User: `user.foo.service.ts`, `UserFooService`, `userFooService`, `UserFooQuerySchema`,
  endpoint key `userFooIndex`, URL `/user/foos`.
- Controller export names end in `Controller`; endpoint keys must be globally unique.
- Enum keys use UPPER_CASE and values use snake_case.
- Table variables use plural PascalCase (`Foos`); table names use plural snake_case (`foos`).
- Repositories export `FooRepo`; shared services export `fooService`.

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

## 3. Service (`src/modules/foo/services`)

Chỉ viết service khi logic dùng ≥ 2 nơi / phức tạp / nặng. CRUD cơ bản: controller gọi thẳng repo (`FooRepo.findById({ id })`, `create({ data })`, `paginate(...)`). Không có `BaseService`.

```ts
export class FooService {
    async rename(id: string, name: string): Promise<Response<Foo>> {
        if (await FooRepo.findByName({ name })) return Response.error(FooErrorCode.FOO_NAME_EXISTS);
        return Response.success(await FooRepo.updateById({ id, data: { name } }));
    }
}

export const fooService = new FooService();
```

- Lỗi nghiệp vụ: `return Response.error(<Domain>ErrorCode.X)`; HTTP status của mã đăng ký cạnh enum: `registerErrorCodes(FooErrorCode, { FOO_NAME_EXISTS: 409 })` (mặc định 400).
- Luồng nhiều bước / trong `withTransaction`: `Response.abort(code)` rồi bọc hàm công khai bằng `Response.attempt(async () => ...)` để rollback và đổi về `Response.error`.
- Hàm `*OrFail` của repo / service vẫn ném lỗi (không tìm thấy, lỗi hệ thống); `RouterContainer` và command của room đổi sang envelope.
- **≥ 2 thao tác ghi** → bọc `withTransaction(async (tx) => ...)`, truyền `tx` vào mọi lệnh repo.

## 4. Controller

```ts
const adminEndpoint = createEndpoint.create({ use: [adminAuthMiddleware] });
const prefix = "/foos";

export const adminFooController = {
    adminFooIndex: adminEndpoint(
        prefix,
        { method: "GET", query: AdminListFoosQuerySchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await adminFooService.list(ctx.query);
                return HttpResponse.success({ data: result });
            })
    ),
};
```

- Luôn bọc handler trong `RouterContainer`.
- Middleware: `authMiddleware` (user token), `playerAuthMiddleware` (player token),
  `adminAuthMiddleware` (admin token).
- Param path không phải `:id` (vd `:key` enum) → `Schema.parse(ctx.params)` để có đúng kiểu.

## HttpResponse helpers

Mọi response là envelope `Result` `{ success, data, code, message, error }` — xem [định dạng trả về chung](response-format.md).

| Helper                                            | HTTP | Dùng khi          |
| ------------------------------------------------- | ---- | ----------------- |
| `HttpResponse.success({ data })`                  | 200  | GET / UPDATE      |
| `HttpResponse.created(ctx, { data })`             | 201  | POST tạo mới      |
| `HttpResponse.notFound(ctx)`                      | 404  | Không tìm thấy    |
| `HttpResponse.badRequest(ctx, { message, code })` | 400  | Input sai logic   |
| `HttpResponse.unauthorized(ctx)`                  | 401  | Thiếu / sai token |
| `HttpResponse.conflict(ctx)`                      | 409  | Trùng dữ liệu     |
