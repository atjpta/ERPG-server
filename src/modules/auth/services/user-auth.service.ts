import { AuthErrorCode } from "@/modules/auth/enums/auth-error-code.enum.js";
import { Response } from "@/core/response/response.js";
import type { ClientInfo } from "@/modules/auth/schemas/client-info.schema.js";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { DateTime } from "luxon";
import { env } from "@/configs/env.config.js";
import { withTransaction } from "@/core/repositories/base.repository.js";
import { assertRateLimit } from "@/core/utils/rate-limit.util.js";
import { AUTH_LOGIN_EMAIL_RATE_LIMIT } from "@/modules/auth/constants/rate-limit.constant.js";
import type { User } from "@/modules/auth/entities/user.entity.js";
import { OauthProvider } from "@/modules/auth/enums/oauth-provider.enum.js";
import { UserStatus } from "@/modules/auth/enums/user.enum.js";
import { UserOauthAccountRepo } from "@/modules/auth/repositories/user-oauth-account.repository.js";
import { UserSessionRepo } from "@/modules/auth/repositories/user-session.repository.js";
import { UserRepo } from "@/modules/auth/repositories/user.repository.js";
import type { AuthUser } from "@/modules/auth/types/auth-user.type.js";
import { googleOauthService } from "@/modules/auth/services/google-oauth.service.js";
import { playGamesOauthService } from "@/modules/auth/services/play-games-oauth.service.js";
import { playerAuthService } from "@/modules/auth/services/player-auth.service.js";
import { playerService } from "@/modules/player/services/player.service.js";
import type {
    UserGoogleLinkBody,
    UserGoogleLoginBody,
    UserGuestLoginBody,
    UserLoginBody,
    UserPlayGamesLoginBody,
    UserRegisterBody,
} from "@/apis/user/auth/validators/user.auth.validator.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataService } from "@/modules/master-data/services/master-data.service.js";
import { playerKickService } from "@/core/services/player-kick.service.js";
import { KickReason } from "@/core/enums/kick-reason.enum.js";

const USER_TOKEN_EXPIRES_IN = "30d";

interface OauthIdentity {
    provider: OauthProvider;
    providerUserId: string;
    email: string | null;
}

export class UserAuthService {
    async register(body: UserRegisterBody) {
        return Response.attempt(async () => {
            const { email, password, ...client } = body;

            const exist = await UserRepo.findByEmail({ email });
            if (exist) {
                Response.abort(AuthErrorCode.AUTH_EMAIL_EXISTS);
            }

            const hashed = await bcrypt.hash(password, 10);
            const user = await UserRepo.create({ data: { email, password: hashed } });
            return this.issueSession(user, client);
        });
    }

    async login(body: UserLoginBody) {
        return Response.attempt(async () => {
            const { email, password, ...client } = body;
            await assertRateLimit(AUTH_LOGIN_EMAIL_RATE_LIMIT, email);

            const user = await UserRepo.findByEmail({ email });
            const valid = !!user?.password && (await bcrypt.compare(password, user.password));
            if (!valid) {
                Response.abort(AuthErrorCode.AUTH_INVALID_CREDENTIALS);
            }

            return this.issueSession(await this.resolveActiveUser(user), client);
        });
    }

    /**
     * Login khách: danh tính = hash(IP + secret) nên cùng IP luôn ra cùng tài khoản và DB không giữ IP thô.
     * Lưu ý: nhiều người chung 1 IP (NAT/wifi chung) sẽ dùng chung tài khoản khách — chỉ là tài khoản tạm,
     * người chơi nên liên kết Google để giữ tiến trình.
     */
    async loginAsGuest(body: UserGuestLoginBody, clientIp: string) {
        return Response.attempt(async () => {
            const providerUserId = createHash("sha256")
                .update(`${env.JWT_SECRET}:guest:${clientIp}`)
                .digest("hex");
            const user = await this.findOrCreateOauthUser([
                { provider: OauthProvider.GUEST, providerUserId, email: null },
            ]);
            return this.issueSession(await this.resolveActiveUser(user), body);
        });
    }

    issueOauthNonce() {
        return googleOauthService.issueNonce();
    }

    /** Login bằng Google idToken trên Android và PC — liên kết theo `sub` của Google. */
    async loginWithGoogle(body: UserGoogleLoginBody) {
        return Response.attempt(async () => {
            const { idToken, nonce, ...client } = body;

            const profile = await googleOauthService.verifyIdToken({ idToken, nonce });
            const user = await this.findOrCreateOauthUser([
                {
                    provider: OauthProvider.GOOGLE,
                    providerUserId: profile.providerUserId,
                    email: profile.email,
                },
            ]);
            return this.issueSession(await this.resolveActiveUser(user), client);
        });
    }

