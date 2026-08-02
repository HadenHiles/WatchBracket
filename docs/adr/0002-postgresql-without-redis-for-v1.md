# ADR 0002: PostgreSQL without Redis for V1

Status: accepted

The single-instance home deployment uses PostgreSQL for identities, room state, absolute deadlines, idempotency, and audit records. Socket presence stays in process memory and is reconstructed on reconnect. Room expiration uses transactional `FOR UPDATE SKIP LOCKED` claims. Redis would add operational cost without solving a current requirement and may be introduced later behind unchanged domain contracts if horizontal API scaling becomes necessary.

