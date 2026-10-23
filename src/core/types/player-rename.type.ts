/** Message presence khi một người chơi đổi tên — mọi room đang giữ người đó cập nhật tên trong phiên. */
export interface PlayerRenamedMessage {
    playerId: string;
    name: string;
}
