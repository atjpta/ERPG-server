/** Nền tảng client — gửi lên lúc login, dùng để check phiên bản tối thiểu và thống kê session. */
export enum ClientPlatform {
    /** Bản mobile phát hành trên Google Play. */
    ANDROID = "android",
    /** Bản desktop (Windows/Steam...). */
    PC = "pc",
}
