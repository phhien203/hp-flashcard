CREATE TABLE `deleted_identities` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`deleted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`processed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `webhook_deliveries_processed_at_idx` ON `webhook_deliveries` (`processed_at`);--> statement-breakpoint
CREATE TABLE `write_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `write_requests_owner_at_idx` ON `write_requests` (`owner_id`,`at`);