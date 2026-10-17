# Account and access module

Keep account business logic here, shared by HTTP APIs and realtime rooms:

- User/admin identities, OAuth links, sessions and access status.
- Player identities and game-server availability.
- Token validation against persisted sessions, bans and session revocation.
- Account deletion and decisions to kick online players after access changes.

Controllers and login flows specific to HTTP belong in `src/apis/admin/auth`
and `src/apis/user/auth`. The reusable Colyseus base room lives in
`src/core/rooms/base-player.room.ts` and does not import this module.
`src/rooms/index.room.ts` connects its authentication
and reconnect hooks to `playerAuthService`; world and party inherit that adapter.

`AuthPlayer` is a JWT-independent identity contract in `src/core/types`.
Kick reasons, filters, presence topics and the publisher also belong to core as
shared realtime infrastructure. Account services decide when to publish kicks.

Move authentication helpers into `src/core` only when they are independent of
account entities, repositories and business rules, such as a generic token codec.
The current services combine token handling with account/session checks, so they
remain in this module.
