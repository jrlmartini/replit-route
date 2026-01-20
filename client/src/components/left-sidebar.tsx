import { Clock, Route, MapPin, Upload, Layers, Search, X, ChevronDown, Ruler, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { ActiveTab, IsochroneState, CorridorState, LayerVisibility, CorridorMode } from "@/pages/home";
import { useState } from "react";

interface LeftSidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  isochroneState: IsochroneState;
  setIsochroneState: React.Dispatch<React.SetStateAction<IsochroneState>>;
  corridorState: CorridorState;
  setCorridorState: React.Dispatch<React.SetStateAction<CorridorState>>;
  layerVisibility: LayerVisibility;
  setLayerVisibility: React.Dispatch<React.SetStateAction<LayerVisibility>>;
  mapSelectionMode: "none" | "origin" | "destination" | "waypoint";
  setMapSelectionMode: (mode: "none" | "origin" | "destination" | "waypoint") => void;
  onComputeIsochrone: () => void;
  onComputeCorridor: () => void;
  onClearAnalysis: () => void;
  onGeocodeAddress: (address: string) => Promise<{ lat: number; lon: number } | null>;
  onOpenCsvModal: () => void;
  onGeocodeCustomers: () => void;
  geocodingProgress: { current: number; total: number; isActive: boolean };
  customersCount: number;
  customersNeedingGeocode: number;
}

