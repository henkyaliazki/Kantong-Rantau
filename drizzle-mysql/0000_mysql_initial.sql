CREATE TABLE `budgets` (
  `user` varchar(191) NOT NULL,
  `period` varchar(7) NOT NULL,
  `data` json NOT NULL,
  PRIMARY KEY (`user`,`period`)
) ENGINE=InnoDB;
--> statement-breakpoint
CREATE TABLE `debts` (
  `id` varchar(64) NOT NULL,
  `user` varchar(191) NOT NULL,
  `data` json NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_debts_user` (`user`)
) ENGINE=InnoDB;
--> statement-breakpoint
CREATE TABLE `orders` (
  `id` varchar(64) NOT NULL,
  `user` varchar(191) NOT NULL,
  `amount` bigint unsigned NOT NULL,
  `status` varchar(32) NOT NULL,
  `url` varchar(2048),
  `created` bigint unsigned NOT NULL,
  `expires` bigint unsigned,
  `mode` varchar(16) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_orders_user_created` (`user`,`created`)
) ENGINE=InnoDB;
--> statement-breakpoint
CREATE TABLE `transactions` (
  `id` varchar(64) NOT NULL,
  `user` varchar(191) NOT NULL,
  `period` varchar(7) NOT NULL,
  `date` varchar(10) NOT NULL,
  `type` varchar(16) NOT NULL,
  `amount` bigint unsigned NOT NULL,
  `pocket` varchar(60) NOT NULL,
  `note` varchar(120) NOT NULL,
  `debt_id` varchar(64),
  PRIMARY KEY (`id`),
  KEY `idx_transactions_user_period` (`user`,`period`),
  KEY `idx_transactions_user_debt` (`user`,`debt_id`)
) ENGINE=InnoDB;
