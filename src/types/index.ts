// The 8 FEMA Community Lifelines
export type LifelineId =
  | 'safety-security'
  | 'food-hydration-shelter'
  | 'health-medical'
  | 'water-systems'
  | 'energy'
  | 'communications'
  | 'transportation'
  | 'hazardous-material';

// Nebraska enhanced lifeline structure — 6 levels (unknown + 5 instability tiers).
// Maps directly to the official graphic halo colors:
//   unknown → GRAY, stable → GREEN, minor → YELLOW,
//   moderate → ORANGE, major → RED, extreme → PURPLE
export type LifelineStatus =
  | 'unknown'
  | 'stable'
  | 'minor'
  | 'moderate'
  | 'major'
  | 'extreme';

export interface Lifeline {
  id: LifelineId;
  labelKey: string;       // i18n key
  status: LifelineStatus;
  lastUpdated: string;    // ISO 8601
  notes?: string;
}

// Incident point marker
export interface Incident {
  id: string;
  title: string;
  type: string;           // e.g. "flood", "power-outage", "shelter"
  affectedLifelines: LifelineId[];
  coordinates: [number, number];  // [longitude, latitude]
  impactRadiusKm?: number;
  severity: 'low' | 'moderate' | 'high' | 'catastrophic';
  timestamp: string;
  description?: string;
}

// Active crisis event
export interface CrisisEvent {
  id: string;
  name: string;
  type: string;
  startDate: string;
  affectedCounties: string[];
  lifelines: Record<LifelineId, Lifeline>;
  incidents: Incident[];
}

// Matches Cognito group names (injected identically for federated users via Pre-Token Gen Lambda)
export type UserRole = 'Admin' | 'Editor' | 'Viewer' | 'LifelineManager';

// Source of roles differs by auth path but shape is identical downstream:
// - Cognito direct users: roles come from cognito:groups claim
// - Federated (Okta) users: roles injected by Pre-Token Generation Lambda
// Components never need to know which path was used.
export interface AuthUser {
  username: string;
  email: string;
  roles: UserRole[];
  lifelinePermissions?: LifelineId[];
  authMethod: 'federated' | 'cognito';
}

// API response wrapper
export interface ApiResponse<T> {
  data: T;
  lastRefreshed: string;
  error?: string;
}