export function LeftSidebar({
  activeTab,
  onTabChange,
  isochroneState,
  setIsochroneState,
  corridorState,
  setCorridorState,
  layerVisibility,
  setLayerVisibility,
  mapSelectionMode,
  setMapSelectionMode,
  onComputeIsochrone,
  onComputeCorridor,
  onClearAnalysis,
  onGeocodeAddress,
  onOpenCsvModal,
  onGeocodeCustomers,
  geocodingProgress,
  customersCount,
  customersNeedingGeocode,
}: LeftSidebarProps) {
  const [layersOpen, setLayersOpen] = useState(true);
  const [isGeocodingOrigin, setIsGeocodingOrigin] = useState(false);
  const [isGeocodingDestination, setIsGeocodingDestination] = useState(false);

  const handleOriginAddressBlur = async (address: string) => {
    if (!address.trim()) return;
    setIsGeocodingOrigin(true);
    const result = await onGeocodeAddress(address);
    setIsGeocodingOrigin(false);
    if (result) {
      if (activeTab === "isochrone") {
        setIsochroneState(prev => ({
          ...prev,
          origin: result,
          originAddress: address,
        }));
      } else {
        setCorridorState(prev => ({
          ...prev,
          origin: result,
          originAddress: address,
        }));
      }
    }
  };

  const handleDestinationAddressBlur = async (address: string) => {
    if (!address.trim()) return;
    setIsGeocodingDestination(true);
    const result = await onGeocodeAddress(address);
    setIsGeocodingDestination(false);
    if (result) {
      setCorridorState(prev => ({
        ...prev,
        destination: result,
        destinationAddress: address,
      }));
    }
  };

  return (
    <aside 
      className="w-80 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col h-full overflow-hidden"
      data-testid="left-sidebar"
    >
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <h1 className="text-lg font-semibold text-sidebar-foreground flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary" />
          Geo-CRM Map
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Análise de rotas e cobertura
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-sidebar-border">
        <button
          onClick={() => onTabChange("isochrone")}
          className={cn(
            "flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors",
            activeTab === "isochrone"
              ? "text-primary border-b-2 border-primary bg-sidebar-accent/50"
              : "text-muted-foreground hover-elevate"
          )}
          data-testid="tab-isochrone"
        >
          <Clock className="w-4 h-4" />
          Raio de Tempo
        </button>
        <button
          onClick={() => onTabChange("corridor")}
          className={cn(
            "flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors",
            activeTab === "corridor"
              ? "text-primary border-b-2 border-primary bg-sidebar-accent/50"
              : "text-muted-foreground hover-elevate"
          )}
          data-testid="tab-corridor"
        >
          <Route className="w-4 h-4" />
          Corredor
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Isochrone Tab */}
        {activeTab === "isochrone" && (
          <div className="space-y-4" data-testid="isochrone-controls">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Ponto de origem</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Digite o endereço..."
                    value={isochroneState.originAddress}
                    onChange={(e) => setIsochroneState(prev => ({ ...prev, originAddress: e.target.value }))}
                    onBlur={(e) => handleOriginAddressBlur(e.target.value)}
                    className="pl-9"
                    disabled={isGeocodingOrigin}
                    data-testid="input-isochrone-origin"
                  />
                </div>
                <Button
                  size="icon"
                  variant={mapSelectionMode === "origin" && activeTab === "isochrone" ? "default" : "outline"}
                  onClick={() => setMapSelectionMode(mapSelectionMode === "origin" ? "none" : "origin")}
                  title="Selecionar no mapa"
                  data-testid="button-select-origin-map"
                >
                  <MapPin className="w-4 h-4" />
                </Button>
              </div>
              {isochroneState.origin && (
                <p className="text-xs text-muted-foreground">
                  Coordenadas: {isochroneState.origin.lat.toFixed(5)}, {isochroneState.origin.lon.toFixed(5)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Tempo de viagem: {isochroneState.minutes} minutos
              </Label>
              <Slider
                value={[isochroneState.minutes]}
                onValueChange={([value]) => setIsochroneState(prev => ({ ...prev, minutes: value }))}
                min={5}
                max={60}
                step={5}
                className="py-2"
                data-testid="slider-isochrone-minutes"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>5 min</span>
                <span>60 min</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={onComputeIsochrone}
                disabled={!isochroneState.origin || isochroneState.isComputing}
                data-testid="button-compute-isochrone"
              >
                {isochroneState.isComputing ? "Calculando..." : "Calcular"}
              </Button>
              {isochroneState.polygon && (
                <Button variant="outline" onClick={onClearAnalysis} data-testid="button-clear-isochrone">
                  Limpar
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Corridor Tab */}
        {activeTab === "corridor" && (
          <div className="space-y-4" data-testid="corridor-controls">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Origem</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Endereço de origem..."
                    value={corridorState.originAddress}
                    onChange={(e) => setCorridorState(prev => ({ ...prev, originAddress: e.target.value }))}
                    onBlur={(e) => handleOriginAddressBlur(e.target.value)}
                    className="pl-9"
                    disabled={isGeocodingOrigin}
                    data-testid="input-corridor-origin"
                  />
                </div>
                <Button
                  size="icon"
                  variant={mapSelectionMode === "origin" && activeTab === "corridor" ? "default" : "outline"}
                  onClick={() => setMapSelectionMode(mapSelectionMode === "origin" ? "none" : "origin")}
                  title="Selecionar no mapa"
                  data-testid="button-select-corridor-origin"
                >
                  <MapPin className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Destino</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Endereço de destino..."
                    value={corridorState.destinationAddress}
                    onChange={(e) => setCorridorState(prev => ({ ...prev, destinationAddress: e.target.value }))}
                    onBlur={(e) => handleDestinationAddressBlur(e.target.value)}
                    className="pl-9"
                    disabled={isGeocodingDestination}
                    data-testid="input-corridor-destination"
                  />
                </div>
                <Button
                  size="icon"
                  variant={mapSelectionMode === "destination" ? "default" : "outline"}
                  onClick={() => setMapSelectionMode(mapSelectionMode === "destination" ? "none" : "destination")}
                  title="Selecionar no mapa"
                  data-testid="button-select-corridor-destination"
                >
                  <MapPin className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Waypoints */}
            {corridorState.waypoints.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Pontos intermediários</Label>
                {corridorState.waypoints.map((wp, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate text-muted-foreground">{wp.address}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setCorridorState(prev => ({
                          ...prev,
                          waypoints: prev.waypoints.filter((_, i) => i !== idx),
                        }));
                      }}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {corridorState.waypoints.length < 3 && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setMapSelectionMode("waypoint")}
                data-testid="button-add-waypoint"
              >
                + Adicionar ponto intermediário
              </Button>
            )}

            {/* Mode selector */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Tipo de corredor</Label>
              <div className="flex gap-2">
                <Button
                  variant={corridorState.mode === "distance" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setCorridorState(prev => ({ ...prev, mode: "distance" as CorridorMode }))}
                  data-testid="button-mode-distance"
                >
                  <Ruler className="w-4 h-4 mr-1" />
                  Distância
                </Button>
                <Button
                  variant={corridorState.mode === "time" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setCorridorState(prev => ({ ...prev, mode: "time" as CorridorMode }))}
                  data-testid="button-mode-time"
                >
                  <Timer className="w-4 h-4 mr-1" />
                  Tempo
                </Button>
              </div>
            </div>

            {/* Distance slider (visible when mode is distance) */}
            {corridorState.mode === "distance" && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Largura do corredor: {corridorState.widthKm} km
                </Label>
                <Slider
                  value={[corridorState.widthKm]}
                  onValueChange={([value]) => setCorridorState(prev => ({ ...prev, widthKm: value }))}
                  min={2}
                  max={30}
                  step={1}
                  className="py-2"
                  data-testid="slider-corridor-width"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>2 km</span>
                  <span>30 km</span>
                </div>
              </div>
            )}

            {/* Time slider (visible when mode is time) */}
            {corridorState.mode === "time" && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Tempo de acesso: {corridorState.timeMinutes} minutos
                </Label>
                <Slider
                  value={[corridorState.timeMinutes]}
                  onValueChange={([value]) => setCorridorState(prev => ({ ...prev, timeMinutes: value }))}
                  min={5}
                  max={60}
                  step={5}
                  className="py-2"
                  data-testid="slider-corridor-time"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>5 min</span>
                  <span>60 min</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Calcula isócronas ao longo da rota
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={onComputeCorridor}
                disabled={!corridorState.origin || !corridorState.destination || corridorState.isComputing}
                data-testid="button-compute-corridor"
              >
                {corridorState.isComputing ? "Calculando..." : "Calcular Rota"}
              </Button>
              {corridorState.corridor && (
                <Button variant="outline" onClick={onClearAnalysis} data-testid="button-clear-corridor">
                  Limpar
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Layers Control */}
        <Collapsible open={layersOpen} onOpenChange={setLayersOpen}>
          <Card className="p-3">
            <CollapsibleTrigger asChild>
              <button className="flex items-center justify-between w-full text-sm font-medium">
                <span className="flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  Camadas
                </span>
                <ChevronDown className={cn("w-4 h-4 transition-transform", layersOpen && "rotate-180")} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="layer-customers"
                  checked={layerVisibility.customers}
                  onCheckedChange={(checked) => 
                    setLayerVisibility(prev => ({ ...prev, customers: !!checked }))
                  }
                  data-testid="checkbox-layer-customers"
                />
                <Label htmlFor="layer-customers" className="text-sm cursor-pointer">
                  Clientes
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="layer-isochrone"
                  checked={layerVisibility.isochrone}
                  onCheckedChange={(checked) => 
                    setLayerVisibility(prev => ({ ...prev, isochrone: !!checked }))
                  }
                  data-testid="checkbox-layer-isochrone"
                />
                <Label htmlFor="layer-isochrone" className="text-sm cursor-pointer">
                  Isócrona
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="layer-route"
                  checked={layerVisibility.route}
                  onCheckedChange={(checked) => 
                    setLayerVisibility(prev => ({ ...prev, route: !!checked }))
                  }
                  data-testid="checkbox-layer-route"
                />
                <Label htmlFor="layer-route" className="text-sm cursor-pointer">
                  Rota
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="layer-corridor"
                  checked={layerVisibility.corridor}
                  onCheckedChange={(checked) => 
                    setLayerVisibility(prev => ({ ...prev, corridor: !!checked }))
                  }
                  data-testid="checkbox-layer-corridor"
                />
                <Label htmlFor="layer-corridor" className="text-sm cursor-pointer">
                  Corredor
                </Label>
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Customer Management */}
        <Card className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Clientes</span>
            <span className="text-xs text-muted-foreground">{customersCount} registros</span>
          </div>
          
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={onOpenCsvModal}
            data-testid="button-upload-csv"
          >
            <Upload className="w-4 h-4 mr-2" />
            Importar CSV
          </Button>

          {customersNeedingGeocode > 0 && (
            <div className="space-y-2">
              <Button
                variant="secondary"
                className="w-full justify-start"
                onClick={onGeocodeCustomers}
                disabled={geocodingProgress.isActive}
                data-testid="button-geocode-customers"
              >
                <Search className="w-4 h-4 mr-2" />
                Geocodificar ({customersNeedingGeocode})
              </Button>
              
              {geocodingProgress.isActive && (
                <div className="space-y-1">
                  <Progress 
                    value={(geocodingProgress.current / geocodingProgress.total) * 100} 
                    className="h-2"
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    {geocodingProgress.current} / {geocodingProgress.total} geocodificados
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Map Selection Mode Indicator */}
      {mapSelectionMode !== "none" && (
        <div className="p-3 bg-primary/10 border-t border-primary/20">
          <div className="flex items-center justify-between">
            <span className="text-sm text-primary font-medium">
              {mapSelectionMode === "origin" && "Clique no mapa para selecionar origem"}
              {mapSelectionMode === "destination" && "Clique no mapa para selecionar destino"}
              {mapSelectionMode === "waypoint" && "Clique no mapa para adicionar ponto"}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMapSelectionMode("none")}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
