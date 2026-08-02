import { sql } from 'drizzle-orm';
import type { Database } from '@watch-bracket/db';

export function startExpirationScheduler(db: Database, onTransition: (roomId: string) => void | Promise<void>, intervalMs = 1_000) {
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
      const tournamentDue = await db.execute<{ id: string }>(sql`
        SELECT DISTINCT rooms.id FROM rooms
        INNER JOIN matchups ON matchups.room_id = rooms.id AND matchups.advanced_at IS NULL
        WHERE (rooms.state = 'MATCHUP_INTRO' AND matchups.status = 'INTRO' AND matchups.intro_ends_at <= now())
           OR (rooms.state = 'VOTING' AND matchups.status = 'VOTING' AND matchups.voting_ends_at <= now())
           OR (rooms.state = 'MATCHUP_RESULT' AND matchups.status = 'RESOLVED' AND matchups.result_ends_at <= now())
        LIMIT 25
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
      for (const row of tournamentDue) await onTransition(row.id);
      for (const row of [...nominations, ...expired]) await onTransition(row.id);
    } finally { running = false; }
  };
  void poll();
  const timer = setInterval(() => void poll(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
