CREATE TABLE `recoveries` (
	`epoch` text PRIMARY KEY NOT NULL,
	`reconciled_at` integer NOT NULL,
	`purged` integer NOT NULL,
	`reopened_at` integer
);
