# Geo-CRM Map

## Overview

Geo-CRM Map is a visual web application for visualizing customer databases on a map. It answers two key business questions:

1. **Travel Time Radius (Isochrone)**: "From point X, who is within Y minutes of driving distance?"
2. **Corridor Prospects**: "If traveling from A to B (route), which customers are near the route corridor?"

The application allows CSV import of customer data, geocoding of addresses, isochrone generation, and route corridor analysis using OpenRouteService APIs.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state, React useState for local state
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style)
- **Map Library**: Leaflet with marker clustering support
- **Geospatial Analysis**: Turf.js for client-side geometry operations
- **CSV Parsing**: PapaParse for CSV file handling

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **Build Tool**: esbuild for server bundling, Vite for client
- **API Pattern**: RESTful JSON APIs under `/api/*` prefix

### Data Storage
- **Storage**: In-memory storage (MemStorage) for prototype/single-user use
- **Schema Location**: `shared/schema.ts`
- **Data Models**:
  - `customers`: Customer records with name, address, city, lat/lon coordinates
  - `geocode_cache`: Cached geocoding results to avoid redundant API calls
  - `query_cache`: Cached isochrone and directions responses
- **Note**: Data persists during server session but resets on restart. For production use, upgrade to PostgreSQL.

### Three-Panel Layout
- **Left Sidebar** (320px): Controls, feature tabs (Isochrone/Corridor), layer toggles
- **Center**: Leaflet map with customer markers, isochrone polygons, route corridors
- **Right Panel** (360px): Customer list with search and filtering

### Key Design Patterns
- **Shared Types**: Schema definitions in `shared/` are used by both client and server
- **API Rate Limiting**: Built-in rate limiter for external API calls (1 request/second)
- **Caching Strategy**: Address geocoding and route queries are cached to reduce API usage
- **Path Aliases**: `@/` maps to client source, `@shared/` maps to shared code

## External Dependencies

### APIs and Services
- **OpenRouteService**: Primary geospatial API for:
  - Geocoding addresses to coordinates
  - Isochrone generation (travel time polygons)
  - Directions/routing between points
  - **Configuration**: API key stored in `ORS_API_KEY` environment secret
  - **Rate Limits**: Application enforces 1 second minimum between requests

### Storage
- **In-Memory**: Current implementation uses MemStorage for single-user prototype
  - Data persists during server session
  - All caching happens in memory for performance

### Key NPM Dependencies
- `leaflet` + `leaflet.markercluster`: Map rendering and marker clustering
- `@turf/turf`: Geospatial calculations (buffers, point-in-polygon, distances)
- `papaparse`: CSV parsing for customer data import
- `zod`: Schema validation for API requests
- `@tanstack/react-query`: Async state management
- `@radix-ui/*`: Accessible UI primitives for shadcn/ui components