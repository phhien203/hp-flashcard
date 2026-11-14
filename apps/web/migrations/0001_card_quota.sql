-- Custom migration: the 1,000-Card quota (ADR 0002), in the database so it
-- holds however requests race. D1 runs one write at a time, and a batch is
-- one transaction: the count and the insert can't interleave with another
-- creation, and a refused insert rolls back the whole creation batch.
CREATE TRIGGER `cards_quota`
BEFORE INSERT ON `cards`
WHEN (SELECT count(*) FROM `cards` WHERE `owner_id` = NEW.`owner_id`) >= 1000
BEGIN
  SELECT RAISE(ABORT, 'card_quota_exceeded');
END;
