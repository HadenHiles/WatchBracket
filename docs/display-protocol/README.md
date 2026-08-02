# Display protocol

`@watch-bracket/display-protocol` defines versioned `LOBBY` and `NOMINATION_PROGRESS` scenes and the `DisplayEnvelope`. Display clients ignore stale sequences and request a complete snapshot on gaps. Before nomination reveal, the progress scene contains counts and the server deadline but no title data. The package intentionally has no web-framework, socket, persistence, cookie, or provider dependency.

It also defines the single Cast launch envelope and the fixed namespace `urn:x-cast:live.famflix.watchbracket`. Launch traffic is intentionally limited to an opaque token and schema version; semantic scenes travel directly from the game server.
