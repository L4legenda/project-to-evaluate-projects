CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`project_type` text DEFAULT 'business' NOT NULL,
	`admin_key` text NOT NULL,
	`phase` text DEFAULT 'waiting' NOT NULL,
	`active_presentation_id` text,
	`current_page` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `groups_code_unique` ON `groups` (`code`);--> statement-breakpoint
CREATE TABLE `presentations` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`student_name` text NOT NULL,
	`title` text NOT NULL,
	`filename` text NOT NULL,
	`object_key` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `votes` (
	`id` text PRIMARY KEY NOT NULL,
	`presentation_id` text NOT NULL,
	`voter_name` text NOT NULL,
	`idea` integer NOT NULL,
	`execution` integer NOT NULL,
	`delivery` integer NOT NULL,
	`potential` integer NOT NULL,
	`comment` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `votes_presentation_voter_unique` ON `votes` (`presentation_id`,`voter_name`);