import { z } from "zod";
import { ClientInfoSchema } from "@/modules/auth/schemas/client-info.schema.js";

export const UserRegisterSchema = ClientInfoSchema.extend({
    email: z.email(),
    password: z.string().min(6).max(64),
});
export type UserRegisterBody = z.infer<typeof UserRegisterSchema>;

export const UserLoginSchema = ClientInfoSchema.extend({
    email: z.email(),
    password: z.string().min(1).max(64),
});
export type UserLoginBody = z.infer<typeof UserLoginSchema>;

export const UserGoogleLoginSchema = ClientInfoSchema.extend({
    idToken: z.string().min(1),
    /** Nonce dùng một lần lấy từ `POST /user/auth/oauth/nonce`, gắn vào ID token khi sign-in. */
    nonce: z.string().min(1).max(256).optional(),
});
export type UserGoogleLoginBody = z.infer<typeof UserGoogleLoginSchema>;

/** Liên kết Google vào tài khoản đang đăng nhập — cùng idToken / nonce như đăng nhập Google, không cần thông tin thiết bị. */
export const UserGoogleLinkSchema = z.object({
    idToken: z.string().min(1),
    /** Nonce dùng một lần lấy từ `POST /user/auth/oauth/nonce`. */
    nonce: z.string().min(1).max(256).optional(),
});
export type UserGoogleLinkBody = z.infer<typeof UserGoogleLinkSchema>;

/** Login khách — không cần thông tin gì thêm, server nhận diện theo IP. */
export const UserGuestLoginSchema = ClientInfoSchema;
export type UserGuestLoginBody = z.infer<typeof UserGuestLoginSchema>;

/** Google Play Games Services v2 — `serverAuthCode` lấy từ `RequestServerSideAccess` trên Unity. */
export const UserPlayGamesLoginSchema = ClientInfoSchema.extend({
    serverAuthCode: z.string().min(1).max(2048),
});
export type UserPlayGamesLoginBody = z.infer<typeof UserPlayGamesLoginSchema>;
