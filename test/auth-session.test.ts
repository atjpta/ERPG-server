import { strict as assert } from "node:assert";
import jwt from "jsonwebtoken";
import { DateTime } from "luxon";
import { env } from "@/configs/env.config.js";
import { ClientPlatform } from "@/core/enums/client-platform.enum.js";
import type { UserSession } from "@/modules/auth/entities/user-session.entity.js";
import { UserSessionRepo } from "@/modules/auth/repositories/user-session.repository.js";
import { userSessionService } from "@/modules/auth/services/user-session.service.js";
import { adminSessionService } from "@/modules/auth/services/admin-session.service.js";

describe("shared account authentication after extracting API login", () => {
    const originalFindById = UserSessionRepo.findById;
    const session: UserSession = {
        id: "session",
        userId: "owner",
        revoked: false,
        device: "test",
        platform: ClientPlatform.PC,
        clientVersion: "1",
        createdAt: DateTime.now().toJSDate(),
        updatedAt: DateTime.now().toJSDate(),
    };
    const token = (typ = "user") =>
        jwt.sign({ typ, userId: "owner", userSessionId: "session" }, env.JWT_SECRET);

    afterEach(() => {
        UserSessionRepo.findById = originalFindById;
    });

    it("checks the database session for every user token verification", async () => {
        let calls = 0;
        UserSessionRepo.findById = async ({ id }) => {
            calls++;
            assert.equal(id, session.id);
            return session;
        };
        assert.equal((await userSessionService.verifyToken(token())).userId, session.userId);
        assert.equal(calls, 1);
    });

    it("rejects revoked, missing and other-account sessions", async () => {
        for (const value of [
            null,
            { ...session, revoked: true },
            { ...session, userId: "another" },
        ]) {
            UserSessionRepo.findById = async () => value;
            await assert.rejects(() => userSessionService.verifyToken(token()), /Session revoked/);
        }
    });

    it("keeps user and admin token types separate", async () => {
        await assert.rejects(
            () => userSessionService.verifyToken(token("player")),
            /Invalid token type/
        );
        const wrongAdminType = jwt.sign({ typ: "user" }, env.ADMIN_JWT_SECRET);
        assert.throws(() => adminSessionService.verifyToken(wrongAdminType), /Invalid token type/);
        assert.throws(() => adminSessionService.verifyToken(token()), /signature/);
    });
});