    /**
     * Liên kết Google vào tài khoản đang đăng nhập (vd khách muốn giữ tiến trình): lần sau đăng nhập Google ra đúng tài khoản này.
     * Gọi lại với cùng tài khoản Google thì trả kết quả hiện có. Google đã thuộc tài khoản KHÁC → 409
     * `OAUTH_ACCOUNT_LINKED_ELSEWHERE` (không tự gộp); tài khoản này đã liên kết Google khác → 409 `OAUTH_ALREADY_LINKED`.
     */
    async linkGoogle(params: { userId: string; body: UserGoogleLinkBody }) {
        return Response.attempt(async () => {
            const { userId, body } = params;
            const profile = await googleOauthService.verifyIdToken(body);
            return withTransaction(async (tx) => {
                const owner = await UserOauthAccountRepo.findByProviderAccount({
                    provider: OauthProvider.GOOGLE,
                    providerUserId: profile.providerUserId,
                    dbOrTx: tx,
                });
                if (owner) {
                    if (owner.userId !== userId) {
                        Response.abort(AuthErrorCode.OAUTH_ACCOUNT_LINKED_ELSEWHERE);
                    }
                    return owner;
                }
                const mine = await UserOauthAccountRepo.findByUserId({ userId, dbOrTx: tx });
                if (mine.some((account) => account.provider === OauthProvider.GOOGLE)) {
                    Response.abort(AuthErrorCode.OAUTH_ALREADY_LINKED);
                }
                return UserOauthAccountRepo.create({
                    data: {
                        userId,
                        provider: OauthProvider.GOOGLE,
                        providerUserId: profile.providerUserId,
                        email: profile.email,
                    },
                    dbOrTx: tx,
                });
            });
        });
    }

    /** Các cách đăng nhập đã liên kết của tài khoản. */
    listOauthAccounts(userId: string) {
        return UserOauthAccountRepo.findByUserId({ userId });
    }

    /**
     * Login bằng Google Play Games Services v2 (bản Android) — `serverAuthCode` từ
     * `RequestServerSideAccess`. Nếu client xin thêm scope `OPEN_ID`, liên kết luôn danh tính Google
     * (`sub`) → đăng nhập Google trên PC ra cùng tài khoản.
     */
    async loginWithPlayGames(body: UserPlayGamesLoginBody) {
        return Response.attempt(async () => {
            const { serverAuthCode, ...client } = body;

            const profile = await playGamesOauthService.verifyServerAuthCode(serverAuthCode);
            const identities: OauthIdentity[] = [
                {
                    provider: OauthProvider.PLAY_GAMES,
                    providerUserId: profile.playerId,
                    email: profile.google?.email ?? null,
                },
            ];
            if (profile.google) {
                identities.push({
                    provider: OauthProvider.GOOGLE,
                    providerUserId: profile.google.sub,
                    email: profile.google.email,
                });
            }

            const user = await this.findOrCreateOauthUser(identities);
            return this.issueSession(await this.resolveActiveUser(user), client);
        });
    }

    /**
     * Tìm user theo bất kỳ danh tính nào đã liên kết; danh tính chưa liên kết thì gắn thêm vào user đó.
     * Chưa có user → tạo mới (không password) và liên kết tất cả. Email đã thuộc tài khoản
     * email/mật khẩu khác → 409 (không tự gộp, tránh chiếm tài khoản).
     */
    private async findOrCreateOauthUser(identities: OauthIdentity[]): Promise<User> {
        return withTransaction(async (tx) => {
            let userId: string | null = null;
            const unlinked: OauthIdentity[] = [];
            for (const identity of identities) {
                const linked = await UserOauthAccountRepo.findByProviderAccount({
                    provider: identity.provider,
                    providerUserId: identity.providerUserId,
                    dbOrTx: tx,
                });
                if (linked) userId ??= linked.userId;
                else unlinked.push(identity);
            }

            let user: User;
            if (userId) {
                user = await UserRepo.findByIdOrFail({ id: userId, dbOrTx: tx });
            } else {
                const primary = identities[0];
                const email = identities.find((identity) => identity.email)?.email ?? null;
                if (email && (await UserRepo.findByEmail({ email, dbOrTx: tx }))) {
                    Response.abort(AuthErrorCode.AUTH_EMAIL_EXISTS);
                }
                user = await UserRepo.create({
                    data: {
                        email: email ?? `${primary.provider}_${primary.providerUserId}@oauth.local`,
                        password: null,
                    },
                    dbOrTx: tx,
                });
            }

            for (const identity of unlinked) {
                await UserOauthAccountRepo.create({
                    data: { userId: user.id, ...identity },
                    dbOrTx: tx,
                });
            }
            return user;
        });
    }

