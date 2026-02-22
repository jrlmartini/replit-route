import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, hashAddress, createIsochroneCacheKey, createDirectionsCacheKey } from "./storage";
import { insertCustomerSchema, geocodeRequestSchema, isochroneRequestSchema, directionsRequestSchema } from "@shared/schema";
import { z } from "zod";

const ORS_API_KEY = process.env.ORS_API_KEY;
const ORS_BASE_URL = "https://api.openrouteservice.org";

// Rate limiter state
const rateLimiter = {
  lastRequest: 0,
  minInterval: 1000, // 1 second between requests
};

async function waitForRateLimit() {
  const now = Date.now();
  const elapsed = now - rateLimiter.lastRequest;
  if (elapsed < rateLimiter.minInterval) {
    await new Promise(resolve => setTimeout(resolve, rateLimiter.minInterval - elapsed));
  }
  rateLimiter.lastRequest = Date.now();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // GET all customers
  app.get("/api/customers", async (req, res) => {
    try {
      const customers = await storage.getCustomers();
      res.json(customers);
    } catch (error) {
      console.error("Error fetching customers:", error);
      res.status(500).json({ error: "Erro ao buscar clientes" });
    }
  });

  // GET single customer
  app.get("/api/customers/:id", async (req, res) => {
    try {
      const customer = await storage.getCustomer(req.params.id);
      if (!customer) {
        return res.status(404).json({ error: "Cliente não encontrado" });
      }
      res.json(customer);
    } catch (error) {
      console.error("Error fetching customer:", error);
      res.status(500).json({ error: "Erro ao buscar cliente" });
    }
  });

  // POST create customer
  app.post("/api/customers", async (req, res) => {
    try {
      const parsed = insertCustomerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos", details: parsed.error.errors });
      }
      const customer = await storage.createCustomer(parsed.data);
      res.status(201).json(customer);
    } catch (error) {
      console.error("Error creating customer:", error);
      res.status(500).json({ error: "Erro ao criar cliente" });
    }
  });

  // POST create customers batch
  app.post("/api/customers/batch", async (req, res) => {
    try {
      const schema = z.object({
        customers: z.array(insertCustomerSchema),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos", details: parsed.error.errors });
      }
      const customers = await storage.createCustomers(parsed.data.customers);
      res.status(201).json(customers);
    } catch (error) {
      console.error("Error creating customers batch:", error);
      res.status(500).json({ error: "Erro ao criar clientes" });
    }
  });

  // PATCH update customer
  app.patch("/api/customers/:id", async (req, res) => {
    try {
      const updates = insertCustomerSchema.partial().safeParse(req.body);
      if (!updates.success) {
        return res.status(400).json({ error: "Dados inválidos", details: updates.error.errors });
      }
      const customer = await storage.updateCustomer(req.params.id, updates.data);
      if (!customer) {
        return res.status(404).json({ error: "Cliente não encontrado" });
      }
      res.json(customer);
    } catch (error) {
      console.error("Error updating customer:", error);
      res.status(500).json({ error: "Erro ao atualizar cliente" });
    }
  });

  // DELETE customer
  app.delete("/api/customers/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteCustomer(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Cliente não encontrado" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting customer:", error);
      res.status(500).json({ error: "Erro ao excluir cliente" });
    }
  });

  // DELETE all customers
  app.delete("/api/customers", async (req, res) => {
    try {
      await storage.deleteAllCustomers();
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting all customers:", error);
      res.status(500).json({ error: "Erro ao excluir clientes" });
    }
  });

  // GET autocomplete address (ORS proxy)
  app.get("/api/ors/autocomplete", async (req, res) => {
    try {
      const text = req.query.text as string;
      if (!text || text.trim().length < 3) {
        return res.json([]);
      }

      if (!ORS_API_KEY) {
        return res.status(500).json({ error: "Chave ORS não configurada" });
      }

      await waitForRateLimit();

      const params = new URLSearchParams({
        api_key: ORS_API_KEY,
        text: text.trim(),
        "boundary.country": "BR",
        size: "5",
        layers: "locality,address,venue,street,neighbourhood",
      });

      const response = await fetch(
        `${ORS_BASE_URL}/geocode/autocomplete?${params}`,
        { headers: { "Accept": "application/json" } }
      );

      if (!response.ok) {
        if (response.status === 429) {
          return res.status(429).json({ error: "Limite de requisições atingido" });
        }
        const errText = await response.text();
        console.error("ORS autocomplete error:", response.status, errText);
        return res.status(response.status).json({ error: "Erro no autocomplete" });
      }

      const data = await response.json();
      const suggestions = (data.features || []).map((f: any) => ({
        label: f.properties?.label || f.properties?.name || "",
        lat: f.geometry?.coordinates?.[1],
        lon: f.geometry?.coordinates?.[0],
      }));

      res.json(suggestions);
    } catch (error) {
      console.error("Autocomplete error:", error);
      res.status(500).json({ error: "Erro no autocomplete" });
    }
  });

  // POST geocode address (ORS proxy)
  app.post("/api/ors/geocode", async (req, res) => {
    try {
      const parsed = geocodeRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Endereço inválido" });
      }

      const { address } = parsed.data;
      const addressHash = hashAddress(address);

      // Check cache first
      const cached = await storage.getGeocodeCache(addressHash);
      if (cached) {
        return res.json({ lat: cached.lat, lon: cached.lon, cached: true });
      }

      if (!ORS_API_KEY) {
        return res.status(500).json({ error: "Chave ORS não configurada" });
      }

      await waitForRateLimit();

      const response = await fetch(
        `${ORS_BASE_URL}/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(address)}&boundary.country=BR&size=1`,
        { headers: { "Accept": "application/json" } }
      );

      if (!response.ok) {
        if (response.status === 429) {
          return res.status(429).json({ error: "Limite de requisições atingido. Tente novamente em alguns minutos." });
        }
        const text = await response.text();
        console.error("ORS geocode error:", response.status, text);
        return res.status(response.status).json({ error: "Erro no serviço de geocodificação" });
      }

      const data = await response.json();
      
      if (!data.features || data.features.length === 0) {
        return res.status(404).json({ error: "Endereço não encontrado" });
      }

      const [lon, lat] = data.features[0].geometry.coordinates;

      // Cache the result
      await storage.setGeocodeCache({
        addressHash,
        addressText: address,
        lat,
        lon,
        rawJson: data.features[0],
      });

      res.json({ lat, lon, cached: false });
    } catch (error) {
      console.error("Geocode error:", error);
      res.status(500).json({ error: "Erro na geocodificação" });
    }
  });

  // POST isochrones (ORS proxy)
  app.post("/api/ors/isochrones", async (req, res) => {
    try {
      const parsed = isochroneRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Parâmetros inválidos" });
      }

      const { lat, lon, minutes } = parsed.data;
      const cacheKey = createIsochroneCacheKey(lat, lon, minutes);

      // Check cache first
      const cached = await storage.getQueryCache(cacheKey);
      if (cached) {
        return res.json(cached.responseJson);
      }

      if (!ORS_API_KEY) {
        return res.status(500).json({ error: "Chave ORS não configurada" });
      }

      await waitForRateLimit();

      const response = await fetch(`${ORS_BASE_URL}/v2/isochrones/driving-car`, {
        method: "POST",
        headers: {
          "Authorization": ORS_API_KEY,
          "Content-Type": "application/json",
          "Accept": "application/json, application/geo+json",
        },
        body: JSON.stringify({
          locations: [[lon, lat]],
          range: [minutes * 60], // Convert to seconds
          range_type: "time",
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return res.status(429).json({ error: "Limite de requisições atingido. Tente novamente em alguns minutos." });
        }
        const text = await response.text();
        console.error("ORS isochrones error:", response.status, text);
        return res.status(response.status).json({ error: "Erro no serviço de isócronas" });
      }

      const data = await response.json();

      // Cache the result
      await storage.setQueryCache({
        key: cacheKey,
        type: "isochrone",
        requestJson: { lat, lon, minutes },
        responseJson: data,
      });

      res.json(data);
    } catch (error) {
      console.error("Isochrones error:", error);
      res.status(500).json({ error: "Erro ao calcular isócronas" });
    }
  });

  // POST directions (ORS proxy)
  app.post("/api/ors/directions", async (req, res) => {
    try {
      const parsed = directionsRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Parâmetros inválidos" });
      }

      const { coordinates } = parsed.data;
      const cacheKey = createDirectionsCacheKey(coordinates);

      // Check cache first
      const cached = await storage.getQueryCache(cacheKey);
      if (cached) {
        return res.json(cached.responseJson);
      }

      if (!ORS_API_KEY) {
        return res.status(500).json({ error: "Chave ORS não configurada" });
      }

      await waitForRateLimit();

      // Try with alternative routes first
      let response = await fetch(`${ORS_BASE_URL}/v2/directions/driving-car/geojson`, {
        method: "POST",
        headers: {
          "Authorization": ORS_API_KEY,
          "Content-Type": "application/json",
          "Accept": "application/json, application/geo+json",
        },
        body: JSON.stringify({
          coordinates,
          alternative_routes: {
            target_count: 3,
            weight_factor: 1.6,
            share_factor: 0.6,
          },
        }),
      });

      // If alternative routes fail (e.g. route too long >100km), retry without alternatives
      if (!response.ok) {
        const errorText = await response.text();
        let shouldRetry = false;
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson?.error?.code === 2004) {
            shouldRetry = true;
          }
        } catch {}

        if (shouldRetry) {
          console.log("Alternative routes not available for this distance, retrying without alternatives");
          await waitForRateLimit();
          response = await fetch(`${ORS_BASE_URL}/v2/directions/driving-car/geojson`, {
            method: "POST",
            headers: {
              "Authorization": ORS_API_KEY,
              "Content-Type": "application/json",
              "Accept": "application/json, application/geo+json",
            },
            body: JSON.stringify({ coordinates }),
          });
        }

        if (!response.ok) {
          if (response.status === 429) {
            return res.status(429).json({ error: "Limite de requisições atingido. Tente novamente em alguns minutos." });
          }
          const retryText = shouldRetry ? await response.text() : errorText;
          console.error("ORS directions error:", response.status, retryText);
          return res.status(response.status).json({ error: "Erro no serviço de rotas" });
        }
      }

      const data = await response.json();

      // Cache the result
      await storage.setQueryCache({
        key: cacheKey,
        type: "directions",
        requestJson: { coordinates },
        responseJson: data,
      });

      res.json(data);
    } catch (error) {
      console.error("Directions error:", error);
      res.status(500).json({ error: "Erro ao calcular rota" });
    }
  });

  // Clear query cache
  app.delete("/api/cache", async (req, res) => {
    try {
      await storage.clearQueryCache();
      res.status(204).send();
    } catch (error) {
      console.error("Error clearing cache:", error);
      res.status(500).json({ error: "Erro ao limpar cache" });
    }
  });

  return httpServer;
}
