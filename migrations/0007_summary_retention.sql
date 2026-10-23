CREATE TABLE `shadow_summary` (
	`cluster_id` integer PRIMARY KEY NOT NULL,
	`tick` integer NOT NULL DEFAULT 0,
	`total` integer NOT NULL DEFAULT 0,
	`feasible` integer NOT NULL DEFAULT 0,
	`budget_ok` integer NOT NULL DEFAULT 0,
	`meets` integer NOT NULL DEFAULT 0,
	`sum_pue_gap` real NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `facility_samples` (
	`tick` integer PRIMARY KEY NOT NULL,
	`timestamp` text NOT NULL,
	`it_load_mw` real NOT NULL,
	`accessory_power_mw` real NOT NULL,
	`pue` real NOT NULL,
	`wue` real NOT NULL,
	`gpu_die_c` real NOT NULL,
	`cpu_die_c` real NOT NULL
);
