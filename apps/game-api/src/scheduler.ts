import { sql } from 'drizzle-orm';
import type { Database } from '@watch-bracket/db';

export function startExpirationScheduler(db: Database, onExpired: (roomId: string) => void, intervalMs = 30_000) {
  let running = false;
  const poll = async () => {
    if (running) return;
    running = true;
    try {
      const result = await db.execute<{ id: string }>(sql`
        WITH due AS (
          SELECT id FROM rooms WHERE state = 'LOBBY' AND expires_at <= now()
          ORDER BY expires_at FOR UPDATE SKIP LOCKED LIMIT 25
        )
        UPDATE rooms SET state = 'EXPIRED', version = version + 1, updated_at = now()
        FROM due WHERE rooms.id = due.id AND rooms.state = 'LOBBY'
        RETURNING rooms.id
      `);
      for (const row of result) onExpired(row.id);
    } finally { running = false; }
  };
  void poll();
  const timer = setInterval(() => void poll(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

