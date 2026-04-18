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

export interface TaskGroup {
  id: string; // id_nhom_cv
  name: string; // ten_nhom
}

export interface Attachment {
  id: string; // id_dinh_kem
  url: string; // duong_dan_file
  type: string; // loai_file (image/jpeg, etc)
}

export interface ReportHistory {
  userId: string;
  userName: string;
  timestamp: string;
  content: string;
}

export interface EquipmentDict {
  id: string; // id_thiet_bi
  name: string; // ten_thiet_bi
  validSpaces: string[]; // ['Indoor', 'Outdoor']
  unit?: string; // don_vi_tinh (cái, mét, bộ, ...)
}

export interface ReportDetail {
  id: string; // local UI ID or db ID
  spaceId: string; // id_khong_gian (Indoor, Outdoor)
  equipmentId: string; // id_thiet_bi (RRU, Anten, etc.)
  quantity: number; // so_luong
  status: string; // tinh_trang_thiet_bi
  unit?: string; // don_vi_tinh
  note?: string; // ghi_chu_chi_tiet
}

export interface Report {
  id: string; // id_bao_cao
  userId: string; // id_nhan_vien (FK)
  stationId: string; // id_tram (FK)
  taskGroupId?: string; // id_nhom_cv / id_loai_cv (FK)
  stationName?: string; // Denormalized for easier display
  date: string; // YYYY-MM-DD
  workSpace?: string; // 'Indoor' | 'Outdoor' | 'Full'
  content: string; // ghi_chu_tong_quat / noi_dung_cv
  details?: string; // (Legacy/Text details)
  equipmentDetails?: ReportDetail[]; // BaoCao_ChiTiet (1-N)
  status: 'completed' | 'pending';
  completedAt?: string; // thoi_gian_hoan_thanh
  createdAt?: string; // thoi_gian_tao_bc
  updatedAt?: string;
  history?: ReportHistory[];
  attachments?: Attachment[]; // 1-Nhiều từ BaoCao đến DinhKem
}

export interface DailyPlan {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  stationIds: string[];
}

export type Tab = 'dashboard' | 'stations' | 'planner' | 'settings' | 'admin' | 'reports';

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
