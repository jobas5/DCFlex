CREATE TABLE `control_actions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`mode` text NOT NULL,
	`kind` text NOT NULL,
	`setpoints` text NOT NULL,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `control_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`mode` text DEFAULT 'shadow' NOT NULL,
	`comms_ok` integer DEFAULT 1 NOT NULL,
	`last_heartbeat` text,
	`slew_limited` integer DEFAULT 0 NOT NULL,
	`fail_safe_active` integer DEFAULT 0 NOT NULL,
	`current_setpoints` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `model_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`mae_mw` real NOT NULL,
	`pue_coverage` real NOT NULL,
	`kl_divergence` real NOT NULL,
	`inference_latency_ms` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `telemetry_samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tick` integer NOT NULL,
	`payload` text NOT NULL,
	`pue` real NOT NULL,
	`wue` real NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `whatif_candidates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`setpoints` text NOT NULL,
	`pue` real NOT NULL,
	`wue` real NOT NULL,
	`cost` real,
	`chip_temp_c` real NOT NULL,
	`feasible` integer NOT NULL,
	`violations` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `whatif_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `whatif_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`alpha` real NOT NULL,
	`beta` real NOT NULL,
	`base_setpoints` text NOT NULL,
	`best_setpoints` text,
	`best_cost` real,
	`best_pue` real,
	`best_wue` real,
	`candidates_evaluated` integer NOT NULL,
	`feasible_count` integer NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL
);
