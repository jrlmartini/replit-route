import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import type { Customer } from "@shared/schema";
import type { ActiveTab } from "@/pages/home";

// Extend Leaflet types for marker cluster
declare module "leaflet" {
  function markerClusterGroup(options?: any): any;
}

// Fix default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// Custom icons
const createIcon = (color: string) => L.divIcon({
  className: "custom-marker",
  html: `<div style="
    width: 24px;
    height: 24px;
    background: ${color};
    border: 2px solid white;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  "></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  popupAnchor: [0, -24],
});

const customerIcon = createIcon("hsl(210, 85%, 42%)");
const customerHighlightIcon = createIcon("hsl(150, 65%, 35%)");
const customerDimmedIcon = createIcon("hsl(0, 0%, 70%)");
const originIcon = createIcon("hsl(0, 72%, 50%)");
const destinationIcon = createIcon("hsl(270, 65%, 50%)");
const waypointIcon = createIcon("hsl(30, 75%, 50%)");

interface MapViewProps {
  customers: Customer[];
  filteredCustomerIds: Set<string>;
  isochronePolygon: GeoJSON.Feature<GeoJSON.Polygon> | null;
  route: GeoJSON.Feature<GeoJSON.LineString> | null;
  alternativeRoutes: GeoJSON.Feature<GeoJSON.LineString>[];
  corridorPolygon: GeoJSON.Feature<GeoJSON.Polygon> | null;
  showCustomers: boolean;
  isochroneOrigin: { lat: number; lon: number } | null;
  corridorOrigin: { lat: number; lon: number } | null;
  corridorDestination: { lat: number; lon: number } | null;
  corridorWaypoints: Array<{ lat: number; lon: number; address: string }>;
  mapSelectionMode: "none" | "origin" | "destination" | "waypoint";
  onMapClick: (lat: number, lon: number) => void;
  selectedCustomerId: string | null;
  onCustomerSelect: (id: string | null) => void;
  onSelectAsOrigin: (customer: Customer) => void;
  activeTab: ActiveTab;
}

export function MapView({
  customers,
  filteredCustomerIds,
  isochronePolygon,
  route,
  alternativeRoutes,
  corridorPolygon,
  showCustomers,
  isochroneOrigin,
  corridorOrigin,
  corridorDestination,
  corridorWaypoints,
  mapSelectionMode,
  onMapClick,
  selectedCustomerId,
  onCustomerSelect,
  onSelectAsOrigin,
  activeTab,
}: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const clusterGroupRef = useRef<any>(null);
  const isochroneLayerRef = useRef<L.GeoJSON | null>(null);
  const routeLayerRef = useRef<L.GeoJSON | null>(null);
  const altRoutesLayerRef = useRef<L.GeoJSON[]>([]);
  const corridorLayerRef = useRef<L.GeoJSON | null>(null);
  const originMarkerRef = useRef<L.Marker | null>(null);
  const destinationMarkerRef = useRef<L.Marker | null>(null);
  const waypointMarkersRef = useRef<L.Marker[]>([]);
  const tempMarkerRef = useRef<L.Marker | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [-23.5505, -46.6333], // São Paulo, Brazil
      zoom: 10,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Create cluster group
    const clusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 16,
    });
    map.addLayer(clusterGroup);
    clusterGroupRef.current = clusterGroup;

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Handle map click
  useEffect(() => {
    if (!mapRef.current) return;

    const handleClick = (e: L.LeafletMouseEvent) => {
      if (mapSelectionMode !== "none") {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    };

    mapRef.current.on("click", handleClick);
    return () => {
      mapRef.current?.off("click", handleClick);
    };
  }, [mapSelectionMode, onMapClick]);

  // Update cursor based on selection mode
  useEffect(() => {
    if (!mapContainerRef.current) return;
    mapContainerRef.current.style.cursor = mapSelectionMode !== "none" ? "crosshair" : "";
  }, [mapSelectionMode]);

  // Update customer markers
  useEffect(() => {
    if (!clusterGroupRef.current) return;

    clusterGroupRef.current.clearLayers();

    if (!showCustomers) return;

    const hasFilter = filteredCustomerIds.size > 0;

    customers.forEach(customer => {
      if (customer.lat === null || customer.lon === null) return;

      let icon = customerIcon;
      if (hasFilter) {
        icon = filteredCustomerIds.has(customer.id) ? customerHighlightIcon : customerDimmedIcon;
      }

      const marker = L.marker([customer.lat, customer.lon], { icon });
      
      marker.bindPopup(`
        <div style="min-width: 180px;">
          <strong style="font-size: 14px;">${customer.name}</strong>
          <p style="margin: 4px 0; font-size: 12px; color: #666;">${customer.city}</p>
          <p style="margin: 4px 0; font-size: 12px; color: #666;">
            ${customer.lat?.toFixed(5)}, ${customer.lon?.toFixed(5)}
          </p>
          <button 
            onclick="window.dispatchEvent(new CustomEvent('selectAsOrigin', { detail: '${customer.id}' }))"
            style="
              margin-top: 8px;
              padding: 4px 8px;
              background: hsl(210, 85%, 42%);
              color: white;
              border: none;
              border-radius: 4px;
              font-size: 12px;
              cursor: pointer;
            "
          >
            Usar como origem
          </button>
        </div>
      `);

      marker.on("click", () => {
        onCustomerSelect(customer.id);
      });

      clusterGroupRef.current!.addLayer(marker);
    });
  }, [customers, showCustomers, filteredCustomerIds, onCustomerSelect]);

  // Handle "select as origin" event
  useEffect(() => {
    const handleSelectAsOrigin = (e: CustomEvent<string>) => {
      const customer = customers.find(c => c.id === e.detail);
      if (customer) {
        onSelectAsOrigin(customer);
      }
    };

    window.addEventListener("selectAsOrigin", handleSelectAsOrigin as EventListener);
    return () => {
      window.removeEventListener("selectAsOrigin", handleSelectAsOrigin as EventListener);
    };
  }, [customers, onSelectAsOrigin]);

  // Pan to selected customer
  useEffect(() => {
    if (!mapRef.current || !selectedCustomerId) return;

    const customer = customers.find(c => c.id === selectedCustomerId);
    if (customer?.lat && customer?.lon) {
      mapRef.current.setView([customer.lat, customer.lon], 15);
    }
  }, [selectedCustomerId, customers]);

  // Update isochrone polygon
  useEffect(() => {
    if (!mapRef.current) return;

    if (isochroneLayerRef.current) {
      mapRef.current.removeLayer(isochroneLayerRef.current);
      isochroneLayerRef.current = null;
    }

    if (isochronePolygon) {
      isochroneLayerRef.current = L.geoJSON(isochronePolygon, {
        style: {
          fillColor: "hsl(210, 85%, 42%)",
          fillOpacity: 0.2,
          color: "hsl(210, 85%, 42%)",
          weight: 2,
        },
      }).addTo(mapRef.current);
    }
  }, [isochronePolygon]);

  // Update route and alternative routes
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear existing route layers
    if (routeLayerRef.current) {
      mapRef.current.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }
    
    // Clear existing alternative route layers
    altRoutesLayerRef.current.forEach(layer => {
      mapRef.current!.removeLayer(layer);
    });
    altRoutesLayerRef.current = [];

    // Add alternative routes first (so they appear behind main route)
    if (alternativeRoutes && alternativeRoutes.length > 0) {
      alternativeRoutes.forEach((altRoute, index) => {
        const layer = L.geoJSON(altRoute, {
          style: {
            color: "hsl(270, 65%, 60%)",
            weight: 3,
            opacity: 0.5,
            dashArray: "8, 8",
          },
        }).addTo(mapRef.current!);
        
        // Add popup to identify the alternative route
        layer.bindPopup(`Rota alternativa ${index + 1}`);
        altRoutesLayerRef.current.push(layer);
      });
    }

    // Add main route on top
    if (route) {
      routeLayerRef.current = L.geoJSON(route, {
        style: {
          color: "hsl(270, 65%, 40%)",
          weight: 4,
          opacity: 0.9,
        },
      }).addTo(mapRef.current);
      
      routeLayerRef.current.bindPopup("Rota principal");
    }
  }, [route, alternativeRoutes]);

  // Update corridor polygon
  useEffect(() => {
    if (!mapRef.current) return;

    if (corridorLayerRef.current) {
      mapRef.current.removeLayer(corridorLayerRef.current);
      corridorLayerRef.current = null;
    }

    if (corridorPolygon) {
      corridorLayerRef.current = L.geoJSON(corridorPolygon, {
        style: {
          fillColor: "hsl(150, 65%, 35%)",
          fillOpacity: 0.15,
          color: "hsl(150, 65%, 35%)",
          weight: 2,
          dashArray: "5, 5",
        },
      }).addTo(mapRef.current);
    }
  }, [corridorPolygon]);

  // Update origin marker
  useEffect(() => {
    if (!mapRef.current) return;

    if (originMarkerRef.current) {
      mapRef.current.removeLayer(originMarkerRef.current);
      originMarkerRef.current = null;
    }

    const origin = activeTab === "isochrone" ? isochroneOrigin : corridorOrigin;
    if (origin) {
      originMarkerRef.current = L.marker([origin.lat, origin.lon], { icon: originIcon })
        .bindPopup("Origem")
        .addTo(mapRef.current);
    }
  }, [isochroneOrigin, corridorOrigin, activeTab]);

  // Update destination marker
  useEffect(() => {
    if (!mapRef.current) return;

    if (destinationMarkerRef.current) {
      mapRef.current.removeLayer(destinationMarkerRef.current);
      destinationMarkerRef.current = null;
    }

    if (corridorDestination && activeTab === "corridor") {
      destinationMarkerRef.current = L.marker([corridorDestination.lat, corridorDestination.lon], { icon: destinationIcon })
        .bindPopup("Destino")
        .addTo(mapRef.current);
    }
  }, [corridorDestination, activeTab]);

  // Update waypoint markers
  useEffect(() => {
    if (!mapRef.current) return;

    waypointMarkersRef.current.forEach(m => mapRef.current!.removeLayer(m));
    waypointMarkersRef.current = [];

    if (activeTab === "corridor") {
      corridorWaypoints.forEach((wp, idx) => {
        const marker = L.marker([wp.lat, wp.lon], { icon: waypointIcon })
          .bindPopup(`Ponto intermediário ${idx + 1}`)
          .addTo(mapRef.current!);
        waypointMarkersRef.current.push(marker);
      });
    }
  }, [corridorWaypoints, activeTab]);

  // Fit bounds when polygons change
  useEffect(() => {
    if (!mapRef.current) return;

    const bounds: L.LatLngBounds | null = null;
    
    if (isochronePolygon && isochroneLayerRef.current) {
      mapRef.current.fitBounds(isochroneLayerRef.current.getBounds(), { padding: [50, 50] });
    } else if (corridorPolygon && corridorLayerRef.current) {
      mapRef.current.fitBounds(corridorLayerRef.current.getBounds(), { padding: [50, 50] });
    }
  }, [isochronePolygon, corridorPolygon]);

  return (
    <div 
      ref={mapContainerRef} 
      className="w-full h-full"
      data-testid="map-container"
    />
  );
}
