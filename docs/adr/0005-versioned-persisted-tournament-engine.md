# ADR 0005: Persist versioned pure tournament state

Status: accepted and implemented in Milestone 4

The Double-Take rules live in a pure package with no database, network, timer, or UI dependency. The game API persists its versioned state after each result while also storing normalized candidates, rounds, matchups, and votes for integrity and inspection.

This keeps bracket calculation deterministic and property-testable while PostgreSQL remains the durable transition authority. The API never rebuilds an active path from mutable nominations after restart. Unique engine matchup keys and row-locked transitions make resolution and successor creation idempotent.
