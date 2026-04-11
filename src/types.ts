export interface Station {
  id: string;
  infrastructureCode?: string;
  name: string;
  infrastructureDepartment?: string;
  latitude: number;
  longitude: number;
  address: string;
  managerName: string;
  managerPhone: string;
  icon?: string;
  status?: 'checked' | 'unchecked';
}

export interface ReportHistory {
  userId: string;
  userName: string;
  timestamp: string;
  content: string;
}

export interface Report {
  id: string;
  userId: string;
  stationId: string;
  stationName?: string; // Denormalized for easier display
  date: string; // YYYY-MM-DD
  content: string;
  status: 'completed' | 'pending';
  createdAt?: string;
  updatedAt?: string;
  history?: ReportHistory[];
}

export interface DailyPlan {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  stationIds: string[];
}

export type Tab = 'dashboard' | 'stations' | 'planner' | 'reports' | 'settings';

export interface ValidationWarning {
  id: string;
  isRead: boolean;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  issue: string;
  recommendation: string;
}
