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
- **Storage**: PostgreSQL (Neon-backed via Replit) with Drizzle ORM
- **Schema Location**: `shared/schema.ts`
- **Database Connection**: `server/db.ts` using `pg` Pool with `DATABASE_URL`
- **Data Models**:
  - `customers`: Customer records with name, city, lat/lon coordinates
  - `geocode_cache`: Cached geocoding results to avoid redundant API calls
  - `query_cache`: Cached isochrone and directions responses
- **Note**: Data is persistent across restarts and deployments.

### Three-Panel Layout
- **Left Sidebar** (320px): Controls, feature tabs (Isochrone/Corridor), layer toggles
- **Center**: Leaflet map with customer markers, isochrone polygons, route corridors
- **Right Panel** (360px): Customer list with search and filtering

### Corridor Analysis Modes
- **Distance Mode**: Creates buffer corridor around route by specified kilometers
- **Time Mode**: Generates isochrones at sample points along the route, creates unified corridor by travel time

### Alternative Routes
- The directions API now requests up to 3 alternative routes
- All routes (main + alternatives) are used to generate the corridor polygon
- Main route displayed as solid purple line
- Alternative routes displayed as dashed, lighter purple lines with lower opacity

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
- **PostgreSQL**: Persistent storage via Replit's built-in Neon-backed PostgreSQL
  - Customer data, geocode cache, and query cache persist across restarts/deployments
  - Connected via `DATABASE_URL` environment variable

### Key NPM Dependencies
- `leaflet` + `leaflet.markercluster`: Map rendering and marker clustering
- `@turf/turf`: Geospatial calculations (buffers, point-in-polygon, distances)
- `papaparse`: CSV parsing for customer data import
- `zod`: Schema validation for API requests
- `@tanstack/react-query`: Async state management
- `@radix-ui/*`: Accessible UI primitives for shadcn/ui components