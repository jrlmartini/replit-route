import { useState, useCallback } from "react";
import { LeftSidebar } from "@/components/left-sidebar";
import { MapView } from "@/components/map-view";
import { RightPanel } from "@/components/right-panel";
import { CsvUploadModal } from "@/components/csv-upload-modal";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Customer } from "@shared/schema";
import * as turf from "@turf/turf";

export type ActiveTab = "isochrone" | "corridor";

export interface IsochroneState {
  origin: { lat: number; lon: number } | null;
  originAddress: string;
  minutes: number;
  polygon: GeoJSON.Feature<GeoJSON.Polygon> | null;
  isComputing: boolean;
}

export type CorridorMode = "distance" | "time";

export interface CorridorState {
  origin: { lat: number; lon: number } | null;
  originAddress: string;
  destination: { lat: number; lon: number } | null;
  destinationAddress: string;
  waypoints: Array<{ lat: number; lon: number; address: string }>;
  mode: CorridorMode;
  widthKm: number;
  timeMinutes: number;
  route: GeoJSON.Feature<GeoJSON.LineString> | null;
  alternativeRoutes: GeoJSON.Feature<GeoJSON.LineString>[];
  corridor: GeoJSON.Feature<GeoJSON.Polygon> | null;
  isComputing: boolean;
}

export interface LayerVisibility {
  customers: boolean;
  isochrone: boolean;
  route: boolean;
  corridor: boolean;
}