    async getProfile(userId: string) {
        const user = await UserRepo.findById({ id: userId });
        if (!user) return null;
        const { password: _password, ...profile } = user;
        return profile;
    }

    /** Đăng xuất thiết bị hiện tại (đá kết nối realtime của session này). */
    async logout(userId: string, sessionId: string) {
        const session = await UserSessionRepo.revoke({ id: sessionId });
        playerKickService.kickSession(userId, sessionId);
        return session;
    }

    /** Đăng xuất khỏi mọi thiết bị — revoke toàn bộ session, đá mọi kết nối realtime. */
    async logoutAll(userId: string) {
        const sessions = await UserSessionRepo.revokeAllByUserId({ userId });
        playerKickService.kickUser(userId, KickReason.SESSION_REVOKED);
        return sessions;
    }

    async listSessions(userId: string) {
        return UserSessionRepo.findActiveByUserId({ userId });
    }

    /** Đăng xuất đúng 1 thiết bị — giữ nguyên các thiết bị khác. */
    async revokeSession(params: { userId: string; sessionId: string }) {
        return Response.attempt(async () => {
            const { userId, sessionId } = params;
            const session = await UserSessionRepo.findById({ id: sessionId });
            if (!session || session.userId !== userId) {
                Response.abort(AuthErrorCode.AUTH_SESSION_NOT_FOUND);
            }
            const revoked = await UserSessionRepo.revoke({ id: sessionId });
            playerKickService.kickSession(userId, sessionId);
            return revoked;
        });
    }

    /**
     * Tạo session + token cho 1 lần login, kèm player token của nhân vật đầu tiên nếu đã có
     * (client có thể đổi qua `GET /user/players` + `POST /user/players/:id/select`). Chưa có → `player`/`playerToken`
     * = null, client gọi `POST /user/players` để tạo. Nếu bật `AUTH_SESSION_CONFIG.singleSessionPerUser` thì revoke mọi session cũ trước
     * (chặn đăng nhập nhiều máy cùng lúc).
     */
    private async issueSession(user: User, client: ClientInfo) {
        const config = await masterDataService.findValue(MasterDataKey.AUTH_SESSION_CONFIG);

        const { session, player } = await withTransaction(async (tx) => {
            if (config?.singleSessionPerUser) {
                await UserSessionRepo.revokeAllByUserId({ userId: user.id, dbOrTx: tx });
            }
            await UserRepo.updateById({
                id: user.id,
                data: { lastLoginAt: DateTime.now().toJSDate() },
                dbOrTx: tx,
            });
            const session = await UserSessionRepo.create({
                data: {
                    userId: user.id,
                    platform: client.platform,
                    clientVersion: client.clientVersion,
                    device: client.device ?? "",
                },
                dbOrTx: tx,
            });
            const player = await playerService.findByUserId(user.id, tx);
            return { session, player };
        });

        const payload: Pick<AuthUser, "typ" | "userId" | "userSessionId"> = {
            typ: "user",
            userId: user.id,
            userSessionId: session.id,
        };
        if (config?.singleSessionPerUser) {
            // Session cũ đã bị revoke → đá các máy đang chơi (máy mới chưa join room nên không bị ảnh hưởng).
            playerKickService.kickUser(user.id, KickReason.SESSION_REVOKED);
        }

        const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: USER_TOKEN_EXPIRES_IN });
        const playerToken = player
            ? await playerAuthService.issueToken({
                  userId: user.id,
                  sessionId: session.id,
                  playerId: player.id,
              })
            : null;
        return { token, playerToken, userId: user.id, player };
    }

    /** Tự gỡ ban đã hết hạn, throw rõ lý do nếu đang bị ban/inactive. */
    private async resolveActiveUser(user: User): Promise<User> {
        if (
            user.status === UserStatus.BANNED &&
            user.banExpiresAt &&
            user.banExpiresAt <= DateTime.now().toJSDate()
        ) {
            user = await UserRepo.updateByIdOrFail({
                id: user.id,
                data: { status: UserStatus.ACTIVE, banReason: null, banExpiresAt: null },
            });
        }

        if (user.status === UserStatus.BANNED) {
            Response.abort(AuthErrorCode.AUTH_ACCOUNT_BANNED);
        }
        if (user.status === UserStatus.DELETED) {
            Response.abort(AuthErrorCode.AUTH_ACCOUNT_DELETED);
        }
        if (user.status !== UserStatus.ACTIVE) {
            Response.abort(AuthErrorCode.AUTH_ACCOUNT_INACTIVE);
        }
        return user;
    }
}

export const userAuthService = new UserAuthService();
