// ─── Profile ────────────────────────────────────────────────────────────────

export type OrsProfile =
    | 'driving-car'
    | 'driving-hgv'
    | 'cycling-regular'
    | 'cycling-road'
    | 'cycling-mountain'
    | 'cycling-electric'
    | 'foot-walking'
    | 'foot-hiking'
    | 'wheelchair'
    | 'public-transport';

// ─── Common ──────────────────────────────────────────────────────────────────

export interface OrsEngineInfo {
    version?: string;
    build_date?: string;
    graph_date?: string;
    osm_date?: string;
}

export interface OrsMetadata {
    id?: string;
    attribution?: string;
    service?: string;
    timestamp?: number;
    query?: unknown;
    engine?: OrsEngineInfo;
    system_message?: string;
}

export interface RouteWarning {
    code: number;
    message: string;
}

// ─── Snapping ─────────────────────────────────────────────────────────────────

export interface SnapRequest {
    /** Array of [longitude, latitude] pairs to snap. */
    locations: number[][];
    /** Maximum search radius in metres. */
    radius: number;
    /** Optional request identifier reflected in response metadata. */
    id?: string;
}

export interface SnappedLocation {
    location: number[];
    name?: string;
    snapped_distance: number;
}

export interface SnapResponse {
    locations: (SnappedLocation | null)[];
    metadata: OrsMetadata;
}

export interface GeoJSONFeatureProperties {
    name?: string;
    snapped_distance?: number;
    source_id?: number;
}

export interface GeoJSONPointGeometry {
    type: 'Point';
    coordinates: number[];
}

export interface GeoJSONFeature {
    type: 'Feature';
    properties: GeoJSONFeatureProperties;
    geometry: GeoJSONPointGeometry;
}

export interface GeoJSONSnapResponse {
    type: 'FeatureCollection';
    features: GeoJSONFeature[];
    metadata: OrsMetadata;
    bbox?: number[];
}

// ─── Matrix ───────────────────────────────────────────────────────────────────

export interface MatrixRequest {
    /** Required. Array of [lon, lat] coordinate pairs. */
    locations: number[][];
    /** Indices of source locations (default: all). */
    sources?: number[];
    /** Indices of destination locations (default: all). */
    destinations?: number[];
    /** Metrics to calculate (default: ['duration']). */
    metrics?: ('distance' | 'duration')[];
    /** Resolve street names for sources/destinations (default: false). */
    resolve_locations?: boolean;
    /** Distance/speed units (default: 'm'). */
    units?: 'm' | 'km' | 'mi';
    id?: string;
}

export interface MatrixLocation {
    location: number[];
    name?: string;
    snapped_distance?: number;
}

export interface MatrixResponse {
    durations?: number[][];
    distances?: number[][];
    destinations: MatrixLocation[];
    sources: MatrixLocation[];
    metadata: OrsMetadata;
}

// ─── Matching ─────────────────────────────────────────────────────────────────

export interface MatchRequest {
    [key: string]: unknown;
}

// ─── Isochrones ───────────────────────────────────────────────────────────────

export interface IsochronesRequest {
    /** Required. Array of [lon, lat] pairs. */
    locations: number[][];
    /** Required. Range values in seconds (time) or metres (distance). */
    range: number[];
    /** 'time' (default) or 'distance'. */
    range_type?: 'time' | 'distance';
    /** 'start' (default) or 'destination'. */
    location_type?: 'start' | 'destination';
    units?: 'm' | 'km' | 'mi';
    options?: RouteOptions;
    id?: string;
    /** Smoothing factor for isochrone geometries (0–1). */
    smoothing?: number;
    /** Extra info to include (e.g. ['steepness', 'surface']). */
    attributes?: string[];
    /** Intersect isochrone geometries (default: false). */
    intersections?: boolean;
}

// ─── Route Options ────────────────────────────────────────────────────────────

export interface ProfileWeightings {
    /** Cycling profiles only. 0–3. */
    steepness_difficulty?: number;
    /** Foot profiles only. 0–1. */
    green?: number;
    /** Foot profiles only. 0–1. */
    quiet?: number;
    /** Foot profiles only. 0–1. */
    shadow?: number;
}

