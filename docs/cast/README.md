# Cast protocol guide

Watch Bracket uses a registered Custom Web Receiver and the namespace `urn:x-cast:live.famflix.watchbracket`.

The sender obtains a single-use 60-second launch token from the game API and sends only `{ type, schemaVersion, launchToken }`. The receiver exchanges it over HTTPS for a room-scoped display bearer token held only in memory, then subscribes directly to the versioned display protocol. The launch message does not carry a room ID, user identity, provider credential, or long-lived session.

Receivers are read-only. They can fetch their display snapshot, subscribe to scenes, reconnect, and receive revocation. They cannot vote, control timers, request media, change configuration, or access PostgreSQL/integration networks.

See `MILESTONE-2.md` for registration and physical-device acceptance steps and `../display-protocol/README.md` for scene-envelope compatibility rules.
