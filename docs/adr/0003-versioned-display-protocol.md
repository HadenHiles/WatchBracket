# ADR 0003: Versioned semantic display protocol

Status: accepted

Browser and Cast displays consume semantic scene envelopes with schema version, event ID, room ID, monotonic sequence, and server timestamp. The protocol depends on Zod and plain data only—not React, Next.js, Socket.IO classes, database rows, cookies, or provider responses. This keeps multiple display clients consistent while the authoritative game server remains the sole owner of transitions.

