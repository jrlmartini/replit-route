import { 
  type Customer, type InsertCustomer,
  type GeocodeCache, type InsertGeocodeCache,
  type QueryCache, type InsertQueryCache,
  type User, type InsertUser 
} from "@shared/schema";
import { randomUUID } from "crypto";
import crypto from "crypto";

export interface IStorage {
  // Customers
  getCustomers(): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  createCustomers(customers: InsertCustomer[]): Promise<Customer[]>;
  updateCustomer(id: string, updates: Partial<InsertCustomer>): Promise<Customer | undefined>;
  deleteCustomer(id: string): Promise<boolean>;
  deleteAllCustomers(): Promise<void>;
  
  // Geocode cache
  getGeocodeCache(addressHash: string): Promise<GeocodeCache | undefined>;
  setGeocodeCache(cache: InsertGeocodeCache): Promise<GeocodeCache>;
  
  // Query cache
  getQueryCache(key: string): Promise<QueryCache | undefined>;
  setQueryCache(cache: InsertQueryCache): Promise<QueryCache>;
  clearQueryCache(): Promise<void>;
  
  // Users (keeping for compatibility)
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
}

export class MemStorage implements IStorage {
  private customers: Map<string, Customer>;
  private geocodeCache: Map<string, GeocodeCache>;
  private queryCache: Map<string, QueryCache>;
  private users: Map<string, User>;

  constructor() {
    this.customers = new Map();
    this.geocodeCache = new Map();
    this.queryCache = new Map();
    this.users = new Map();
  }

  // Customer methods
  async getCustomers(): Promise<Customer[]> {
    return Array.from(this.customers.values());
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    return this.customers.get(id);
  }

  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const id = randomUUID();
    const customer: Customer = {
      id,
      name: insertCustomer.name,
      address: insertCustomer.address,
      city: insertCustomer.city,
      lat: insertCustomer.lat ?? null,
      lon: insertCustomer.lon ?? null,
      createdAt: new Date(),
    };
    this.customers.set(id, customer);
    return customer;
  }

  async createCustomers(insertCustomers: InsertCustomer[]): Promise<Customer[]> {
    const created: Customer[] = [];
    for (const insertCustomer of insertCustomers) {
      const customer = await this.createCustomer(insertCustomer);
      created.push(customer);
    }
    return created;
  }

  async updateCustomer(id: string, updates: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const existing = this.customers.get(id);
    if (!existing) return undefined;
    
    const updated: Customer = { ...existing, ...updates };
    this.customers.set(id, updated);
    return updated;
  }

  async deleteCustomer(id: string): Promise<boolean> {
    return this.customers.delete(id);
  }

  async deleteAllCustomers(): Promise<void> {
    this.customers.clear();
  }

  // Geocode cache methods
  async getGeocodeCache(addressHash: string): Promise<GeocodeCache | undefined> {
    return this.geocodeCache.get(addressHash);
  }

  async setGeocodeCache(cache: InsertGeocodeCache): Promise<GeocodeCache> {
    const entry: GeocodeCache = {
      addressHash: cache.addressHash,
      addressText: cache.addressText,
      lat: cache.lat,
      lon: cache.lon,
      rawJson: cache.rawJson ?? null,
      updatedAt: new Date(),
    };
    this.geocodeCache.set(cache.addressHash, entry);
    return entry;
  }

  // Query cache methods
  async getQueryCache(key: string): Promise<QueryCache | undefined> {
    return this.queryCache.get(key);
  }

  async setQueryCache(cache: InsertQueryCache): Promise<QueryCache> {
    const entry: QueryCache = {
      ...cache,
      updatedAt: new Date(),
    };
    this.queryCache.set(cache.key, entry);
    return entry;
  }

  async clearQueryCache(): Promise<void> {
    this.queryCache.clear();
  }

  // User methods (keeping for compatibility)
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }
}

// Utility to hash addresses for cache lookup
export function hashAddress(address: string): string {
  return crypto.createHash('md5').update(address.toLowerCase().trim()).digest('hex');
}

// Utility to create isochrone cache key
export function createIsochroneCacheKey(lat: number, lon: number, minutes: number): string {
  const roundedLat = lat.toFixed(5);
  const roundedLon = lon.toFixed(5);
  return `isochrone:${roundedLat}:${roundedLon}:${minutes}:driving-car`;
}

// Utility to create directions cache key
export function createDirectionsCacheKey(coordinates: [number, number][]): string {
  const coordStr = coordinates.map(c => `${c[0].toFixed(5)},${c[1].toFixed(5)}`).join('|');
  return `directions:${crypto.createHash('md5').update(coordStr).digest('hex')}`;
}

export const storage = new MemStorage();
