import { useMemo } from "react";
import { Search, Download, MapPin, Users, Clock, Route } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Customer } from "@shared/schema";
import type { ActiveTab } from "@/pages/home";

interface RightPanelProps {
  customers: Customer[];
  allCustomersCount: number;
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onCustomerClick: (customer: Customer) => void;
  onExportCsv: () => void;
  selectedCustomerId: string | null;
  activeTab: ActiveTab;
  hasActiveAnalysis: boolean;
  getDistanceToRoute: (customer: Customer) => number | null;
}

export function RightPanel({
  customers,
  allCustomersCount,
  isLoading,
  searchQuery,
  onSearchChange,
  onCustomerClick,
  onExportCsv,
  selectedCustomerId,
  activeTab,
  hasActiveAnalysis,
  getDistanceToRoute,
}: RightPanelProps) {
  const distanceByCustomerId = useMemo(() => {
    if (activeTab !== "corridor" || !hasActiveAnalysis) return new Map<string, number | null>();

    const result = new Map<string, number | null>();
    for (const customer of customers) {
      result.set(customer.id, getDistanceToRoute(customer));
    }
    return result;
  }, [activeTab, hasActiveAnalysis, customers, getDistanceToRoute]);

  // Sort customers by distance to route if in corridor mode
  const sortedCustomers = useMemo(() => {
    if (activeTab !== "corridor" || !hasActiveAnalysis) return customers;

    return [...customers].sort((a, b) => {
      const distA = distanceByCustomerId.get(a.id) ?? null;
      const distB = distanceByCustomerId.get(b.id) ?? null;
      if (distA === null && distB === null) return 0;
      if (distA === null) return 1;
      if (distB === null) return -1;
      return distA - distB;
    });
  }, [activeTab, hasActiveAnalysis, customers, distanceByCustomerId]);

  return (
    <aside 
      className="w-96 flex-shrink-0 bg-card border-l border-card-border flex flex-col h-full overflow-hidden"
      data-testid="right-panel"
    >
      {/* Header */}
      <div className="p-4 border-b border-card-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-base font-medium">Clientes</h2>
          </div>
          <Badge variant="secondary" className="text-xs">
            {hasActiveAnalysis ? `${customers.length} de ${allCustomersCount}` : allCustomersCount}
          </Badge>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
            data-testid="input-search-customers"
          />
        </div>

        {/* Analysis indicator */}
        {hasActiveAnalysis && (
          <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-md">
            {activeTab === "isochrone" ? (
              <>
                <Clock className="w-4 h-4 text-primary" />
                <span className="text-sm text-primary font-medium">
                  Clientes dentro do raio de tempo
                </span>
              </>
            ) : (
              <>
                <Route className="w-4 h-4 text-primary" />
                <span className="text-sm text-primary font-medium">
                  Clientes no corredor da rota
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Customer List */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="p-3 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : sortedCustomers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <Users className="w-12 h-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-sm font-medium text-muted-foreground">
                {allCustomersCount === 0
                  ? "Nenhum cliente cadastrado"
                  : hasActiveAnalysis
                  ? "Nenhum cliente encontrado na área"
                  : "Nenhum resultado encontrado"}
              </h3>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {allCustomersCount === 0
                  ? "Importe um arquivo CSV para começar"
                  : hasActiveAnalysis
                  ? "Ajuste os parâmetros da análise"
                  : "Tente outro termo de busca"}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {sortedCustomers.map(customer => {
                const distance = activeTab === "corridor" && hasActiveAnalysis
                  ? distanceByCustomerId.get(customer.id) ?? null
                  : null;
                const hasCoords = customer.lat !== null && customer.lon !== null;

                return (
                  <button
                    key={customer.id}
                    onClick={() => onCustomerClick(customer)}
                    className={cn(
                      "w-full text-left p-3 rounded-md transition-colors hover-elevate",
                      selectedCustomerId === customer.id && "bg-accent"
                    )}
                    data-testid={`customer-item-${customer.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {customer.name}
                          </span>
                          {!hasCoords && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              Sem coord.
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {customer.city}
                        </p>
                      </div>
                      {distance !== null && (
                        <Badge variant="secondary" className="text-xs flex-shrink-0">
                          <MapPin className="w-3 h-3 mr-1" />
                          {distance} km
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer Actions */}
      {(sortedCustomers.length > 0 || hasActiveAnalysis) && (
        <div className="p-4 border-t border-card-border">
          <Button
            className="w-full"
            onClick={onExportCsv}
            disabled={sortedCustomers.length === 0}
            data-testid="button-export-csv"
          >
            <Download className="w-4 h-4 mr-2" />
            Exportar CSV ({sortedCustomers.length})
          </Button>
        </div>
      )}
    </aside>
  );
}
