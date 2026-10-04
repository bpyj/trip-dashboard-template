CREATE TABLE `trip_snapshots` (
	`trip_id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`updated_at` text NOT NULL
);
