import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Customers table
export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  lat: real("lat"),
  lon: real("lon"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
});

export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;

// Geocode cache table
export const geocodeCache = pgTable("geocode_cache", {
  addressHash: varchar("address_hash").primaryKey(),
  addressText: text("address_text").notNull(),
  lat: real("lat").notNull(),
  lon: real("lon").notNull(),
  rawJson: jsonb("raw_json"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGeocodeCacheSchema = createInsertSchema(geocodeCache).omit({
  updatedAt: true,
});

export type InsertGeocodeCache = z.infer<typeof insertGeocodeCacheSchema>;
export type GeocodeCache = typeof geocodeCache.$inferSelect;

// Query cache table (for isochrones and directions)
export const queryCache = pgTable("query_cache", {
  key: varchar("key").primaryKey(),
  type: text("type").notNull(), // 'isochrone' or 'directions'
  requestJson: jsonb("request_json").notNull(),
  responseJson: jsonb("response_json").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertQueryCacheSchema = createInsertSchema(queryCache).omit({
  updatedAt: true,
});

export type InsertQueryCache = z.infer<typeof insertQueryCacheSchema>;
export type QueryCache = typeof queryCache.$inferSelect;

// API Request/Response types
export const geocodeRequestSchema = z.object({
  address: z.string().min(1),
});

export type GeocodeRequest = z.infer<typeof geocodeRequestSchema>;

export const isochroneRequestSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  minutes: z.number().min(5).max(60),
});

export type IsochroneRequest = z.infer<typeof isochroneRequestSchema>;

export const directionsRequestSchema = z.object({
  coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
});

export type DirectionsRequest = z.infer<typeof directionsRequestSchema>;

// CSV import types
export const csvRowSchema = z.object({
  name: z.string(),
  address: z.string(),
  city: z.string(),
  lat: z.number().optional(),
  lon: z.number().optional(),
});

export type CsvRow = z.infer<typeof csvRowSchema>;

// Column mapping type
export interface ColumnMapping {
  name: string;
  address: string;
  city: string;
  lat?: string;
  lon?: string;
}

// Keep existing users table for compatibility
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
