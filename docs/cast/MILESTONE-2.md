# Milestone 2: Chromecast couch experience

Milestone 2 implements the Web Sender, single-use launch-token exchange, Custom Web Receiver, direct receiver Socket.IO connection, lobby presentation, resume/disconnect controls, and receiver lifecycle. Physical launch still requires registration in Google's Cast SDK Developer Console.

## Register the Custom Web Receiver

1. Sign in to the [Google Cast SDK Developer Console](https://cast.google.com/publish/).
2. Add a **Custom Receiver** application named Watch Bracket.
3. Set its receiver URL to `https://bracket.famflix.live/cast/receiver/`.
4. Add `https://bracket.famflix.live` as the Web Sender URL.
5. Record the generated application ID and set `CAST_RECEIVER_APP_ID` in `.env.production` before building `web`.
6. Register each development Cast device by its Cast software serial number, wait for its status to become ready, then reboot it.

The application ID is a public identifier, not a secret. Do not commit an installation-specific ID as the default.

Official references: [Cast registration](https://developers.google.com/cast/docs/registration), [Web Sender integration](https://developers.google.com/cast/docs/web_sender/integrate), and [Web Receiver API](https://developers.google.com/cast/docs/web_receiver).

## Protocol and authorization

The sender loads Google's hosted Web Sender SDK only for an authenticated room host using Chrome on Android or desktop. It configures the standard `google-cast-launcher` with the registered application ID and origin-scoped auto-join.

After a session starts, the controller requests a token from:

```text
POST /api/rooms/:roomId/cast-launch-tokens
```

It sends only this envelope over `urn:x-cast:live.famflix.watchbracket`:

```json
{
  "type": "WATCH_BRACKET_LAUNCH",
  "schemaVersion": 1,
  "launchToken": "opaque-single-use-token"
}
```

The receiver exchanges it at `POST /api/displays/cast/exchange`. Tokens are room-bound, hashed in PostgreSQL, valid for no more than 60 seconds, and atomically consumed once. The response bearer token is retained only in receiver memory and is never placed in a URL, Cast message, storage API, or log.

The receiver then connects directly to `/socket.io/` with WebSocket transport and the read-only display credential. The host phone does not relay scenes.

## Lifecycle

- Branding appears immediately while the receiver waits up to 60 seconds for a launch token.
- The Cast framework idle timeout is disabled for this non-media application; application-owned timers stop an unattached receiver after 60 seconds and an ended room after five minutes.
- Sender suspension does not stop the receiver's independent game connection.
- Reconnection keeps the last lobby scene visible and requests a full snapshot after a sequence gap.
- A replacement launch revokes the prior Cast display socket.
- Host disconnect or revocation immediately changes the receiver to revoked and stops it shortly afterward.
- `/cast/receiver/?test=1` renders deterministic fixture data without a room; add `&reconnecting=1` to exercise the reconnecting indicator.

## Physical acceptance run

1. Deploy the canonical HTTPS origin and confirm `/cast/receiver/` loads without CSP errors.
2. Create a room from Android Chrome and tap the standard Cast launcher.
3. Select the registered device and confirm the lobby appears.
4. Join from two other phones and confirm participant updates reach the television.
5. Lock the host phone for at least 30 seconds and join/reconnect another participant.
6. Confirm the receiver continues updating without the host browser.
7. Reopen the host controller and confirm the TV status strip recovers.
8. Use Disconnect and confirm the receiver stops and its display session is revoked.
9. Repeat from desktop Chrome.

iOS browsers cannot launch the Web Sender SDK. They remain fully supported as controllers and participants, with the paired browser display as the fallback.