export default function Home() {
  const { toast } = useToast();
  
  // Active tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>("isochrone");
  
  // Map selection mode
  const [mapSelectionMode, setMapSelectionMode] = useState<"none" | "origin" | "destination" | "waypoint">("none");
  
  // CSV upload modal
  const [showCsvModal, setShowCsvModal] = useState(false);
  
  // Isochrone state
  const [isochroneState, setIsochroneState] = useState<IsochroneState>({
    origin: null,
    originAddress: "",
    minutes: 15,
    polygon: null,
    isComputing: false,
  });
  
  // Corridor state
  const [corridorState, setCorridorState] = useState<CorridorState>({
    origin: null,
    originAddress: "",
    destination: null,
    destinationAddress: "",
    waypoints: [],
    mode: "distance",
    widthKm: 10,
    timeMinutes: 15,
    route: null,
    alternativeRoutes: [],
    corridor: null,
    isComputing: false,
  });
  
  // Layer visibility
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({
    customers: true,
    isochrone: true,
    route: true,
    corridor: true,
  });
  
  // Filtered customers (inside polygon)
  const [filteredCustomerIds, setFilteredCustomerIds] = useState<Set<string>>(new Set());
  
  // Customer search
  const [searchQuery, setSearchQuery] = useState("");
  
  // Selected customer for map focus
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Fetch customers
  const { data: customers = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  // Geocoding progress state
  const [geocodingProgress, setGeocodingProgress] = useState<{
    current: number;
    total: number;
    isActive: boolean;
  }>({ current: 0, total: 0, isActive: false });

  // Geocode customers mutation
  const geocodeCustomersMutation = useMutation({
    mutationFn: async () => {
      const customersToGeocode = customers.filter(c => c.lat === null || c.lon === null);
      if (customersToGeocode.length === 0) {
        throw new Error("Não há clientes para geocodificar");
      }

      setGeocodingProgress({ current: 0, total: customersToGeocode.length, isActive: true });

      for (let i = 0; i < customersToGeocode.length; i++) {
        const customer = customersToGeocode[i];
        try {
          const fullAddress = customer.city;
          const response = await apiRequest("POST", "/api/ors/geocode", { address: fullAddress });
          const data = await response.json();
          
          if (data.lat && data.lon) {
            await apiRequest("PATCH", `/api/customers/${customer.id}`, {
              lat: data.lat,
              lon: data.lon,
            });
          }
        } catch (error) {
          console.error(`Failed to geocode ${customer.name}:`, error);
        }
        
        setGeocodingProgress(prev => ({ ...prev, current: i + 1 }));
        
        // Rate limiting: wait 1 second between requests
        if (i < customersToGeocode.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      setGeocodingProgress(prev => ({ ...prev, isActive: false }));
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Geocodificação concluída",
        description: "Coordenadas atualizadas com sucesso",
      });
    },
    onError: (error: Error) => {
      setGeocodingProgress(prev => ({ ...prev, isActive: false }));
      toast({
        title: "Erro na geocodificação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Compute isochrone
  const computeIsochrone = useCallback(async () => {
    if (!isochroneState.origin) {
      toast({
        title: "Origem necessária",
        description: "Selecione um ponto de origem no mapa ou digite um endereço",
        variant: "destructive",
      });
      return;
    }

    setIsochroneState(prev => ({ ...prev, isComputing: true }));

    try {
      const response = await apiRequest("POST", "/api/ors/isochrones", {
        lat: isochroneState.origin.lat,
        lon: isochroneState.origin.lon,
        minutes: isochroneState.minutes,
      });
      const data = await response.json();

      if (data.features && data.features.length > 0) {
        const polygon = data.features[0] as GeoJSON.Feature<GeoJSON.Polygon>;
        setIsochroneState(prev => ({ ...prev, polygon, isComputing: false }));

        // Filter customers inside polygon
        const insideIds = new Set<string>();
        customers.forEach(customer => {
          if (customer.lat && customer.lon) {
            const point = turf.point([customer.lon, customer.lat]);
            if (turf.booleanPointInPolygon(point, polygon)) {
              insideIds.add(customer.id);
            }
          }
        });
        setFilteredCustomerIds(insideIds);

        toast({
          title: "Isócrona calculada",
          description: `${insideIds.size} clientes encontrados dentro de ${isochroneState.minutes} minutos`,
        });
      }
    } catch (error) {
      console.error("Isochrone error:", error);
      setIsochroneState(prev => ({ ...prev, isComputing: false }));
      toast({
        title: "Erro ao calcular isócrona",
        description: "Verifique a conexão e tente novamente",
        variant: "destructive",
      });
    }
  }, [isochroneState.origin, isochroneState.minutes, customers, toast]);

  // Compute corridor
  const computeCorridor = useCallback(async () => {
    if (!corridorState.origin || !corridorState.destination) {
      toast({
        title: "Origem e destino necessários",
        description: "Selecione pontos de origem e destino",
        variant: "destructive",
      });
      return;
    }

    setCorridorState(prev => ({ ...prev, isComputing: true }));

    try {
      const coordinates: [number, number][] = [
        [corridorState.origin.lon, corridorState.origin.lat],
        ...corridorState.waypoints.map(wp => [wp.lon, wp.lat] as [number, number]),
        [corridorState.destination.lon, corridorState.destination.lat],
      ];

      const response = await apiRequest("POST", "/api/ors/directions", { coordinates });
      const data = await response.json();

      if (data.features && data.features.length > 0) {
        // Main route is the first one, alternatives follow
        const allRoutes = data.features as GeoJSON.Feature<GeoJSON.LineString>[];
        const route = allRoutes[0];
        const alternativeRoutes = allRoutes.slice(1);
        
        let corridor: GeoJSON.Feature<GeoJSON.Polygon>;
        let corridorDescription: string;

        if (corridorState.mode === "distance") {
          // Create corridor buffer by distance - using all routes
          const buffers: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
          
          for (const r of allRoutes) {
            const buffered = turf.buffer(r, corridorState.widthKm, { units: "kilometers" });
            if (buffered) {
              buffers.push(buffered as GeoJSON.Feature<GeoJSON.Polygon>);
            }
          }
          
          // Union all buffers into one corridor
          if (buffers.length === 1) {
            corridor = buffers[0];
          } else {
            let united: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> = buffers[0];
            for (let i = 1; i < buffers.length; i++) {
              try {
                const union = turf.union(turf.featureCollection([united as GeoJSON.Feature<GeoJSON.Polygon>, buffers[i]]));
                if (union) {
                  united = union as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
                }
              } catch {
                console.error("Failed to union route buffers");
              }
            }
            
            // Convert MultiPolygon to single polygon via convex hull if needed
            if (united.geometry.type === "MultiPolygon") {
              const allCoords: number[][] = [];
              for (const polyCoords of united.geometry.coordinates) {
                for (const ring of polyCoords) {
                  allCoords.push(...ring);
                }
              }
              const points = turf.multiPoint(allCoords as [number, number][]);
              const hull = turf.convex(points);
              corridor = hull ? hull as GeoJSON.Feature<GeoJSON.Polygon> : buffers[0];
            } else {
              corridor = united as GeoJSON.Feature<GeoJSON.Polygon>;
            }
          }
          
          corridorDescription = `corredor de ${corridorState.widthKm}km`;
        } else {
          // Create corridor by time - generate isochrones along the route
          // Sample points along the route and create isochrones for each
          const routeLength = turf.length(route, { units: "kilometers" });
          const numSamples = Math.max(2, Math.min(5, Math.ceil(routeLength / 50))); // Sample every ~50km
          const sampleDistance = routeLength / (numSamples - 1);
          
          const isochrones: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
          
          for (let i = 0; i < numSamples; i++) {
            const distance = i * sampleDistance;
            const point = turf.along(route, distance, { units: "kilometers" });
            const [lon, lat] = point.geometry.coordinates;
            
            try {
              const isoResponse = await apiRequest("POST", "/api/ors/isochrones", {
                lat,
                lon,
                minutes: corridorState.timeMinutes,
              });
              const isoData = await isoResponse.json();
              
              if (isoData.features && isoData.features.length > 0) {
                isochrones.push(isoData.features[0] as GeoJSON.Feature<GeoJSON.Polygon>);
              }
            } catch {
              console.error("Failed to get isochrone for point", i);
            }
            
            // Add delay between requests to respect rate limiting (1 req/second)
            if (i < numSamples - 1) {
              await new Promise(resolve => setTimeout(resolve, 1100));
            }
          }
          
          // Union all isochrones to create the corridor
          if (isochrones.length > 0) {
            // Start with first isochrone
            let corridorPolygons: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> = isochrones[0];
            
            for (let i = 1; i < isochrones.length; i++) {
              try {
                const union = turf.union(
                  turf.featureCollection([corridorPolygons as GeoJSON.Feature<GeoJSON.Polygon>, isochrones[i]])
                );
                if (union) {
                  corridorPolygons = union as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
                }
              } catch {
                console.error("Failed to union isochrones");
              }
            }
            
            // Convert to single Polygon for corridor (merge all polygons in MultiPolygon via convex hull as fallback)
            if (corridorPolygons.geometry.type === "MultiPolygon") {
              // Create a convex hull around all polygons to get a single polygon corridor
              const allCoords: number[][] = [];
              for (const polyCoords of corridorPolygons.geometry.coordinates) {
                for (const ring of polyCoords) {
                  allCoords.push(...ring);
                }
              }
              const points = turf.multiPoint(allCoords as [number, number][]);
              const hull = turf.convex(points);
              if (hull) {
                corridor = hull as GeoJSON.Feature<GeoJSON.Polygon>;
              } else {
                // Fallback: use buffer around route
                const buffered = turf.buffer(route, corridorState.widthKm, { units: "kilometers" });
                corridor = buffered as GeoJSON.Feature<GeoJSON.Polygon>;
              }
            } else {
              corridor = corridorPolygons as GeoJSON.Feature<GeoJSON.Polygon>;
            }
          } else {
            // Fallback to distance-based buffer if isochrones fail
            const buffered = turf.buffer(route, corridorState.widthKm, { units: "kilometers" });
            corridor = buffered as GeoJSON.Feature<GeoJSON.Polygon>;
          }
          
          corridorDescription = `corredor de ${corridorState.timeMinutes} minutos`;
        }

        setCorridorState(prev => ({ ...prev, route, alternativeRoutes, corridor, isComputing: false }));

        // Filter customers inside corridor and calculate distances
        const insideIds = new Set<string>();
        customers.forEach(customer => {
          if (customer.lat && customer.lon) {
            const point = turf.point([customer.lon, customer.lat]);
            if (turf.booleanPointInPolygon(point, corridor)) {
              insideIds.add(customer.id);
            }
          }
        });
        setFilteredCustomerIds(insideIds);

        toast({
          title: "Corredor calculado",
          description: `${insideIds.size} clientes encontrados no ${corridorDescription}`,
        });
      }
    } catch (error) {
      console.error("Corridor error:", error);
      setCorridorState(prev => ({ ...prev, isComputing: false }));
      toast({
        title: "Erro ao calcular corredor",
        description: "Verifique a conexão e tente novamente",
        variant: "destructive",
      });
    }
  }, [corridorState.origin, corridorState.destination, corridorState.waypoints, corridorState.mode, corridorState.widthKm, corridorState.timeMinutes, customers, toast]);

  // Handle map click for point selection
  const handleMapClick = useCallback((lat: number, lon: number) => {
    if (mapSelectionMode === "origin") {
      if (activeTab === "isochrone") {
        setIsochroneState(prev => ({
          ...prev,
          origin: { lat, lon },
          originAddress: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
        }));
      } else {
        setCorridorState(prev => ({
          ...prev,
          origin: { lat, lon },
          originAddress: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
        }));
      }
      setMapSelectionMode("none");
      toast({ title: "Origem selecionada" });
    } else if (mapSelectionMode === "destination") {
      setCorridorState(prev => ({
        ...prev,
        destination: { lat, lon },
        destinationAddress: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
      }));
      setMapSelectionMode("none");
      toast({ title: "Destino selecionado" });
    } else if (mapSelectionMode === "waypoint") {
      setCorridorState(prev => ({
        ...prev,
        waypoints: [...prev.waypoints, { lat, lon, address: `${lat.toFixed(5)}, ${lon.toFixed(5)}` }],
      }));
      setMapSelectionMode("none");
      toast({ title: "Ponto intermediário adicionado" });
    }
  }, [mapSelectionMode, activeTab, toast]);

  // Select customer as origin
  const selectCustomerAsOrigin = useCallback((customer: Customer) => {
    if (!customer.lat || !customer.lon) {
      toast({
        title: "Cliente sem coordenadas",
        description: "Este cliente precisa ser geocodificado primeiro",
        variant: "destructive",
      });
      return;
    }

    if (activeTab === "isochrone") {
      setIsochroneState(prev => ({
        ...prev,
        origin: { lat: customer.lat!, lon: customer.lon! },
        originAddress: `${customer.name}, ${customer.city}`,
      }));
    } else {
      setCorridorState(prev => ({
        ...prev,
        origin: { lat: customer.lat!, lon: customer.lon! },
        originAddress: `${customer.name}, ${customer.city}`,
      }));
    }
    toast({ title: `${customer.name} selecionado como origem` });
  }, [activeTab, toast]);

  // Geocode address
  const geocodeAddress = useCallback(async (address: string): Promise<{ lat: number; lon: number } | null> => {
    try {
      const response = await apiRequest("POST", "/api/ors/geocode", { address });
      const data = await response.json();
      if (data.lat && data.lon) {
        return { lat: data.lat, lon: data.lon };
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  // Calculate distance to route for a customer
  const getDistanceToRoute = useCallback((customer: Customer): number | null => {
    if (!customer.lat || !customer.lon || !corridorState.route) return null;
    
    const point = turf.point([customer.lon, customer.lat]);
    const distance = turf.pointToLineDistance(point, corridorState.route, { units: "kilometers" });
    return Math.round(distance * 10) / 10;
  }, [corridorState.route]);

  // Filter customers by search query
  const displayedCustomers = customers.filter(customer => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      customer.name.toLowerCase().includes(query) ||
      customer.city.toLowerCase().includes(query)
    );
  });

  // Get filtered customers for list panel
  const getFilteredCustomers = useCallback(() => {
    if (filteredCustomerIds.size === 0) return displayedCustomers;
    return displayedCustomers.filter(c => filteredCustomerIds.has(c.id));
  }, [displayedCustomers, filteredCustomerIds]);

  // Clear current analysis
  const clearAnalysis = useCallback(() => {
    if (activeTab === "isochrone") {
      setIsochroneState(prev => ({
        ...prev,
        polygon: null,
      }));
    } else {
      setCorridorState(prev => ({
        ...prev,
        route: null,
        corridor: null,
      }));
    }
    setFilteredCustomerIds(new Set());
  }, [activeTab]);

  // Export filtered customers to CSV
  const exportToCsv = useCallback(() => {
    const filtered = getFilteredCustomers();
    if (filtered.length === 0) {
      toast({
        title: "Nenhum cliente para exportar",
        description: "Realize uma análise primeiro",
        variant: "destructive",
      });
      return;
    }

    const headers = ["Nome", "Cidade", "Latitude", "Longitude"];
    if (activeTab === "corridor" && corridorState.route) {
      headers.push("Distância até Rota (km)");
    }

    const rows = filtered.map(c => {
      const row = [c.name, c.city, c.lat?.toString() || "", c.lon?.toString() || ""];
      if (activeTab === "corridor" && corridorState.route) {
        const dist = getDistanceToRoute(c);
        row.push(dist !== null ? dist.toString() : "");
      }
      return row;
    });

    const csv = [headers.join(","), ...rows.map(r => r.map(cell => `"${cell}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `clientes_${activeTab}_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: "CSV exportado",
      description: `${filtered.length} clientes exportados`,
    });
  }, [getFilteredCustomers, activeTab, corridorState.route, getDistanceToRoute, toast]);

  // Count customers needing geocoding
  const customersNeedingGeocode = customers.filter(c => c.lat === null || c.lon === null).length;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background" data-testid="home-page">
      {/* Left Sidebar */}
      <LeftSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isochroneState={isochroneState}
        setIsochroneState={setIsochroneState}
        corridorState={corridorState}
        setCorridorState={setCorridorState}
        layerVisibility={layerVisibility}
        setLayerVisibility={setLayerVisibility}
        mapSelectionMode={mapSelectionMode}
        setMapSelectionMode={setMapSelectionMode}
        onComputeIsochrone={computeIsochrone}
        onComputeCorridor={computeCorridor}
        onClearAnalysis={clearAnalysis}
        onGeocodeAddress={geocodeAddress}
        onOpenCsvModal={() => setShowCsvModal(true)}
        onGeocodeCustomers={() => geocodeCustomersMutation.mutate()}
        geocodingProgress={geocodingProgress}
        customersCount={customers.length}
        customersNeedingGeocode={customersNeedingGeocode}
      />

      {/* Map */}
      <div className="flex-1 relative">
        <MapView
          customers={customers}
          filteredCustomerIds={filteredCustomerIds}
          isochronePolygon={layerVisibility.isochrone ? isochroneState.polygon : null}
          route={layerVisibility.route ? corridorState.route : null}
          alternativeRoutes={layerVisibility.route ? corridorState.alternativeRoutes : []}
          corridorPolygon={layerVisibility.corridor ? corridorState.corridor : null}
          showCustomers={layerVisibility.customers}
          isochroneOrigin={isochroneState.origin}
          corridorOrigin={corridorState.origin}
          corridorDestination={corridorState.destination}
          corridorWaypoints={corridorState.waypoints}
          mapSelectionMode={mapSelectionMode}
          onMapClick={handleMapClick}
          selectedCustomerId={selectedCustomerId}
          onCustomerSelect={setSelectedCustomerId}
          onSelectAsOrigin={selectCustomerAsOrigin}
          activeTab={activeTab}
        />
      </div>

      {/* Right Panel */}
      <RightPanel
        customers={getFilteredCustomers()}
        allCustomersCount={customers.length}
        isLoading={customersLoading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onCustomerClick={(customer: Customer) => setSelectedCustomerId(customer.id)}
        onExportCsv={exportToCsv}
        selectedCustomerId={selectedCustomerId}
        activeTab={activeTab}
        hasActiveAnalysis={
          (activeTab === "isochrone" && isochroneState.polygon !== null) ||
          (activeTab === "corridor" && corridorState.corridor !== null)
        }
        getDistanceToRoute={getDistanceToRoute}
      />

      {/* CSV Upload Modal */}
      <CsvUploadModal
        open={showCsvModal}
        onClose={() => setShowCsvModal(false)}
      />
    </div>
  );
}
