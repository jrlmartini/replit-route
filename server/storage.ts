import { 
  type Customer, type InsertCustomer,
  type GeocodeCache, type InsertGeocodeCache,
  type QueryCache, type InsertQueryCache,
  type User, type InsertUser,
  customers, geocodeCache, queryCache, users
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export interface IStorage {
  getCustomers(): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  createCustomers(customers: InsertCustomer[]): Promise<Customer[]>;
  updateCustomer(id: string, updates: Partial<InsertCustomer>): Promise<Customer | undefined>;
  deleteCustomer(id: string): Promise<boolean>;
  deleteAllCustomers(): Promise<void>;
  
  getGeocodeCache(addressHash: string): Promise<GeocodeCache | undefined>;
  setGeocodeCache(cache: InsertGeocodeCache): Promise<GeocodeCache>;
  
  getQueryCache(key: string): Promise<QueryCache | undefined>;
  setQueryCache(cache: InsertQueryCache): Promise<QueryCache>;
  clearQueryCache(): Promise<void>;
  
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
}

export class DatabaseStorage implements IStorage {
  async getCustomers(): Promise<Customer[]> {
    return db.select().from(customers);
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }

  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const [customer] = await db.insert(customers).values(insertCustomer).returning();
    return customer;
  }

  async createCustomers(insertCustomers: InsertCustomer[]): Promise<Customer[]> {
    if (insertCustomers.length === 0) return [];
    return db.insert(customers).values(insertCustomers).returning();
  }

  async updateCustomer(id: string, updates: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const [customer] = await db
      .update(customers)
      .set(updates)
      .where(eq(customers.id, id))
      .returning();
    return customer;
  }

  async deleteCustomer(id: string): Promise<boolean> {
    const result = await db.delete(customers).where(eq(customers.id, id)).returning();
    return result.length > 0;
  }

  async deleteAllCustomers(): Promise<void> {
    await db.delete(customers);
  }

  async getGeocodeCache(addressHash: string): Promise<GeocodeCache | undefined> {
    const [cached] = await db.select().from(geocodeCache).where(eq(geocodeCache.addressHash, addressHash));
    return cached;
  }

  async setGeocodeCache(cache: InsertGeocodeCache): Promise<GeocodeCache> {
    const [entry] = await db
      .insert(geocodeCache)
      .values(cache)
      .onConflictDoUpdate({
        target: geocodeCache.addressHash,
        set: { lat: cache.lat, lon: cache.lon, rawJson: cache.rawJson ?? null, updatedAt: new Date() },
      })
      .returning();
    return entry;
  }

  async getQueryCache(key: string): Promise<QueryCache | undefined> {
    const [cached] = await db.select().from(queryCache).where(eq(queryCache.key, key));
    return cached;
  }

  async setQueryCache(cache: InsertQueryCache): Promise<QueryCache> {
    const [entry] = await db
      .insert(queryCache)
      .values(cache)
      .onConflictDoUpdate({
        target: queryCache.key,
        set: { responseJson: cache.responseJson, updatedAt: new Date() },
      })
      .returning();
    return entry;
  }

  async clearQueryCache(): Promise<void> {
    await db.delete(queryCache);
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }
}

export function hashAddress(address: string): string {
  return crypto.createHash('md5').update(address.toLowerCase().trim()).digest('hex');
}

export function createIsochroneCacheKey(lat: number, lon: number, minutes: number): string {
  const roundedLat = lat.toFixed(5);
  const roundedLon = lon.toFixed(5);
  return `isochrone:${roundedLat}:${roundedLon}:${minutes}:driving-car`;
}

export function createDirectionsCacheKey(coordinates: [number, number][]): string {
  const coordStr = coordinates.map(c => `${c[0].toFixed(5)},${c[1].toFixed(5)}`).join('|');
  return `directions:${crypto.createHash('md5').update(coordStr).digest('hex')}`;
}

export const storage = new DatabaseStorage();
