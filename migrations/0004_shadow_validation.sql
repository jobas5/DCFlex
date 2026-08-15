ALTER TABLE `zones` ADD COLUMN `shadow_setpoints` text;
--> statement-breakpoint
CREATE TABLE `shadow_samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cluster_id` integer NOT NULL,
	`tick` integer NOT NULL,
	`setpoints` text NOT NULL,
	`predicted_pue` real NOT NULL,
	`predicted_wue` real NOT NULL,
	`actual_pue` real NOT NULL,
	`actual_wue` real NOT NULL,
	`chip_temp_c` real NOT NULL,
	`feasible` integer NOT NULL,
	`budget_ok` integer NOT NULL,
	`meets_target` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
