import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const tripSnapshots = sqliteTable('trip_snapshots', {
  tripId: text('trip_id').primaryKey(),
  revision: integer('revision').notNull(),
  snapshotJson: text('snapshot_json').notNull(),
  updatedAt: text('updated_at').notNull(),
});