export interface ProfileRestrictions {
    /** HGV only. Metres. */
    length?: number;
    /** HGV only. Metres. */
    width?: number;
    /** HGV only. Metres. */
    height?: number;
    /** HGV only. Tons. */
    axleload?: number;
    /** HGV only. Tons. */
    weight?: number;
    /** HGV only. */
    hazmat?: boolean;
    /** Wheelchair only. */
    surface_type?: string;
    /** Wheelchair only. */
    track_type?: string;
    /** Wheelchair only. */
    smoothness_type?:
    | 'excellent'
    | 'good'
    | 'intermediate'
    | 'bad'
    | 'very_bad'
    | 'horrible'
    | 'very_horrible'
    | 'impassable';
    /** Wheelchair only. Metres (default: 0.6). */
    maximum_sloped_kerb?: number;
    /** Wheelchair only. Percentage (default: 6). */
    maximum_incline?: number;
    /** Wheelchair only. Metres. */
    minimum_width?: number;
}

export interface ProfileParameters {
    weightings?: ProfileWeightings;
    restrictions?: ProfileRestrictions;
    /** Wheelchair only. */
    surface_quality_known?: boolean;
    /** Wheelchair only. */
    allow_unsuitable?: boolean;
}

export interface RoundTripRouteOptions {
    /** Target route length in metres. */
    length?: number;
    /** Number of waypoints for the round trip. */
    points?: number;
    /** Randomisation seed. */
    seed?: number;
}

export interface RouteOptions {
    /** Features to avoid. */
    avoid_features?: ('highways' | 'tollways' | 'ferries' | 'fords' | 'steps')[];
    /** Border crossing restrictions. Driving profiles only. */
    avoid_borders?: 'all' | 'controlled' | 'none';
    /** ISO 3166-1 country codes to avoid. Driving profiles only. */
    avoid_countries?: string[];
    /** HGV vehicle sub-type. */
    vehicle_type?: 'hgv' | 'bus' | 'agricultural' | 'delivery' | 'forestry' | 'goods' | 'unknown';
    profile_params?: ProfileParameters;
    /** GeoJSON Polygon/Multipolygon to avoid. */
    avoid_polygons?: unknown;
    round_trip?: RoundTripRouteOptions;
}

export interface AlternativeRoutes {
    /** Number of alternative routes to return (default: 2). */
    target_count?: number;
    /** Maximum factor by which alternatives may be longer (default: 1.4). */
    weight_factor?: number;
    /** Maximum share of route that may overlap with another (default: 0.6). */
    share_factor?: number;
}

export interface CustomModelStatement {
    if?: string;
    else_if?: string;
    else?: boolean;
    condition?: string;
    multiply_by?: number;
    limit_to?: number;
}

export interface RouteRequestCustomModel {
    distance_influence?: number;
    speed?: CustomModelStatement[];
    priority?: CustomModelStatement[];
    areas?: Record<string, unknown>;
}

// ─── Directions ───────────────────────────────────────────────────────────────

export type ExtraInfo =
    | 'steepness'
    | 'suitability'
    | 'surface'
    | 'waycategory'
    | 'waytype'
    | 'tollways'
    | 'traildifficulty'
    | 'osmid'
    | 'roadaccessrestrictions'
    | 'countryinfo'
    | 'green'
    | 'noise'
    | 'csv'
    | 'shadow';

export interface DirectionsRequest {
    /** Required. Array of [lon, lat] waypoints (min 2). */
    coordinates: number[][];
    id?: string;
    /** Route preference (default: 'recommended'). */
    preference?: 'fastest' | 'shortest' | 'recommended' | 'custom';
    units?: 'm' | 'km' | 'mi';
    /** BCP 47 language tag for instruction language (default: 'en'). */
    language?: string;
    /** Return encoded geometry (default: true). */
    geometry?: boolean;
    /** Return turn-by-turn instructions (default: true). */
    instructions?: boolean;
    /** Instruction format (default: 'text'). */
    instructions_format?: 'html' | 'text';
    /** Report exit numbers for roundabouts (default: false). */
    roundabout_exits?: boolean;
    /** Segment-level attributes to include. */
    attributes?: ('avgspeed' | 'detourfactor' | 'percentage')[];
    /** Include manoeuvre data in steps (default: false). */
    maneuvers?: boolean;
    /** Per-waypoint search radii in metres. */
    radiuses?: number[];
    /** Per-waypoint bearing constraints [[bearing, range], …]. */
    bearings?: number[][];
    /** Continue straight at waypoints (default: false). */
    continue_straight?: boolean;
    /** Include elevation data (default: false). */
    elevation?: boolean;
    extra_info?: ExtraInfo[];
    options?: RouteOptions;
    suppress_warnings?: boolean;
    /** Simplify geometry (default: false). */
    geometry_simplify?: boolean;
    /** Segment indices to skip. */
    skip_segments?: number[];
    alternative_routes?: AlternativeRoutes;
    /** Maximum speed cap in km/h. Driving profiles only. */
    maximum_speed?: number;
    /** Return public-transport schedule (default: false). */
    schedule?: boolean;
    /** ISO 8601 duration for PT schedule window (e.g. 'PT2H30M'). */
    schedule_duration?: string;
    schedule_rows?: number;
    walking_time?: string;
    /** Ignore PT transfers (default: false). */
    ignore_transfers?: boolean;
    custom_model?: RouteRequestCustomModel;
}

