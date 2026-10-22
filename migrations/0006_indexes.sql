CREATE INDEX `telemetry_samples_cluster_tick_idx` ON `telemetry_samples` (`cluster_id`,`tick`);
--> statement-breakpoint
CREATE INDEX `telemetry_samples_tick_idx` ON `telemetry_samples` (`tick`);
--> statement-breakpoint
CREATE INDEX `shadow_samples_cluster_idx` ON `shadow_samples` (`cluster_id`);
--> statement-breakpoint
CREATE INDEX `shadow_samples_tick_idx` ON `shadow_samples` (`tick`);
--> statement-breakpoint
CREATE INDEX `whatif_candidates_run_idx` ON `whatif_candidates` (`run_id`);
