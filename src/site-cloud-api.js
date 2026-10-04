const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS trip_snapshots (
    trip_id TEXT PRIMARY KEY,
    revision INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function getChangeCount(result) {
  return result?.meta?.changes ?? result?.changes ?? 0;
}

function validateWritePayload(payload, tripId) {
  const snapshot = payload?.snapshot;
  const expectedRevision = payload?.expectedRevision ?? null;

  if (!snapshot || typeof snapshot !== 'object') throw new Error('Snapshot is required.');
  if (snapshot.tripId !== tripId)
    throw new Error('Snapshot trip does not match this cloud record.');
  if (!Number.isInteger(snapshot.revision) || snapshot.revision < 1) {
    throw new Error('Snapshot revision must be a positive integer.');
  }
  if (expectedRevision !== null && (!Number.isInteger(expectedRevision) || expectedRevision < 0)) {
    throw new Error('Expected revision must be a non-negative integer or null.');
  }
  const nextRevision = (expectedRevision ?? 0) + 1;
  if (snapshot.revision !== nextRevision) {
    throw new Error(`Snapshot revision must be ${nextRevision} for this Push.`);
  }
  return { snapshot, expectedRevision };
}

export async function ensureTripSyncSchema(db) {
  if (!db?.prepare) throw new Error('D1 database binding is unavailable.');
  await db.prepare(CREATE_TABLE_SQL).run();
}

export async function handleTripSyncRequest({
  request,
  tripId,
  db,
  now = new Date().toISOString(),
}) {
  if (!(request instanceof Request)) throw new Error('A Request is required.');
  if (typeof tripId !== 'string' || !tripId) return json({ error: 'Trip ID is required.' }, 400);

  await ensureTripSyncSchema(db);

  if (request.method === 'GET') {
    const row = await db
      .prepare('SELECT snapshot_json FROM trip_snapshots WHERE trip_id = ?')
      .bind(tripId)
      .first();
    if (!row) return json({ error: 'Cloud trip not found.' }, 404);
    try {
      return json({ snapshot: JSON.parse(row.snapshot_json) });
    } catch {
      return json({ error: 'Stored cloud trip is invalid.' }, 500);
    }
  }

  if (request.method === 'PUT') {
    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'Request body must be valid JSON.' }, 400);
    }

    let validated;
    try {
      validated = validateWritePayload(payload, tripId);
    } catch (error) {
      return json({ error: error.message }, 400);
    }

    const { snapshot, expectedRevision } = validated;
    const snapshotJson = JSON.stringify(snapshot);
    let result;
    if (expectedRevision === null) {
      result = await db
        .prepare(
          'INSERT INTO trip_snapshots (trip_id, revision, snapshot_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(trip_id) DO NOTHING',
        )
        .bind(tripId, snapshot.revision, snapshotJson, now)
        .run();
    } else {
      result = await db
        .prepare(
          'UPDATE trip_snapshots SET revision = ?, snapshot_json = ?, updated_at = ? WHERE trip_id = ? AND revision = ?',
        )
        .bind(snapshot.revision, snapshotJson, now, tripId, expectedRevision)
        .run();
    }

    if (getChangeCount(result) < 1) {
      return json({ error: 'Cloud revision changed. Pull before pushing again.' }, 409);
    }
    return json({ snapshot });
  }

  return new Response(null, {
    status: 405,
    headers: { allow: 'GET, PUT' },
  });
}
