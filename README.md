# Geo-CRM Map

Aplicação web visual para visualizar sua base de clientes no mapa e responder duas perguntas importantes:

1. **Raio de Tempo de Viagem**: "A partir do ponto X, quem está a Y minutos de distância dirigindo?"
2. **Prospects no Corredor**: "Se estou indo de A para B (rota), quais clientes estão próximos do corredor da rota?"

## Configuração

### Chave de API OpenRouteService

1. Acesse as **Secrets** do Replit (ícone de cadeado no painel esquerdo)
2. Adicione a secret:
   - **Nome**: `ORS_API_KEY`
   - **Valor**: Sua chave de API do OpenRouteService

Para obter uma chave gratuita, cadastre-se em: https://openrouteservice.org/dev/#/signup

## Formato do CSV

O arquivo CSV de importação deve conter no mínimo as colunas:
- **name** ou **nome**: Nome do cliente
- **address** ou **endereço**: Endereço completo
- **city** ou **cidade**: Cidade

### Colunas opcionais:
- **lat** ou **latitude**: Latitude (se já geocodificado)
- **lon**/**lng** ou **longitude**: Longitude (se já geocodificado)

### Exemplo de CSV:

```csv
nome,endereco,cidade,lat,lon
"João Silva","Av. Paulista, 1000","São Paulo",-23.5614,-46.6560
"Maria Santos","Rua Oscar Freire, 500","São Paulo",
"Pedro Oliveira","Av. Brasil, 1500","Rio de Janeiro",
```

## Como usar

### 1. Importar Clientes
1. Clique em **"Importar CSV"** no painel esquerdo
2. Arraste o arquivo ou clique para selecionar
3. Mapeie as colunas do seu CSV
4. Clique em **"Importar"**

### 2. Geocodificar Endereços
Se seus clientes não possuem coordenadas (lat/lon):
1. Após importar, clique em **"Geocodificar (X)"**
2. Aguarde o progresso (1 endereço por segundo para respeitar limites da API)

### 3. Análise de Raio de Tempo
1. Selecione a aba **"Raio de Tempo"**
2. Digite um endereço de origem ou clique no mapa
3. Ajuste o tempo de viagem (5-60 minutos)
4. Clique em **"Calcular"**
5. Veja os clientes dentro do raio no mapa e na lista

### 4. Análise de Corredor
1. Selecione a aba **"Corredor"**
2. Digite ou selecione origem e destino
3. Opcionalmente, adicione pontos intermediários
4. Ajuste a largura do corredor (2-30 km)
5. Clique em **"Calcular Rota"**
6. Veja os clientes no corredor, ordenados por distância à rota

### 5. Exportar Resultados
- Clique em **"Exportar CSV"** para baixar a lista de clientes filtrados

## Sistema de Cache

O sistema implementa cache em dois níveis para otimizar performance e respeitar limites de API:

### Cache de Geocodificação
- Endereços geocodificados são cacheados por hash MD5 do endereço
- O mesmo endereço nunca é geocodificado duas vezes
- Cache persiste durante a sessão do servidor

### Cache de Consultas (Isócronas e Rotas)
- Isócronas: cache por (lat, lon, minutos) arredondados a 5 decimais
- Rotas: cache por hash das coordenadas
- Consultas repetidas usam resultados em cache

### Limpar Cache
```bash
# Via API:
curl -X DELETE http://localhost:5000/api/cache
```

## Stack Técnica

- **Frontend**: React + Vite + Tailwind CSS + Leaflet
- **Backend**: Node.js + Express
- **Mapa**: OpenStreetMap tiles + Leaflet.markercluster
- **Análise Geoespacial**: Turf.js para point-in-polygon e buffers
- **API Externa**: OpenRouteService (geocodificação, isócronas, rotas)

## Limitações da API Gratuita

O OpenRouteService tem limites no plano gratuito:
- 2.000 requisições/dia para geocodificação
- 500 requisições/dia para isócronas
- 2.000 requisições/dia para rotas

O sistema implementa:
- Rate limiting de 1 requisição/segundo
- Cache para evitar requisições duplicadas
- Mensagens de erro amigáveis quando limites são atingidos
