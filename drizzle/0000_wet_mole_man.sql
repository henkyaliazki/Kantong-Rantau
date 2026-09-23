CREATE TABLE `budgets` (
	`user` text NOT NULL,
	`period` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`user`, `period`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text NOT NULL,
	`url` text,
	`created` integer NOT NULL,
	`expires` integer,
	`mode` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_orders_user_created` ON `orders` (`user`,`created`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`period` text NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`pocket` text NOT NULL,
	`note` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_transactions_user_period` ON `transactions` (`user`,`period`);