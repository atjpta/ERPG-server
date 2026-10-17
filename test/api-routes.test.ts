import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { loadControllers } from "@/core/utils/load-controllers.util.js";
import { prefixEndpoints } from "@/core/utils/prefix-endpoints.util.js";
import { createEndpoint, createMiddleware, createRouter } from "colyseus";
import { z } from "zod";

describe("HTTP API routes after separating transport from modules", () => {
    it("preserves all endpoint methods, authentication and validation, with admin/user prefixes", async () => {
        const expected = JSON.parse(
            readFileSync(new URL("./fixtures/api-routes.json", import.meta.url), "utf8")
        );
        const { admin, user } = await loadControllers();
        const endpoints = {
            ...prefixEndpoints("/admin", admin),
            ...prefixEndpoints("/user", user),
        };
        const actual = Object.entries(endpoints)
            .map(([key, endpoint]) => ({
                key,
                path: endpoint.path,
                method: endpoint.options.method,
                auth: endpoint.options.use?.length ?? 0,
                body: !!endpoint.options.body,
                query: !!endpoint.options.query,
                params: "params" in endpoint.options && !!endpoint.options.params,
            }))
            .sort((a, b) => a.key.localeCompare(b.key));
        assert.deepEqual(
            actual,
            expected.sort((a: { key: string }, b: { key: string }) => a.key.localeCompare(b.key))
        );
        for (const route of actual) {
            const role = route.key.startsWith("admin") ? "admin" : "user";
            assert.ok(route.key.startsWith(role) && route.path.startsWith(`/${role}/`), route.key);
        }
    });

    it("returns separate groups with local paths and leaves controllers unchanged when mounted", async () => {
        const groups = await loadControllers();
        assert.deepEqual(Object.keys(groups), ["admin", "user"]);
        for (const role of ["admin", "user"] as const) {
            const endpoints = groups[role];
            assert.ok(Object.keys(endpoints).length > 0);
            const mounted = prefixEndpoints(`/${role}`, endpoints);
            for (const [key, endpoint] of Object.entries(endpoints)) {
                assert.ok(key.startsWith(role));
                assert.ok(!/^\/(admin|user)(\/|$)/.test(endpoint.path), key);
                assert.equal(mounted[key].path, `/${role}${endpoint.path}`);
                assert.equal(mounted[key].options, endpoint.options);
            }
        }
    });

    it("routes prefixed requests with params, validation and a single middleware invocation", async () => {
        let calls = 0;
        const auth = createMiddleware(async () => {
            calls++;
            return { userId: "owner" };
        });
        const endpoint = createEndpoint(
            "/items/:id",
            {
                method: "POST",
                use: [auth],
                body: z.object({ quantity: z.number().int().positive() }),
            },
            async (ctx) => ({
                id: ctx.params.id,
                quantity: ctx.body.quantity,
                userId: ctx.context.userId,
            })
        );
        const router = createRouter(prefixEndpoints("/user", { userItemCreate: endpoint }));
        const request = (quantity: number) =>
            new Request("http://localhost/user/items/item-1", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ quantity }),
            });
        const response = await router.handler(request(2));
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { id: "item-1", quantity: 2, userId: "owner" });
        assert.equal(calls, 1);
        assert.equal((await router.handler(request(0))).status, 400);
        assert.equal(router.findRoute("POST", "/items/item-1"), undefined);
        assert.equal(endpoint.path, "/items/:id");
    });
});
