CREATE TABLE `cards` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`owner_id` text NOT NULL,
	`category_id` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`content_version` integer DEFAULT 1 NOT NULL,
	`progress_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`,`category_id`) REFERENCES `categories`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cards_progress_range" CHECK("cards"."progress" between 0 and 5),
	CONSTRAINT "cards_question_length" CHECK(length("cards"."question") between 1 and 2000),
	CONSTRAINT "cards_answer_length" CHECK(length("cards"."answer") between 1 and 10000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cards_id_unique` ON `cards` (`id`);--> statement-breakpoint
CREATE INDEX `cards_owner_seq_idx` ON `cards` (`owner_id`,`seq`);--> statement-breakpoint
CREATE INDEX `cards_owner_category_idx` ON `cards` (`owner_id`,`category_id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "categories_name_length" CHECK(length("categories"."name") between 1 and 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_owner_name_key_unique` ON `categories` (`owner_id`,`name_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_owner_id_unique` ON `categories` (`owner_id`,`id`);--> statement-breakpoint
CREATE TABLE `idempotency_records` (
	`owner_id` text NOT NULL,
	`operation` text NOT NULL,
	`key` text NOT NULL,
	`request_hash` text NOT NULL,
	`response` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `operation`, `key`)
);
--> statement-breakpoint
CREATE INDEX `idempotency_records_expires_at_idx` ON `idempotency_records` (`expires_at`);