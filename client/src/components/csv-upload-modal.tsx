import { useState, useCallback } from "react";
import { Upload, FileText, X, Check, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Papa from "papaparse";
import type { ColumnMapping } from "@shared/schema";

interface CsvUploadModalProps {
  open: boolean;
  onClose: () => void;
}

type UploadStep = "upload" | "mapping" | "importing";

export function CsvUploadModal({ open, onClose }: CsvUploadModalProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<UploadStep>("upload");
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    name: "",
    address: "",
    city: "",
  });
  const [importProgress, setImportProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const resetState = () => {
    setStep("upload");
    setCsvData([]);
    setHeaders([]);
    setColumnMapping({ name: "", address: "", city: "" });
    setImportProgress(0);
    setError(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, []);

  const processFile = (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setError("Por favor, selecione um arquivo CSV");
      return;
    }

    setError(null);
    Papa.parse(file, {
      complete: (results) => {
        const data = results.data as string[][];
        if (data.length < 2) {
          setError("O arquivo está vazio ou não possui dados suficientes");
          return;
        }

        const fileHeaders = data[0].map(h => h.trim());
        setHeaders(fileHeaders);
        setCsvData(data.slice(1).filter(row => row.some(cell => cell.trim())));

        // Try to auto-map common column names
        const autoMapping: ColumnMapping = { name: "", address: "", city: "" };
        
        fileHeaders.forEach(header => {
          const h = header.toLowerCase();
          if (h.includes("nome") || h.includes("name") || h === "cliente") {
            autoMapping.name = header;
          } else if (h.includes("endereço") || h.includes("endereco") || h.includes("address") || h === "rua") {
            autoMapping.address = header;
          } else if (h.includes("cidade") || h.includes("city") || h === "municipio" || h.includes("município")) {
            autoMapping.city = header;
          } else if (h === "lat" || h.includes("latitude")) {
            autoMapping.lat = header;
          } else if (h === "lon" || h === "lng" || h.includes("longitude")) {
            autoMapping.lon = header;
          }
        });

        setColumnMapping(autoMapping);
        setStep("mapping");
      },
      error: () => {
        setError("Erro ao processar o arquivo CSV");
      },
    });
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      setStep("importing");
      
      const nameIdx = headers.indexOf(columnMapping.name);
      const addressIdx = headers.indexOf(columnMapping.address);
      const cityIdx = headers.indexOf(columnMapping.city);
      const latIdx = columnMapping.lat ? headers.indexOf(columnMapping.lat) : -1;
      const lonIdx = columnMapping.lon ? headers.indexOf(columnMapping.lon) : -1;

      const customers = csvData.map(row => {
        const lat = latIdx >= 0 && row[latIdx] ? parseFloat(row[latIdx]) : null;
        const lon = lonIdx >= 0 && row[lonIdx] ? parseFloat(row[lonIdx]) : null;
        
        return {
          name: row[nameIdx]?.trim() || "Sem nome",
          address: row[addressIdx]?.trim() || "",
          city: row[cityIdx]?.trim() || "",
          lat: lat !== null && !isNaN(lat) ? lat : null,
          lon: lon !== null && !isNaN(lon) ? lon : null,
        };
      }).filter(c => c.address || c.name !== "Sem nome");

      // Import in batches
      const batchSize = 50;
      let imported = 0;

      for (let i = 0; i < customers.length; i += batchSize) {
        const batch = customers.slice(i, i + batchSize);
        await apiRequest("POST", "/api/customers/batch", { customers: batch });
        imported += batch.length;
        setImportProgress(Math.round((imported / customers.length) * 100));
      }

      return customers.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Importação concluída",
        description: `${count} clientes importados com sucesso`,
      });
      handleClose();
    },
    onError: (error: Error) => {
      setError(error.message || "Erro ao importar clientes");
      setStep("mapping");
    },
  });

  const canProceed = columnMapping.name && columnMapping.address && columnMapping.city;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar Clientes</DialogTitle>
          <DialogDescription>
            Importe sua base de clientes a partir de um arquivo CSV
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Upload Step */}
        {step === "upload" && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
            data-testid="csv-dropzone"
          >
            <input
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
              id="csv-upload"
            />
            <label htmlFor="csv-upload" className="cursor-pointer">
              <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm font-medium mb-1">
                Arraste o arquivo CSV ou clique para selecionar
              </p>
              <p className="text-xs text-muted-foreground">
                Colunas esperadas: nome, endereço, cidade
              </p>
            </label>
          </div>
        )}

        {/* Mapping Step */}
        {step === "mapping" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="w-4 h-4" />
              <span>{csvData.length} registros encontrados</span>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Coluna Nome <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={columnMapping.name}
                  onValueChange={(v) => setColumnMapping(prev => ({ ...prev, name: v }))}
                >
                  <SelectTrigger data-testid="select-column-name">
                    <SelectValue placeholder="Selecione a coluna" />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Coluna Endereço <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={columnMapping.address}
                  onValueChange={(v) => setColumnMapping(prev => ({ ...prev, address: v }))}
                >
                  <SelectTrigger data-testid="select-column-address">
                    <SelectValue placeholder="Selecione a coluna" />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Coluna Cidade <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={columnMapping.city}
                  onValueChange={(v) => setColumnMapping(prev => ({ ...prev, city: v }))}
                >
                  <SelectTrigger data-testid="select-column-city">
                    <SelectValue placeholder="Selecione a coluna" />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">
                    Coluna Latitude (opcional)
                  </Label>
                  <Select
                    value={columnMapping.lat || ""}
                    onValueChange={(v) => setColumnMapping(prev => ({ ...prev, lat: v || undefined }))}
                  >
                    <SelectTrigger data-testid="select-column-lat">
                      <SelectValue placeholder="Nenhuma" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {headers.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">
                    Coluna Longitude (opcional)
                  </Label>
                  <Select
                    value={columnMapping.lon || ""}
                    onValueChange={(v) => setColumnMapping(prev => ({ ...prev, lon: v || undefined }))}
                  >
                    <SelectTrigger data-testid="select-column-lon">
                      <SelectValue placeholder="Nenhuma" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {headers.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancelar
              </Button>
              <Button 
                onClick={() => importMutation.mutate()} 
                disabled={!canProceed}
                className="flex-1"
                data-testid="button-start-import"
              >
                <Check className="w-4 h-4 mr-2" />
                Importar
              </Button>
            </div>
          </div>
        )}

        {/* Importing Step */}
        {step === "importing" && (
          <div className="space-y-4 py-4">
            <div className="text-center">
              <p className="text-sm font-medium mb-2">Importando clientes...</p>
              <Progress value={importProgress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2">{importProgress}% concluído</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
