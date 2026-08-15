CREATE TABLE `alert_events` (
	`alert_key` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`last_tick` integer NOT NULL,
	`last_sent_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
