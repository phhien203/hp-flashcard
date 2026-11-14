-- Custom migration: once an identity is deleted (deleted_identities, filled
-- by the verified Clerk user.deleted webhook in the same batch that purges
-- the Collection), nothing may be written for it again. A request that was
-- authenticated before the purge and writes after it fails here, inside
-- D1's one-write-at-a-time transaction, and its whole batch rolls back:
-- no Card, Category, retry record or rate-limit entry comes back.
CREATE TRIGGER `cards_deleted_identity`
BEFORE INSERT ON `cards`
WHEN EXISTS (SELECT 1 FROM `deleted_identities` WHERE `owner_id` = NEW.`owner_id`)
BEGIN
  SELECT RAISE(ABORT, 'identity_deleted');
END;
--> statement-breakpoint
CREATE TRIGGER `categories_deleted_identity`
BEFORE INSERT ON `categories`
WHEN EXISTS (SELECT 1 FROM `deleted_identities` WHERE `owner_id` = NEW.`owner_id`)
BEGIN
  SELECT RAISE(ABORT, 'identity_deleted');
END;
--> statement-breakpoint
CREATE TRIGGER `idempotency_records_deleted_identity`
BEFORE INSERT ON `idempotency_records`
WHEN EXISTS (SELECT 1 FROM `deleted_identities` WHERE `owner_id` = NEW.`owner_id`)
BEGIN
  SELECT RAISE(ABORT, 'identity_deleted');
END;
--> statement-breakpoint
CREATE TRIGGER `write_requests_deleted_identity`
BEFORE INSERT ON `write_requests`
WHEN EXISTS (SELECT 1 FROM `deleted_identities` WHERE `owner_id` = NEW.`owner_id`)
BEGIN
  SELECT RAISE(ABORT, 'identity_deleted');
END;
