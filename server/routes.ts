import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, hashAddress, createIsochroneCacheKey, createDirectionsCacheKey } from "./storage";
import { insertCustomerSchema, geocodeRequestSchema, isochroneRequestSchema, directionsRequestSchema, corridorAnalysisRequestSchema } from "@shared/schema";
import { z } from "zod";
import { along, booleanPointInPolygon, buffer, convex, featureCollection, length, multiPoint, point, union } from "@turf/turf";

const ORS_API_KEY = process.env.ORS_API_KEY;
const ORS_BASE_URL = "https://api.openrouteservice.org";
const ORS_TIMEOUT_MS = 12000;

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

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ORS_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function isRouteTooLongError(errorText: string): boolean {
  try {
    const errorJson = JSON.parse(errorText);
    return errorJson?.error?.code === 2004;
  } catch {
    return false;
  }
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

      const normalizedText = text.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      const params = new URLSearchParams({
        api_key: ORS_API_KEY,
        text: normalizedText,
        "boundary.country": "BR",
        size: "5",
        layers: "locality,address,venue,street,neighbourhood",
      });

      const response = await fetchWithTimeout(
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
      if (error instanceof Error && error.name === "AbortError") {
        return res.status(504).json({ error: "Timeout no serviço de autocomplete" });
      }
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

      const response = await fetchWithTimeout(
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
      if (error instanceof Error && error.name === "AbortError") {
        return res.status(504).json({ error: "Timeout no serviço de geocodificação" });
      }
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

      const response = await fetchWithTimeout(`${ORS_BASE_URL}/v2/isochrones/driving-car`, {
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
      if (error instanceof Error && error.name === "AbortError") {
        return res.status(504).json({ error: "Timeout no serviço de isócronas" });
      }
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
      let response = await fetchWithTimeout(`${ORS_BASE_URL}/v2/directions/driving-car/geojson`, {
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
        const shouldRetry = isRouteTooLongError(errorText);

        if (shouldRetry) {
          console.log("Alternative routes not available for this distance, retrying without alternatives");
          await waitForRateLimit();
          response = await fetchWithTimeout(`${ORS_BASE_URL}/v2/directions/driving-car/geojson`, {
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
      if (error instanceof Error && error.name === "AbortError") {
        return res.status(504).json({ error: "Timeout no serviço de rotas" });
      }
      console.error("Directions error:", error);
      res.status(500).json({ error: "Erro ao calcular rota" });
    }
  });

  // POST corridor analysis (server-side geometry processing)
  app.post("/api/analysis/corridor", async (req, res) => {
    try {
      const parsed = corridorAnalysisRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Parâmetros inválidos" });
      }

      const { coordinates, mode, widthKm, timeMinutes } = parsed.data;
      const directionsCacheKey = createDirectionsCacheKey(coordinates);

      let directionsData: any;
      const cachedDirections = await storage.getQueryCache(directionsCacheKey);

      if (cachedDirections) {
        directionsData = cachedDirections.responseJson;
      } else {
        if (!ORS_API_KEY) {
          return res.status(500).json({ error: "Chave ORS não configurada" });
        }

        await waitForRateLimit();

        let response = await fetchWithTimeout(`${ORS_BASE_URL}/v2/directions/driving-car/geojson`, {
          method: "POST",
          headers: {
            "Authorization": ORS_API_KEY,
            "Content-Type": "application/json",
            "Accept": "application/json, application/geo+json",
          },
          body: JSON.stringify({
            coordinates,
            alternative_routes: { target_count: 3, weight_factor: 1.6, share_factor: 0.6 },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          const shouldRetry = isRouteTooLongError(errorText);

          if (shouldRetry) {
            await waitForRateLimit();
            response = await fetchWithTimeout(`${ORS_BASE_URL}/v2/directions/driving-car/geojson`, {
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
            return res.status(response.status).json({ error: "Erro no serviço de rotas" });
          }
        }

        directionsData = await response.json();
        await storage.setQueryCache({
          key: directionsCacheKey,
          type: "directions",
          requestJson: { coordinates },
          responseJson: directionsData,
        });
      }

      const allRoutes = (directionsData.features || []) as GeoJSON.Feature<GeoJSON.LineString>[];
      if (allRoutes.length === 0) {
        return res.status(422).json({ error: "Não foi possível gerar rota" });
      }

      const route = allRoutes[0];
      const alternativeRoutes = allRoutes.slice(1);
      let corridor: GeoJSON.Feature<GeoJSON.Polygon>;

      if (mode === "distance") {
        const buffers: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
        for (const routeFeature of allRoutes) {
          const buffered = buffer(routeFeature, widthKm, { units: "kilometers" });
          if (buffered) buffers.push(buffered as GeoJSON.Feature<GeoJSON.Polygon>);
        }

        if (buffers.length === 1) {
          corridor = buffers[0];
        } else {
          let merged: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> = buffers[0];
          for (let i = 1; i < buffers.length; i++) {
            const unionResult = union(featureCollection([merged as GeoJSON.Feature<GeoJSON.Polygon>, buffers[i]]));
            if (unionResult) merged = unionResult as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
          }

          if (merged.geometry.type === "MultiPolygon") {
            const allCoords: number[][] = [];
            for (const polyCoords of merged.geometry.coordinates) {
              for (const ring of polyCoords) allCoords.push(...ring);
            }
            const hull = convex(multiPoint(allCoords as [number, number][]));
            corridor = (hull ?? buffers[0]) as GeoJSON.Feature<GeoJSON.Polygon>;
          } else {
            corridor = merged as GeoJSON.Feature<GeoJSON.Polygon>;
          }
        }
      } else {
        const routeLength = length(route, { units: "kilometers" });
        const numSamples = Math.max(2, Math.min(5, Math.ceil(routeLength / 50)));
        const sampleDistance = routeLength / (numSamples - 1);
        const isochrones: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

        for (let i = 0; i < numSamples; i++) {
          const sampledPoint = along(route, i * sampleDistance, { units: "kilometers" });
          const [lon, lat] = sampledPoint.geometry.coordinates;
          const cacheKey = createIsochroneCacheKey(lat, lon, timeMinutes);
          const cachedIso = await storage.getQueryCache(cacheKey);

          if (cachedIso) {
            const feature = (cachedIso.responseJson as any)?.features?.[0];
            if (feature) isochrones.push(feature as GeoJSON.Feature<GeoJSON.Polygon>);
            continue;
          }

          if (!ORS_API_KEY) {
            return res.status(500).json({ error: "Chave ORS não configurada" });
          }

          await waitForRateLimit();
          const isoResponse = await fetchWithTimeout(`${ORS_BASE_URL}/v2/isochrones/driving-car`, {
            method: "POST",
            headers: {
              "Authorization": ORS_API_KEY,
              "Content-Type": "application/json",
              "Accept": "application/json, application/geo+json",
            },
            body: JSON.stringify({ locations: [[lon, lat]], range: [timeMinutes * 60], range_type: "time" }),
          });

          if (!isoResponse.ok) {
            continue;
          }

          const isoData = await isoResponse.json();
          const feature = isoData?.features?.[0];
          if (feature) {
            isochrones.push(feature as GeoJSON.Feature<GeoJSON.Polygon>);
            await storage.setQueryCache({
              key: cacheKey,
              type: "isochrone",
              requestJson: { lat, lon, minutes: timeMinutes },
              responseJson: isoData,
            });
          }
        }

        if (isochrones.length === 0) {
          corridor = buffer(route, widthKm, { units: "kilometers" }) as GeoJSON.Feature<GeoJSON.Polygon>;
        } else {
          let merged: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> = isochrones[0];
          for (let i = 1; i < isochrones.length; i++) {
            const unionResult = union(featureCollection([merged as GeoJSON.Feature<GeoJSON.Polygon>, isochrones[i]]));
            if (unionResult) merged = unionResult as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
          }

          if (merged.geometry.type === "MultiPolygon") {
            const allCoords: number[][] = [];
            for (const polyCoords of merged.geometry.coordinates) {
              for (const ring of polyCoords) allCoords.push(...ring);
            }
            const hull = convex(multiPoint(allCoords as [number, number][]));
            corridor = (hull ?? (buffer(route, widthKm, { units: "kilometers" }) as GeoJSON.Feature<GeoJSON.Polygon>));
          } else {
            corridor = merged as GeoJSON.Feature<GeoJSON.Polygon>;
          }
        }
      }

      const customers = await storage.getCustomers();
      const insideCustomerIds = customers
        .filter((customer) => customer.lat !== null && customer.lon !== null)
        .filter((customer) => booleanPointInPolygon(point([customer.lon!, customer.lat!]), corridor))
        .map((customer) => customer.id);

      return res.json({ route, alternativeRoutes, corridor, insideCustomerIds });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return res.status(504).json({ error: "Timeout ao calcular corredor" });
      }
      console.error("Corridor analysis error:", error);
      return res.status(500).json({ error: "Erro ao calcular corredor" });
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
