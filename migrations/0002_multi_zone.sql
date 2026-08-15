DROP TABLE `items`;
--> statement-breakpoint
DROP TABLE `control_state`;
--> statement-breakpoint
DROP TABLE `telemetry_samples`;
--> statement-breakpoint
DROP TABLE `control_actions`;
--> statement-breakpoint
CREATE TABLE `zones` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base_load_mw` real DEFAULT 4.2 NOT NULL,
	`load_amp_mw` real DEFAULT 3.6 NOT NULL,
	`load_phase_h` real DEFAULT 9 NOT NULL,
	`wet_bulb_offset_c` real DEFAULT 0 NOT NULL,
	`target_pue` real DEFAULT 1.12 NOT NULL,
	`target_wue` real DEFAULT 0.12 NOT NULL,
	`water_budget_lpm` real DEFAULT 1200 NOT NULL,
	`power_budget_mw` real DEFAULT 1.0 NOT NULL,
	`mode` text DEFAULT 'shadow' NOT NULL,
	`comms_ok` integer DEFAULT 1 NOT NULL,
	`last_heartbeat` text,
	`slew_limited` integer DEFAULT 0 NOT NULL,
	`fail_safe_active` integer DEFAULT 0 NOT NULL,
	`current_setpoints` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `facility_config` (
	`id` integer PRIMARY KEY NOT NULL,
	`total_water_budget_lpm` real DEFAULT 4000 NOT NULL,
	`total_power_budget_mw` real DEFAULT 4.0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `power_transfers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`source_id` integer NOT NULL,
	`target_id` integer NOT NULL,
	`water_delta_lpm` real DEFAULT 0 NOT NULL,
	`power_delta_mw` real DEFAULT 0 NOT NULL,
	`source_setpoints` text NOT NULL,
	`target_setpoints` text NOT NULL,
	`outcome` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'shadow' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `telemetry_samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cluster_id` integer NOT NULL,
	`tick` integer NOT NULL,
	`payload` text NOT NULL,
	`pue` real NOT NULL,
	`wue` real NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `control_actions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cluster_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`mode` text NOT NULL,
	`kind` text NOT NULL,
	`setpoints` text NOT NULL,
	`note` text DEFAULT '' NOT NULL
);