export interface StepManeuver {
    location: number[];
    bearing_before: number;
    bearing_after: number;
}

export interface RouteStep {
    distance: number;
    duration: number;
    /** Instruction type code. */
    type: number;
    instruction: string;
    name: string;
    exit_number?: number;
    exit_bearings?: number[];
    way_points: number[];
    maneuver?: StepManeuver;
}

export interface RouteSegment {
    distance: number;
    duration: number;
    steps: RouteStep[];
    detourfactor?: number;
    percentage?: number;
    avgspeed?: number;
    ascent?: number;
    descent?: number;
}

export interface RouteSummary {
    distance: number;
    duration: number;
    ascent?: number;
    descent?: number;
    /** Public transport only. */
    transfers?: number;
    /** Public transport only. */
    fare?: number;
}

export interface PtStop {
    stop_id: string;
    name: string;
    location: number[];
    arrival_time?: string;
    planned_arrival_time?: string;
    predicted_arrival_time?: string;
    arrival_cancelled?: boolean;
    departure_time?: string;
    planned_departure_time?: string;
    predicted_departure_time?: string;
    departure_cancelled?: boolean;
}

export interface RouteLeg {
    type: string;
    departure_location?: string;
    trip_headsign?: string;
    route_long_name?: string;
    route_short_name?: string;
    route_desc?: string;
    route_type?: number;
    distance: number;
    duration: number;
    departure?: string;
    arrival?: string;
    feed_id?: string;
    trip_id?: string;
    route_id?: string;
    is_in_same_vehicle_as_previous?: boolean;
    geometry?: string;
    instructions?: RouteStep[];
    stops?: PtStop[];
}

export interface RouteExtraSummary {
    value: number;
    distance: number;
    amount: number;
}

export interface RouteExtra {
    values: number[][];
    summary: RouteExtraSummary[];
}

export interface IndividualRoute {
    summary: RouteSummary;
    segments: RouteSegment[];
    bbox?: number[];
    /** Encoded polyline geometry. */
    geometry: string;
    way_points: number[];
    warnings?: RouteWarning[];
    /** Public transport legs. */
    legs?: RouteLeg[];
    extras?: Record<string, RouteExtra>;
    departure?: string;
    arrival?: string;
}

export interface DirectionsResponse {
    bbox?: number[];
    routes: IndividualRoute[];
    metadata: OrsMetadata;
}

// ─── Export ───────────────────────────────────────────────────────────────────

export interface ExportRequest {
    /** Required. Two [lon, lat] pairs defining the bounding box. */
    bbox: number[][];
    id?: string;
    /** Return exact edge geometry (default: true). */
    geometry?: boolean;
}

export interface ExportNode {
    nodeId: number;
    location: number[];
}

export interface ExportEdge {
    fromId: number;
    toId: number;
    weight: number;
}

export interface ExportEdgeExtra {
    edgeId: string;
    extra: Record<string, unknown>;
}

export interface ExportResponse {
    nodes?: ExportNode[];
    edges?: ExportEdge[];
    edges_extra?: ExportEdgeExtra[];
    warning?: RouteWarning;
    nodes_count?: number;
    edges_count?: number;
}

// ─── Elevation ────────────────────────────────────────────────────────────────

export type ElevationFormat = 'geojson' | 'polyline' | 'encodedpolyline5' | 'encodedpolyline6';

export interface ElevationLineRequest {
    /** Required. */
    format_in: ElevationFormat;
    format_out?: ElevationFormat;
    dataset?: 'srtm';
    /** Required. Geometry in the format specified by format_in. */
    geometry: unknown;
}

export interface ElevationPointRequest {
    /** Required. */
    format_in: 'geojson' | 'point';
    format_out?: 'geojson' | 'point';
    dataset?: 'srtm';
    /** Required. GeoJSON Point or [lon, lat] array. */
    geometry: unknown;
}

export interface ElevationResponse {
    attribution: string;
    version: string;
    timestamp: number;
    geometry: {
        type: string;
        coordinates: number[] | number[][];
    };
}

// ─── POIs ─────────────────────────────────────────────────────────────────────

export interface PoisGeometry {
    buffer?: number;
    bbox?: number[][];
    geojson?: unknown;
}

