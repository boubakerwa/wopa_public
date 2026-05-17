ALTER TABLE waitlist_submissions ADD COLUMN marketing_opt_in INTEGER NOT NULL DEFAULT 0;
ALTER TABLE waitlist_submissions ADD COLUMN consent_version TEXT;
