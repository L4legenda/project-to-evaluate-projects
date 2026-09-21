import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(), code: text("code").notNull().unique(), name: text("name").notNull(),
  projectType: text("project_type").notNull().default("business"), adminKey: text("admin_key").notNull(),
  phase: text("phase").notNull().default("waiting"), activePresentationId: text("active_presentation_id"),
  currentPage: integer("current_page").notNull().default(1), createdAt: text("created_at").notNull(),
});
export const presentations = sqliteTable("presentations", {
  id: text("id").primaryKey(), groupId: text("group_id").notNull(), studentName: text("student_name").notNull(),
  title: text("title").notNull(), filename: text("filename").notNull(), objectKey: text("object_key").notNull(), createdAt: text("created_at").notNull(),
});
export const votes = sqliteTable("votes", {
  id: text("id").primaryKey(), presentationId: text("presentation_id").notNull(), voterName: text("voter_name").notNull(),
  idea: integer("idea").notNull(), execution: integer("execution").notNull(), delivery: integer("delivery").notNull(), potential: integer("potential").notNull(), comment: text("comment"), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("votes_presentation_voter_unique").on(table.presentationId, table.voterName)]);

export const uploadSessions = sqliteTable("upload_sessions", {
  id: text("id").primaryKey(), groupId: text("group_id").notNull(), uploadId: text("upload_id").notNull(),
  objectKey: text("object_key").notNull(), studentName: text("student_name").notNull(), title: text("title").notNull(),
  filename: text("filename").notNull(), fileSize: integer("file_size").notNull(), createdAt: text("created_at").notNull(),
});
