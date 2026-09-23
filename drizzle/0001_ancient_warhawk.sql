CREATE TABLE `debts` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_debts_user` ON `debts` (`user`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `debt_id` text;--> statement-breakpoint
CREATE INDEX `idx_transactions_user_debt` ON `transactions` (`user`,`debt_id`);