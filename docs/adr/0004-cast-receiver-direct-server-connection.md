# ADR 0004: Cast receiver direct server connection

Status: accepted for Milestone 2

The sender will pass a single-use, room-bound launch token over a custom Cast namespace. The receiver will exchange it for a short-lived revocable read-only session, then connect directly to the game API. Scene traffic will not be relayed through the host phone, so phone suspension does not stop the television. The receiver is read-only because presentation must never vote or mutate authoritative room state.