export interface PoisFilters {
    category_group_ids?: number[];
    category_ids?: number[];
    name?: string[];
    wheelchair?: unknown[];
    smoking?: unknown[];
    fee?: unknown[];
}

export interface PoisRequest {
    /** Required. */
    request: 'pois' | 'stats' | 'list';
    geometry?: PoisGeometry;
    filters?: PoisFilters;
    limit?: number;
    sortby?: 'category' | 'distance';
}

// ─── Optimization (VROOM) ─────────────────────────────────────────────────────

export interface OptimizationJob {
    /** Unique identifier. */
    id: number;
    description?: string;
    /** [lon, lat] coordinates. Required unless using custom matrix. */
    location?: number[];
    location_index?: unknown;
    /** Setup duration in seconds (default: 0). */
    setup?: number;
    /** Service duration in seconds (default: 0). */
    service?: number;
    delivery?: number[];
    pickup?: number[];
    skills?: number[];
    /** Priority 0–100 (default: 0). */
    priority?: number;
    time_windows?: number[][];
}

export interface OptimizationShipment {
    pickup: OptimizationShipmentStep;
    delivery: OptimizationShipmentStep;
    amount?: number[];
    skills?: number[];
    priority?: number;
}

export interface OptimizationShipmentStep {
    id: number;
    description?: string;
    location?: number[];
    location_index?: unknown;
    setup?: number;
    service?: number;
    time_windows?: number[][];
}

export interface OptimizationVehicleBreak {
    id: number;
    time_windows?: number[][];
    service?: number;
    description?: string;
    max_load?: number[];
}

export interface OptimizationVehicleCosts {
    /** Cost of using this vehicle (default: 0). */
    fixed?: number;
    /** Cost per hour of travel (default: 3600). */
    per_hour?: number;
    /** Cost per km of travel (default: 0). */
    per_km?: number;
}

export interface OptimizationVehicleStep {
    type: 'start' | 'job' | 'pickup' | 'delivery' | 'break' | 'end';
    id?: number;
    service_at?: number;
    service_after?: number;
    service_before?: number;
}

export interface OptimizationVehicle {
    id: number;
    profile?: OrsProfile;
    description?: string;
    start?: number[];
    start_index?: unknown;
    end?: number[];
    end_index?: unknown;
    capacity?: number[];
    costs?: OptimizationVehicleCosts;
    skills?: number[];
    time_window?: number[];
    breaks?: OptimizationVehicleBreak[];
    /** Speed scaling factor 0–5 (default: 1.0). */
    speed_factor?: number;
    max_tasks?: number;
    max_travel_time?: number;
    max_distance?: number;
    steps?: OptimizationVehicleStep[];
}

export interface OptimizationProfileMatrix {
    durations?: number[][];
    distances?: number[][];
    costs?: number[][];
}

export interface OptimizationRequest {
    /** Required. Jobs to visit. */
    jobs: OptimizationJob[];
    /** Optional shipments (paired pickup+delivery). */
    shipments?: OptimizationShipment[];
    /** Required. Available vehicles. */
    vehicles: OptimizationVehicle[];
    /** Custom matrices per profile. */
    matrices?: Record<string, OptimizationProfileMatrix>;
    options?: {
        /** Calculate route geometries (default: false). */
        g?: boolean;
    };
}

export interface OptimizationViolation {
    cause: string;
    duration?: number;
}

export interface OptimizationRouteStep {
    type: string;
    arrival?: number;
    duration?: number;
    setup?: number;
    service?: number;
    waiting_time?: number;
    violations?: OptimizationViolation[];
    description?: string;
    location?: number[];
    id?: number;
    load?: number;
    distance?: number;
}

export interface OptimizationRoute {
    vehicle: number;
    steps: OptimizationRouteStep[];
    cost?: number;
    service?: number;
    duration?: number;
    waiting_time?: number;
    delivery?: number[];
    pickup?: number[];
    description?: string;
    geometry?: string;
    distance?: number;
    violations?: OptimizationViolation[];
}

export interface OptimizationSummary {
    cost?: number;
    routes?: number;
    unassigned?: number;
    setup?: number;
    service?: number;
    duration?: number;
    waiting_time?: number;
    priority?: number;
    violations?: OptimizationViolation[];
    delivery?: number;
    pickup?: number;
    distance?: number;
}

export interface OptimizationUnassigned {
    id: number;
    location?: number[];
}

export interface OptimizationResponse {
    code: number;
    error?: string;
    summary?: OptimizationSummary;
    unassigned?: OptimizationUnassigned[];
    routes?: OptimizationRoute[];
}
