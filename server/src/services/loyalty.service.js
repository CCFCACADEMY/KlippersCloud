/**
 * Loyalty points ledger. `loyalty_transactions` is the source of truth;
 * `users.loyalty_points` is a cached balance updated in the same transaction.
 */
export async function adjustPoints(client, { userId, points, reason, appointmentId = null }) {
  if (!userId || !points) return;
  await client.query(
    'INSERT INTO loyalty_transactions (user_id, points, reason, appointment_id) VALUES ($1,$2,$3,$4)',
    [userId, points, reason, appointmentId],
  );
  await client.query('UPDATE users SET loyalty_points = GREATEST(loyalty_points + $2, 0) WHERE id = $1', [userId, points]);
}

/** Loyalty tier derived from lifetime earned points. */
export function tierFor(lifetime) {
  if (lifetime >= 2000) return { name: 'Platinum', next: null };
  if (lifetime >= 1000) return { name: 'Gold', next: 2000 };
  if (lifetime >= 400) return { name: 'Silver', next: 1000 };
  return { name: 'Bronze', next: 400 };
}
