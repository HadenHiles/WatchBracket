import { sql } from 'drizzle-orm';
import type { Database } from '@watch-bracket/db';

export function startExpirationScheduler(db: Database, onTransition: (roomId: string) => void, intervalMs = 1_000) {
  let running = false;
  const poll = async () => {
    if (running) return;
    running = true;
    try {
      const nominations = await db.execute<{ id: string }>(sql`
        WITH due AS (
          SELECT id FROM rooms WHERE state = 'NOMINATING' AND nomination_deadline <= now()
          ORDER BY nomination_deadline FOR UPDATE SKIP LOCKED LIMIT 25
        )
        UPDATE rooms SET state = 'NOMINATIONS_LOCKED', nominations_revealed_at = now(), version = version + 1, updated_at = now()
        FROM due WHERE rooms.id = due.id AND rooms.state = 'NOMINATING'
        RETURNING rooms.id
      `);
      const expired = await db.execute<{ id: string }>(sql`
        WITH due AS (
          SELECT id FROM rooms WHERE state <> 'EXPIRED' AND expires_at <= now()
          ORDER BY expires_at FOR UPDATE SKIP LOCKED LIMIT 25
        )
        UPDATE rooms SET state = 'EXPIRED', version = version + 1, updated_at = now()
        FROM due WHERE rooms.id = due.id AND rooms.state <> 'EXPIRED'
        RETURNING rooms.id
      `);
      for (const row of [...nominations, ...expired]) onTransition(row.id);
    } finally { running = false; }
  };
  void poll();
  const timer = setInterval(() => void poll(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
