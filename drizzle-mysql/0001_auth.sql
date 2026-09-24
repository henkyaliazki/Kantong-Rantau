CREATE TABLE IF NOT EXISTS auth_users (
 id varchar(64) PRIMARY KEY,
 email varchar(254) NOT NULL UNIQUE,
 name varchar(80) NOT NULL,
 password_hash varchar(255) NULL,
 google_sub varchar(255) NULL UNIQUE,
 totp_secret text NULL,
 totp_last_step bigint NOT NULL DEFAULT -1,
 created bigint unsigned NOT NULL
) ENGINE=InnoDB;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS auth_sessions (
 token_hash char(64) PRIMARY KEY,
 user_id varchar(64) NOT NULL,
 verified tinyint NOT NULL DEFAULT 0,
 created bigint unsigned NOT NULL,
 expires bigint unsigned NOT NULL,
 pending_secret text NULL,
 pending_expires bigint unsigned NULL,
 INDEX idx_auth_sessions_user (user_id),
 INDEX idx_auth_sessions_expiry (expires),
 FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS auth_recovery_codes (
 user_id varchar(64) NOT NULL,
 code_hash char(64) NOT NULL,
 PRIMARY KEY(user_id,code_hash),
 FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS auth_rate_limits (
 bucket_key char(64) PRIMARY KEY,
 attempts int unsigned NOT NULL,
 expires bigint unsigned NOT NULL,
 INDEX idx_auth_rate_expiry (expires)
) ENGINE=InnoDB;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS auth_oauth_states (
 state_hash char(64) PRIMARY KEY,
 payload text NOT NULL,
 expires bigint unsigned NOT NULL,
 INDEX idx_auth_oauth_expiry (expires)
) ENGINE=InnoDB;
