CREATE TABLE `upload_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`upload_id` text NOT NULL,
	`object_key` text NOT NULL,
	`student_name` text NOT NULL,
	`title` text NOT NULL,
	`filename` text NOT NULL,
	`file_size` integer NOT NULL,
	`created_at` text NOT NULL
);
