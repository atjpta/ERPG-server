import { z } from "zod";
import { ClientPlatform } from "@/core/enums/client-platform.enum.js";

/** Thông tin client gửi kèm mọi lần login — dùng để check phiên bản và ghi vào session. */
export const ClientInfoSchema = z.object({
    platform: z.enum(ClientPlatform),
    clientVersion: z.string().min(1).max(32),
    /** Nhãn thiết bị (model máy/tên PC) — hiển thị lại ở `/auth/sessions`. */
    device: z.string().max(255).optional(),
});
export type ClientInfo = z.infer<typeof ClientInfoSchema>;

export const RegisterSchema = ClientInfoSchema.extend({
    email: z.email(),
    password: z.string().min(6).max(64),
});
export type RegisterBody = z.infer<typeof RegisterSchema>;

export const LoginSchema = ClientInfoSchema.extend({
    email: z.email(),
    password: z.string().min(1).max(64),
});
export type LoginBody = z.infer<typeof LoginSchema>;

export const GoogleLoginSchema = ClientInfoSchema.extend({
    idToken: z.string().min(1),
    /** Nonce dùng một lần lấy từ `POST /auth/oauth/nonce`, gắn vào ID token khi sign-in. */
    nonce: z.string().min(1).max(256).optional(),
});
export type GoogleLoginBody = z.infer<typeof GoogleLoginSchema>;

/** Login khách — không cần thông tin gì thêm, server nhận diện theo IP. */
export const GuestLoginSchema = ClientInfoSchema;
export type GuestLoginBody = z.infer<typeof GuestLoginSchema>;

/** Google Play Games Services v2 — `serverAuthCode` lấy từ `RequestServerSideAccess` trên Unity. */
export const PlayGamesLoginSchema = ClientInfoSchema.extend({
    serverAuthCode: z.string().min(1).max(2048),
});
export type PlayGamesLoginBody = z.infer<typeof PlayGamesLoginSchema>;
