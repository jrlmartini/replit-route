# Design Guidelines: Geo-CRM Map Application

## Design Approach
**System-Based Approach**: Material Design principles adapted for data-heavy mapping interface with clean, functional aesthetics. This is a utility-focused tool where clarity, efficiency, and data visibility are paramount.

## Core Design Principles
- **Function First**: Every element serves a clear purpose - no decorative additions
- **Data Visibility**: Map and customer data always take center stage
- **Workflow Clarity**: Clear visual separation between different analysis modes
- **Brazilian Portuguese**: All interface text in PT-BR

## Layout Architecture

### Primary Layout Structure
**Three-panel layout**:
- **Left Sidebar** (320px fixed): Controls and feature tabs
- **Center Map** (flexible): Primary Leaflet map view
- **Right Panel** (360px, collapsible): Customer list results

### Responsive Behavior
- Desktop (>1280px): All three panels visible
- Tablet (768-1280px): Sidebar fixed, list panel as overlay/drawer
- Mobile (<768px): Stack vertically - controls drawer, full-width map, bottom sheet results

## Typography System
- **Primary Font**: Inter (Google Fonts)
- **Hierarchy**:
  - H1 (Page title): text-2xl font-semibold
  - H2 (Section headers): text-lg font-medium
  - H3 (Panel titles): text-base font-medium
  - Body: text-sm
  - Labels/metadata: text-xs text-gray-600

## Spacing System
**Tailwind units**: Consistently use 2, 4, 6, 8, 12, 16
- Component padding: p-4 to p-6
- Section gaps: gap-4 to gap-6
- Panel padding: p-6
- Form field spacing: space-y-4

## Component Library

### Navigation & Tabs
- **Feature Tabs** (left sidebar): Vertical tab stack with icons
  - Tab 1: "Raio de Tempo de Viagem" (clock icon)
  - Tab 2: "Prospects no Corredor" (route icon)
  - Active state: colored left border + background tint
  
### Map Components
- **Markers**: Clustered using Leaflet.markercluster, blue pins for customers
- **Overlays**:
  - Isochrone polygon: Semi-transparent blue fill (opacity 0.2), solid border
  - Route polyline: Bold colored line (3px width)
  - Corridor polygon: Semi-transparent green fill (opacity 0.15), dashed border
- **Layer toggles**: Checkbox list in map corner with clear labels

### Input Controls
- **Address inputs**: Full-width with location icon prefix, autocomplete dropdown
- **Map click selection**: Visual feedback with pulsing temporary marker
- **Sliders**: 
  - Travel time: 5-60 minutes with value display
  - Corridor width: 2-30 km with value display
  - Use range input with visible track and custom thumb

### Data Display
- **Customer list items**:
  - Name (bold), address (secondary text)
  - Distance/time metadata badges
  - Hover: subtle background change, cursor pointer
  - Click: pan/zoom map to marker
- **Empty states**: Centered icon + message + action button
- **Loading states**: Skeleton screens for lists, spinner for map operations

### Progress Indicators
- **Geocoding batch**: Linear progress bar with "X/Y geocoded" counter
- **Route computation**: Indeterminate spinner with status text
- **Query results**: Count badge "X customers found"

### CSV Upload Flow
- **Drag-drop zone**: Dashed border, centered icon + text "Arraste CSV ou clique"
- **Column mapping**: Two-column layout showing CSV headers → app fields
- **Geocode button**: Prominent action after upload with icon

### Action Buttons
- **Primary actions**: Colored filled buttons (Compute, Export, Upload)
- **Secondary actions**: Outlined buttons (Clear, Cancel)
- **Icon buttons**: Map controls, layer toggles, list actions

### Search & Filters
- **Customer search**: Sticky at top of results panel, instant filter
- **Filter chips**: Show active filters with remove icons

## Map Interaction Patterns
- **Default state**: Full customer marker view with clustering
- **Analysis mode**: Dim uncovered customers, highlight matches
- **Popup content**: Customer name, full address, "Ver detalhes" link
- **Click-to-select**: For origin/destination selection, show confirmation toast

## Color Usage
Avoid specific color values per guidelines, but establish semantic meanings:
- **Primary**: Actions, selected states, main CTA
- **Success**: Customers within range/corridor
- **Neutral**: Inactive customers, disabled states
- **Warning**: Geocoding issues, quota warnings
- **Error**: Failed operations, invalid inputs

## Data Export
- **Export button**: Icon + "Exportar CSV" text, downloads matching customers
- **Toast confirmation**: "X clientes exportados" with dismiss

## Error & Feedback Messaging
- **Inline errors**: Below input fields, small text with icon
- **Toast notifications**: Bottom-right, auto-dismiss (success) or manual (errors)
- **API quota warnings**: Alert banner at top when approaching limits

## Images
**No hero images or marketing imagery** - This is a pure utility application. All visual elements are functional: map tiles, icons, data visualizations, and UI components only.