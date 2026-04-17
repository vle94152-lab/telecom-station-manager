import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy,
  Timestamp,
  getDoc,
  getDocFromServer,
  setDoc,
  arrayUnion
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  User,
  updateProfile
} from 'firebase/auth';
import { db, auth } from './firebase';
import { Station, Report, DailyPlan, Tab, ValidationWarning } from './types';
import { 
  MapPin, 
  Phone, 
  User as UserIcon, 
  Plus, 
  Trash2, 
  Route, 
  ClipboardList, 
  History, 
  LogOut, 
  ChevronRight,
  Calendar,
  CheckCircle2,
  Clock,
  Navigation,
  Search,
  ArrowRight,
  Menu,
  X,
  Upload,
  LayoutDashboard,
  Map,
  List,
  ChevronDown,
  Eye,
  EyeOff,
  ClipboardCheck,
  Share2,
  Copy,
  Mail,
  MessageCircle,
  Download,
  FileSpreadsheet,
  Settings,
  Award,
  Bell,
  QrCode,
  Building2,
  FileText,
  PlusCircle,
  Receipt,
  CarFront,
  Settings2,
  Car,
  Home,
  Cloud,
  FileText,
  BookOpen,
  Wallet,
  Shield,
  Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfMonth, endOfMonth, isSameMonth, parseISO, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';
import { cn } from './lib/utils';
import { GoogleGenAI } from "@google/genai";
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Tooltip as LeafletTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    tenantId: string;
    providerInfo: {
      providerId: string;
      displayName: string;
      email: string;
      photoUrl: string;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || '',
      email: auth.currentUser?.email || '',
      emailVerified: auth.currentUser?.emailVerified || false,
      isAnonymous: auth.currentUser?.isAnonymous || false,
      tenantId: auth.currentUser?.tenantId || '',
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName || '',
        email: provider.email || '',
        photoUrl: provider.photoURL || ''
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Fix for default marker icon in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const checkedIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const uncheckedIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const formatStationName = (name: string) => {
  if (!name) return '';
  const parts = name.split(/[-_]/);
  if (parts.length >= 3) {
    return parts[1].trim();
  }
  if (parts.length === 2) {
    return parts[1].trim();
  }
  return name;
};

const plannedIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const iconCache: Record<string, L.DivIcon> = {};

const getStationIcon = (station: Station, isPlanned: boolean = false) => {
  if (station.icon) {
    const borderColor = station.status === 'checked' ? '#10B981' : (isPlanned ? '#F97316' : '#EF4444');
    const cacheKey = `${station.id}-${borderColor}-${station.icon}`;
    
    if (!iconCache[cacheKey]) {
      iconCache[cacheKey] = new L.DivIcon({
        className: 'custom-station-icon',
        html: `<div style="width: 32px; height: 32px; border-radius: 50%; overflow: hidden; border: 3px solid ${borderColor}; background-color: white; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"><img src="${station.icon}" style="width: 100%; height: 100%; object-fit: cover;" /></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
      });
    }
    return iconCache[cacheKey];
  }
  if (station.status === 'checked') return checkedIcon;
  if (isPlanned) return plannedIcon;
  return uncheckedIcon;
};

// --- Components ---

function MapUpdater({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  const positionsStr = JSON.stringify(positions);
  
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [positionsStr, map]); // Use stringified positions to avoid infinite loops
  return null;
}

const Button = ({ className, variant = 'primary', ...props }: any) => {
  const variants: any = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50',
    ghost: 'text-gray-600 hover:bg-gray-100'
  };
  return (
    <button 
      className={cn(
        'px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2',
        variants[variant],
        className
      )} 
      {...props} 
    />
  );
};

const Input = ({ className, ...props }: any) => (
  <input 
    className={cn(
      'w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
      className
    )} 
    {...props} 
  />
);

const Card = ({ children, className }: any) => (
  <div className={cn('bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden', className)}>
    {children}
  </div>
);

// --- Full Master-Detail Report Modal ---

function CreateReportModal({
  isOpen,
  onClose,
  stations,
  user,
  equipmentDict,
  taskGroups,
  technologies,
  initialStationId = '',
  reports
}: {
  isOpen: boolean;
  onClose: () => void;
  stations: Station[];
  user: User;
  equipmentDict: EquipmentDict[];
  taskGroups: TaskGroup[];
  initialStationId?: string;
  reports: Report[];
}) {
  const [stationId, setStationId] = useState(initialStationId);
  const [stationSearch, setStationSearch] = useState('');
  const [isStationDropdownOpen, setIsStationDropdownOpen] = useState(false);
  const stationDropdownRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    setStationId(initialStationId);
  }, [initialStationId]);

  useEffect(() => {
    if (stationId) {
      const st = stations.find(s => s.id === stationId);
      if (st && stationSearch !== st.name) {
        setStationSearch(st.name);
      }
      
      setTaskGroupId('');
      setWorkSpace('Indoor');
      setContent('');
      setDetailsList([]);
    } else {
      setTaskGroupId('');
      setWorkSpace('Indoor');
      setContent('');
      setDetailsList([]);
    }
  }, [stationId, stations]);

  const [taskGroupId, setTaskGroupId] = useState('');
  const [workSpace, setWorkSpace] = useState<'Indoor' | 'Outdoor' | 'Full'>('Indoor');
  const [content, setContent] = useState('');
  const [detailsList, setDetailsList] = useState<ReportDetail[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{isOpen: boolean, detailId: string | null}>({isOpen: false, detailId: null});
  const [noteDialog, setNoteDialog] = useState<{isOpen: boolean, detailId: string | null}>({isOpen: false, detailId: null});

  // Filter equipments based on wordSpace or spaceId
  const getEquipmentsForSpace = (space: string) => {
    return equipmentDict.filter(eq => eq.validSpaces.includes(space)).map(eq => eq.name);
  };

  useEffect(() => {
    // Logic to reset details if workspace completely changes type making them invalid
    // But let's just let users handle it for now, or we can optionally clear it.
  }, [workSpace]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (stationDropdownRef.current && !stationDropdownRef.current.contains(event.target as Node)) {
        setIsStationDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredStations = useMemo(() => {
    if (!stationSearch) return stations.slice(0, 50);
    const lowerSearch = stationSearch.toLowerCase();
    return stations.filter(s => 
      s.name.toLowerCase().includes(lowerSearch) || 
      (s.infrastructureCode && s.infrastructureCode.toLowerCase().includes(lowerSearch))
    ).slice(0, 50);
  }, [stations, stationSearch]);

  const SPACES = ['Indoor', 'Outdoor'];

  const handleAddDetail = (forcedSpace?: 'Indoor' | 'Outdoor') => {
    setDetailsList([
      ...detailsList,
      {
        id: Math.random().toString(36).substr(2, 9),
        spaceId: forcedSpace || (workSpace === 'Full' ? '' : workSpace),
        equipmentId: '',
        quantity: 1,
        status: 'Tốt'
      }
    ]);
  };

  const handleRemoveDetail = (id: string) => {
    setConfirmDialog({ isOpen: true, detailId: id });
  };

  const confirmRemoveDetail = () => {
    if (confirmDialog.detailId) {
      setDetailsList(detailsList.filter(d => d.id !== confirmDialog.detailId));
    }
    setConfirmDialog({ isOpen: false, detailId: null });
  };

  const handleChangeDetail = (id: string, field: keyof ReportDetail, value: any) => {
    setDetailsList(detailsList.map(d => {
      if (d.id === id) {
        if (field === 'spaceId') {
          // Reset equipment if space changes to prevent invalid equipment
          return { ...d, [field]: value, equipmentId: '', unit: undefined };
        }
        if (field === 'equipmentId') {
          const matchedEq = equipmentDict.find(eq => eq.name === value);
          return { ...d, [field]: value, unit: matchedEq?.unit || 'cái' };
        }
        if (field === 'quantity') {
          // Parse float to allow decimal numbers properly while preventing NaN errors
          const parsedValue = typeof value === 'string' ? parseFloat(value) : value;
          return { ...d, [field]: isNaN(parsedValue) ? 0 : parsedValue };
        }
        return { ...d, [field]: value };
      }
      return d;
    }));
  };

  const handleSubmit = async () => {
    let finalStationId = stationId;
    
    // Auto-select if they typed the exact name but didn't click dropdown
    if (!finalStationId && stationSearch) {
      const match = stations.find(s => s.name.toLowerCase() === stationSearch.toLowerCase() || s.infrastructureCode?.toLowerCase() === stationSearch.toLowerCase());
      if (match) {
        finalStationId = match.id;
        setStationId(match.id);
      }
    }

    if (!finalStationId || !taskGroupId) {
      alert("Vui lòng chọn đủ Trạm trong danh sách và Loại Công Việc!");
      return;
    }
    if (detailsList.some(d => !d.spaceId || !d.equipmentId || d.quantity <= 0)) {
      alert("Vui lòng điền đủ thông tin cho tất cả thiết bị (Không gian, Loại, Số lượng > 0)!");
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedStation = stations.find(s => s.id === finalStationId);
      const now = new Date().toISOString();
      const today = format(new Date(), 'yyyy-MM-dd');

      const reportData: Partial<Report> = {
        userId: user.uid,
        stationId: finalStationId,
        stationName: selectedStation?.name || 'Trạm không xác định',
        taskGroupId: taskGroupId,
        date: today,
        workSpace: workSpace,
        content: content || 'Chưa ghi chú',
        equipmentDetails: detailsList,
        status: 'completed',
        createdAt: now,
        completedAt: now,
        updatedAt: now,
        history: [{
          userId: user.uid,
          userName: user.displayName || user.email || 'Unknown',
          timestamp: now,
          content: 'Tạo mới báo cáo Master-Detail'
        }]
      };

      await addDoc(collection(db, 'reports'), reportData);
      alert("Lưu báo cáo thành công!");
      
      onClose();
    } catch (err: any) {
      console.error(err);
      alert(`Có lỗi xảy ra khi lưu báo cáo: ${err?.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex justify-center items-end sm:items-center">
      <motion.div 
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        className="bg-white w-full max-w-2xl sm:rounded-xl rounded-t-xl h-[90vh] flex flex-col shadow-2xl"
      >
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h2 className="text-xl font-bold">Tạo Báo Cáo Hiện Trường</h2>
          <button onClick={onClose} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5"/>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Master Form */}
          <div className="space-y-4">
            <h3 className="font-semibold text-blue-700 flex items-center gap-2 border-b pb-2">
              <ClipboardList className="w-5 h-5" /> 1. Thông tin chung (Master)
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div ref={stationDropdownRef} className="relative z-50">
                <label className="block text-sm font-medium text-gray-700 mb-1">Trạm</label>
                <div className="relative">
                  <Input 
                    type="text"
                    placeholder="Tìm theo tên hoặc mã CSHT..."
                    value={stationSearch}
                    onChange={(e: any) => {
                      setStationSearch(e.target.value);
                      setIsStationDropdownOpen(true);
                      if (stationId) setStationId('');
                    }}
                    onFocus={() => setIsStationDropdownOpen(true)}
                  />
                  <Search className="w-4 h-4 absolute right-3 top-3 text-gray-400" />
                </div>
                
                <AnimatePresence>
                  {isStationDropdownOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.15 }}
                      className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto"
                    >
                      {filteredStations.length === 0 ? (
                        <div className="p-3 text-sm text-gray-500 italic text-center">Không tìm thấy trạm phù hợp.</div>
                      ) : (
                        filteredStations.map(s => (
                          <div 
                            key={s.id}
                            className={cn(
                              "p-3 cursor-pointer border-b border-gray-50 last:border-0 transition-colors",
                              stationId === s.id ? "bg-blue-50" : "hover:bg-gray-50"
                            )}
                            onClick={() => {
                              setStationId(s.id);
                              setStationSearch(`${s.name} (${s.infrastructureCode || 'N/A'})`);
                              setIsStationDropdownOpen(false);
                            }}
                          >
                            <div className={cn("font-medium text-sm", stationId === s.id ? "text-blue-700" : "text-gray-900")}>{s.name}</div>
                            <div className="text-xs text-gray-500 font-mono mt-0.5">{s.infrastructureCode || 'Chưa cập nhật mã'}</div>
                          </div>
                        ))
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Người thực hiện</label>
                <Input value={user.displayName || user.email || ''} readOnly className="bg-gray-50 text-gray-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Loại công việc</label>
                <select className="w-full border p-2 rounded-lg" value={taskGroupId} onChange={(e) => setTaskGroupId(e.target.value)}>
                  <option value="">-- Chọn Loại CV --</option>
                  {taskGroups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú tổng quát</label>
              <textarea 
                className="w-full border p-3 rounded-lg min-h-[80px]" 
                placeholder="Ví dụ: Hoàn thành tháo dỡ và thu hồi vật tư ngoài trời..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
          </div>

          {/* Details Form */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center border-b pb-2 gap-3">
              <h3 className="font-semibold text-blue-700 flex items-center gap-2">
                <Settings2 className="w-5 h-5" /> 2. Chi tiết thiết bị (Detail)
              </h3>
              
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border">
                  <select 
                    className="bg-transparent text-sm font-medium focus:outline-none"
                    value={workSpace}
                    onChange={(e) => {
                      const newSpace = e.target.value as 'Indoor' | 'Outdoor' | 'Full';
                      setWorkSpace(newSpace);
                      // Clear details to prevent invalid state, or auto-assign space if they switch to a specific one
                      if (newSpace !== 'Full') {
                        setDetailsList(detailsList.map(d => ({ ...d, spaceId: newSpace, equipmentId: '' })));
                      } else {
                        setDetailsList(detailsList.map(d => ({ ...d, equipmentId: '' })));
                      }
                    }}
                  >
                    <option value="Indoor">Indoor</option>
                    <option value="Outdoor">Outdoor</option>
                    <option value="Full">Indoor & Outdoor</option>
                  </select>
                </div>
                {/* Total Summary */}
                <div className="text-xs font-semibold text-gray-600 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 flex items-center gap-1">
                  Tổng: <span className="text-blue-700 text-sm mx-1">{detailsList.length}</span>
                  {workSpace === 'Full' && (
                     <span className="text-gray-500 font-normal">
                       (In: {detailsList.filter(d => d.spaceId === 'Indoor').length} | Out: {detailsList.filter(d => d.spaceId === 'Outdoor').length})
                     </span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {(() => {
                const renderDetailRow = (detail: ReportDetail) => {
                  const availableEquipments = getEquipmentsForSpace(detail.spaceId || workSpace);
                  const hasNote = detail.note && detail.note.trim().length > 0;
                  return (
                    <div key={detail.id} className="flex gap-2 items-center bg-white p-2 border border-gray-200 rounded-lg shadow-sm">
                      <div className="flex-1 min-w-0">
                        <select className="w-full border-gray-200 bg-gray-50 focus:bg-white p-1.5 rounded-md text-sm border truncate" value={detail.equipmentId} onChange={e => handleChangeDetail(detail.id, 'equipmentId', e.target.value)}>
                          <option value="">- Chọn Thiết bị -</option>
                          {availableEquipments.map(eq => <option key={eq} value={eq}>{eq}</option>)}
                        </select>
                      </div>
                      <div className="w-28 shrink-0">
                        <Input value={detail.status} onChange={(e: any) => handleChangeDetail(detail.id, 'status', e.target.value)} placeholder="Tình trạng" className="w-full p-1.5 text-sm h-8" />
                      </div>
                      <div className="w-[100px] shrink-0 flex items-center gap-1">
                         <Input 
                           type="number" 
                           step="any"
                           value={detail.quantity} 
                           onChange={(e: any) => handleChangeDetail(detail.id, 'quantity', e.target.value)} 
                           className="w-full p-1.5 text-sm h-8 text-center font-medium" 
                           placeholder="SL"
                         />
                         {detail.unit && <span className="text-xs text-gray-500 font-medium whitespace-nowrap">{detail.unit}</span>}
                      </div>
                      <div className="w-12 shrink-0 flex justify-center">
                        <button 
                          onClick={() => setNoteDialog({ isOpen: true, detailId: detail.id })}
                          className={`p-1.5 rounded-md transition-colors ${hasNote ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                          title="Ghi chú"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      </div>
                      <button onClick={() => handleRemoveDetail(detail.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                };

                const renderSpaceBlock = (spaceCode: 'Indoor'|'Outdoor'|'') => {
                    const items = detailsList.filter(d => spaceCode ? d.spaceId === spaceCode : true);
                    const title = spaceCode === 'Indoor' ? <><Home className="w-4 h-4"/> INDOOR</> : spaceCode === 'Outdoor' ? <><Cloud className="w-4 h-4"/> OUTDOOR</> : null;
                    const titleClass = spaceCode === 'Indoor' ? "text-indigo-700" : "text-blue-700";
                    
                    return (
                        <div key={spaceCode} className="bg-gray-50/50 p-3 rounded-xl border border-gray-200 border-dashed space-y-3 overflow-x-auto">
                             {title && <h4 className={`font-bold flex items-center gap-1.5 text-sm ${titleClass}`}>{title}</h4>}
                             {items.length === 0 ? (
                                 <div className="text-center py-4 text-gray-400 text-sm border border-dashed border-gray-300 rounded-lg bg-white/50">Chưa có thiết bị.</div>
                             ) : (
                                 <div className="space-y-2 min-w-[500px]">
                                     <div className="flex gap-2 items-center px-2 py-1 text-xs font-semibold text-gray-500">
                                       <div className="flex-1">Thiết bị</div>
                                       <div className="w-28 text-center shrink-0">Tình trạng</div>
                                       <div className="w-[100px] text-center shrink-0">Số lượng</div>
                                       <div className="w-12 text-center shrink-0">Ghi chú</div>
                                       <div className="w-8 shrink-0"></div>
                                     </div>
                                     {items.map(renderDetailRow)}
                                 </div>
                             )}
                             <div className="flex justify-end">
                                <Button size="sm" variant="outline" onClick={() => handleAddDetail(spaceCode || undefined)} className="text-xs h-7 px-3 bg-white hover:bg-gray-100 flex items-center gap-1 font-medium text-gray-700 border-gray-300 shadow-sm">
                                   <Plus className="w-3.5 h-3.5" /> Add
                                </Button>
                             </div>
                        </div>
                    )
                };

                if (workSpace === 'Full') {
                  return (
                    <div className="space-y-4">
                      {renderSpaceBlock('Indoor')}
                      {renderSpaceBlock('Outdoor')}
                    </div>
                  );
                } else {
                  return renderSpaceBlock('');
                }
              })()}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 flex gap-3">
          <Button variant="secondary" className="flex-1 py-3" onClick={onClose}>Hủy</Button>
          <Button className="flex-1 py-3" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Đang lưu...' : 'Lưu Báo Cáo'}
          </Button>
        </div>
      </motion.div>

      {/* Detail Delete Confirmation Modal */}
      <AnimatePresence>
        {confirmDialog.isOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl"
            >
              <h3 className="text-lg font-bold text-gray-900 mb-2">Xác nhận xóa</h3>
              <p className="text-gray-600 mb-6 text-sm">Bạn có chắc chắn muốn xóa thiết bị này khỏi danh sách báo cáo không?</p>
              <div className="flex justify-end gap-3">
                <Button variant="secondary" size="sm" onClick={() => setConfirmDialog({ isOpen: false, detailId: null })}>Hủy</Button>
                <Button variant="danger" size="sm" onClick={confirmRemoveDetail}>Xóa</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Note Edit Modal */}
      <AnimatePresence>
        {noteDialog.isOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white rounded-xl p-0 max-w-lg w-full shadow-xl overflow-hidden flex flex-col"
            >
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="text-lg font-bold text-gray-900">Chi tiết ghi chú</h3>
                <button onClick={() => setNoteDialog({ isOpen: false, detailId: null })} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5"/>
                </button>
              </div>
              <div className="p-4 flex-1">
                {(() => {
                  const detail = detailsList.find(d => d.id === noteDialog.detailId);
                  if (!detail) return null;
                  return (
                    <textarea 
                      className="w-full border p-3 rounded-lg min-h-[150px] resize-none outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      placeholder="Gõ ghi chú chi tiết cho thiết bị này..."
                      autoFocus
                      value={detail.note || ''}
                      onChange={(e) => handleChangeDetail(detail.id, 'note', e.target.value)}
                    />
                  );
                })()}
              </div>
              <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50">
                <Button 
                   className="w-24 bg-blue-600 hover:bg-blue-700 text-white" 
                   onClick={() => setNoteDialog({ isOpen: false, detailId: null })}
                >
                  Xong
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('planner');
  const [stations, setStations] = useState<Station[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [dailyPlans, setDailyPlans] = useState<DailyPlan[]>([]);
  const [equipmentDict, setEquipmentDict] = useState<EquipmentDict[]>([]);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<ValidationWarning[] | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCreateReportModalOpen, setIsCreateReportModalOpen] = useState(false);
  const [prefilledStationId, setPrefilledStationId] = useState<string>('');

  // Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
        // Skip logging for other errors, as this is simply a connection test.
      }
    }
    testConnection();
  }, []);

  const login = () => signInWithPopup(auth, new GoogleAuthProvider());
  const logout = () => signOut(auth);

  // Firestore Data
  useEffect(() => {
    if (!user) return;

    const stationsUnsubscribe = onSnapshot(collection(db, 'stations'), (snapshot) => {
      setStations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Station)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'stations');
    });

    const reportsUnsubscribe = onSnapshot(
      query(collection(db, 'reports'), where('userId', '==', user.uid), orderBy('date', 'desc')), 
      (snapshot) => {
        setReports(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Report)));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'reports');
      }
    );

    const plansUnsubscribe = onSnapshot(
      query(collection(db, 'dailyPlans'), where('userId', '==', user.uid)), 
      (snapshot) => {
        setDailyPlans(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyPlan)));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'dailyPlans');
      }
    );

    const equipUnsubscribe = onSnapshot(collection(db, 'equipment_dictionary'), async (snapshot) => {
      if (snapshot.empty) {
        // Seed initial data if empty
        const initialEquipments: Omit<EquipmentDict, 'id'>[] = [
          { name: 'Khối Baseband', validSpaces: ['Indoor'] },
          { name: 'Khối Nguồn', validSpaces: ['Indoor'] },
          { name: 'Khối MU', validSpaces: ['Indoor'] },
          { name: 'Khối RF', validSpaces: ['Outdoor', 'Indoor'] },
          { name: 'RRU', validSpaces: ['Outdoor'] },
          { name: 'Anten', validSpaces: ['Outdoor'] },
          { name: 'Sợi quang', validSpaces: ['Indoor', 'Outdoor'] },
          { name: 'Jumper', validSpaces: ['Indoor', 'Outdoor'] },
          { name: 'Dây nguồn', validSpaces: ['Indoor', 'Outdoor'] }
        ];
        try {
          for (const eq of initialEquipments) {
            await addDoc(collection(db, 'equipment_dictionary'), eq);
          }
        } catch (e) {
          console.error("Failed to seed equipment dictionary", e);
        }
      } else {
        setEquipmentDict(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EquipmentDict)));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'equipment_dictionary');
    });

    const taskGroupUnsubscribe = onSnapshot(collection(db, 'task_groups'), async (snapshot) => {
      if (snapshot.empty) {
        const initialTaskGroups = [
          { name: 'Lắp đặt' }, { name: 'Tích hợp' }, { name: 'Sửa chữa' }, { name: 'Thu hồi' }
        ];
        for (const tg of initialTaskGroups) {
          await addDoc(collection(db, 'task_groups'), tg);
        }
      } else {
        setTaskGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TaskGroup)));
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'task_groups'));

    return () => {
      stationsUnsubscribe();
      reportsUnsubscribe();
      plansUnsubscribe();
      equipUnsubscribe();
      taskGroupUnsubscribe();
    };
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full"
        >
          <div className="bg-blue-600 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-blue-200">
            <Route className="text-white w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Telecom Station Manager</h1>
          <p className="text-gray-600 mb-8">Quản lý trạm viễn thông, tối ưu hóa tuyến đường và báo cáo công việc hàng ngày.</p>
          <Button onClick={login} className="w-full py-4 text-lg">
            Đăng nhập với Google
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      {activeTab !== 'dashboard' && (
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-blue-600 p-1.5 rounded-lg">
                <Route className="text-white w-5 h-5" />
              </div>
              <span className="font-bold text-gray-900">TSM App</span>
            </div>
            
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500 hidden sm:block">{user.displayName}</span>
              <button onClick={logout} className="p-2 text-gray-400 hover:text-red-600 transition-colors">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Main Content */}
      <main className={cn("max-w-4xl mx-auto relative", activeTab !== 'dashboard' ? "p-4" : "")}>
        {activeTab === 'dashboard' && <DashboardTab key="dashboard" stations={stations} reports={reports} dailyPlans={dailyPlans} user={user} validationWarnings={validationWarnings} setValidationWarnings={setValidationWarnings} />}
        {activeTab === 'stations' && <StationsTab key="stations" stations={stations} reports={reports} validationWarnings={validationWarnings} setValidationWarnings={setValidationWarnings} />}
        {activeTab === 'planner' && <PlannerTab key="planner" stations={stations} dailyPlans={dailyPlans} user={user} reports={reports} onOpenCreateReport={(stationId) => { setPrefilledStationId(stationId); setIsCreateReportModalOpen(true); }} />}
        {activeTab === 'settings' && <SettingsTab key="settings" user={user} logout={logout} />}
        {activeTab === 'admin' && <AdminTab key="admin" equipmentDict={equipmentDict} taskGroups={taskGroups} />}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.05)] rounded-t-3xl z-40">
        <div className="max-w-4xl mx-auto flex justify-between items-center px-4 sm:px-6 py-2 relative">
          <NavButton 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
            icon={<Home />} 
            label="Trang chủ" 
          />
          <NavButton 
            active={activeTab === 'planner'} 
            onClick={() => setActiveTab('planner')} 
            icon={<Route />} 
            label="Lộ trình" 
          />
          
          {/* Floating Action Button */}
          <div className="relative -top-8 flex justify-center w-14 sm:w-16 shrink-0">
            <div className="absolute w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-full -top-1 sm:-top-2 flex items-center justify-center shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.05)]">
              <button 
                onClick={() => { setPrefilledStationId(''); setIsCreateReportModalOpen(true); }}
                className="w-12 h-12 sm:w-16 sm:h-16 bg-[#b90000] rounded-full flex items-center justify-center text-white shadow-lg hover:bg-red-800 transition-colors"
                title="Tạo báo cáo nhanh"
              >
                <span className="text-3xl sm:text-4xl font-light leading-none mb-1">+</span>
              </button>
            </div>
          </div>

          <NavButton 
            active={activeTab === 'stations'} 
            onClick={() => setActiveTab('stations')} 
            icon={<MapPin />} 
            label="Danh sách" 
          />
          <NavButton 
            active={activeTab === 'admin'} 
            onClick={() => setActiveTab('admin')} 
            icon={<Shield />} 
            label="Quản trị" 
          />
          <NavButton 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')} 
            icon={<Settings />} 
            label="Cài đặt" 
          />
        </div>
      </nav>

      {/* Full-screen Master-Detail Report Modal */}
      {user && (
        <CreateReportModal 
          isOpen={isCreateReportModalOpen} 
          onClose={() => setIsCreateReportModalOpen(false)} 
          stations={stations} 
          user={user} 
          equipmentDict={equipmentDict}
          taskGroups={taskGroups}
          initialStationId={prefilledStationId}
          reports={reports}
        />
      )}
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: any) {
  const isLong = label.length > 10;
  return (
    <button 
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1.5 pt-2 pb-1 transition-all duration-300 w-16 overflow-hidden group',
        active ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
      )}
    >
      <div className={cn(
        "relative w-12 h-10 rounded-2xl transition-all duration-300 flex items-center justify-center",
        active ? "bg-blue-600 text-white shadow-md shadow-blue-600/30" : "bg-transparent text-gray-500 group-hover:bg-gray-100"
      )}>
        {React.cloneElement(icon, { 
          className: cn(
            'w-5 h-5 flex-shrink-0 transition-all duration-300', 
            active ? 'stroke-[2.5px]' : 'stroke-2'
          ) 
        })}
      </div>
      <div className="nav-text-container">
        <span className={cn(
          "text-[10px] nav-text-scroll transition-all duration-300", 
          active ? "font-bold" : "font-medium",
          isLong ? "is-long" : ""
        )}>{label}</span>
      </div>
    </button>
  );
}

// --- Tab Components ---

function StationsTab({ stations, reports, validationWarnings, setValidationWarnings }: { stations: Station[], reports: Report[], validationWarnings: ValidationWarning[] | null, setValidationWarnings: (warnings: ValidationWarning[] | null) => void }) {
  const [isAdding, setIsAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [newStation, setNewStation] = useState<Partial<Station>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [expandedStationId, setExpandedStationId] = useState<string | null>(null);
  const [showWarningsModal, setShowWarningsModal] = useState(false);
  const [viewingReport, setViewingReport] = useState<Report | null>(null);

  // Upload mapping states
  const [uploadData, setUploadData] = useState<any[]>([]);
  const [uploadHeaders, setUploadHeaders] = useState<string[]>([]);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({
    stationCode: '', name: '', latitude: '', longitude: '', address: '', managerName: '', managerPhone: '', status: ''
  });

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({
    isOpen: false, title: '', message: '', onConfirm: () => {}
  });

  const [filterManagers, setFilterManagers] = useState<string[]>([]);
  const [isManagerDropdownOpen, setIsManagerDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleMarkAsRead = (id: string) => {
    if (!validationWarnings) return;
    setValidationWarnings(validationWarnings.map(w => w.id === id ? { ...w, isRead: true } : w));
  };

  const handleDeleteWarning = (id: string) => {
    if (!validationWarnings) return;
    const newWarnings = validationWarnings.filter(w => w.id !== id);
    setValidationWarnings(newWarnings.length > 0 ? newWarnings : null);
    if (newWarnings.length === 0) setShowWarningsModal(false);
  };

  const handleMarkAllAsRead = () => {
    if (!validationWarnings) return;
    setValidationWarnings(validationWarnings.map(w => ({ ...w, isRead: true })));
  };

  const unreadCount = validationWarnings ? validationWarnings.filter(w => !w.isRead).length : 0;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsManagerDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const uniqueManagers = Array.from(new Set(stations.map(s => s.managerName).filter(Boolean)));

  const filteredStations = stations.filter(s => {
    const searchLower = search.toLowerCase();
    const matchesSearch = 
      s.name.toLowerCase().includes(searchLower) || 
      (s.managerName && s.managerName.toLowerCase().includes(searchLower));
    
    const matchesManager = filterManagers.length === 0 || filterManagers.includes(s.managerName);

    return matchesSearch && matchesManager;
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStation.name || !newStation.latitude || !newStation.longitude) return;
    try {
      await addDoc(collection(db, 'stations'), newStation);
      setNewStation({});
      setIsAdding(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStation || !editingStation.name || !editingStation.latitude || !editingStation.longitude) return;
    try {
      const { id, ...data } = editingStation;
      await updateDoc(doc(db, 'stations', id), data);
      setEditingStation(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setNewStation({ ...newStation, icon: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const handleEditIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingStation) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setEditingStation({ ...editingStation, icon: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const fileExt = file.name.split('.').pop()?.toLowerCase();

    try {
      let data: any[] = [];

      if (fileExt === 'csv' || fileExt === 'txt') {
        data = await new Promise((resolve, reject) => {
          Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => resolve(results.data),
            error: (error) => reject(error)
          });
        });
      } else if (fileExt === 'xlsx' || fileExt === 'xls') {
        const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
          reader.onerror = () => reject(new Error('Không thể đọc file Excel'));
          reader.readAsArrayBuffer(file);
        });
        
        const read = XLSX.read || (XLSX as any).default?.read;
        const utils = XLSX.utils || (XLSX as any).default?.utils;
        
        if (!read || !utils) {
          throw new Error('Thư viện đọc Excel (XLSX) không khả dụng.');
        }
        
        const workbook = read(arrayBuffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        data = utils.sheet_to_json(worksheet);
      } else {
        throw new Error('Định dạng file không được hỗ trợ. Vui lòng tải lên file .csv, .txt, .xlsx, hoặc .xls');
      }

      if (data.length === 0) {
        alert('File không có dữ liệu');
        setIsUploading(false);
        e.target.value = '';
        return;
      }

      const headers = Object.keys(data[0]);
      setUploadHeaders(headers);
      setUploadData(data);

      const mapping: Record<string, string> = {
        infrastructureCode: '', name: '', infrastructureDepartment: '', latitude: '', longitude: '', address: '', managerName: '', managerPhone: '', status: ''
      };
      
      headers.forEach(h => {
        const normalized = h.toLowerCase().trim().replace(/\s+/g, '');
        if (!mapping.infrastructureCode && (normalized.includes('mãcsht') || normalized.includes('macsht') || normalized.includes('infrastructurecode'))) mapping.infrastructureCode = h;
        else if (!mapping.name && (normalized.includes('name') || normalized.includes('tên') || normalized.includes('station') || normalized.includes('tram') || normalized.includes('mã') || normalized.includes('code'))) mapping.name = h;
        else if (!mapping.infrastructureDepartment && (normalized.includes('phònghạtầng') || normalized.includes('phonghatang') || normalized.includes('department'))) mapping.infrastructureDepartment = h;
        else if (!mapping.latitude && (normalized.includes('lat') || normalized.includes('vĩđộ') || normalized.includes('vido'))) mapping.latitude = h;
        else if (!mapping.longitude && (normalized.includes('lng') || normalized.includes('long') || normalized.includes('kinhđộ') || normalized.includes('kinhdo'))) mapping.longitude = h;
        else if (!mapping.address && (normalized.includes('address') || normalized.includes('địachỉ') || normalized.includes('diachi'))) mapping.address = h;
        else if (!mapping.managerName && (normalized.includes('managername') || normalized.includes('quảnlý') || normalized.includes('quanly') || normalized.includes('người'))) mapping.managerName = h;
        else if (!mapping.managerPhone && (normalized.includes('phone') || normalized.includes('điệnthoại') || normalized.includes('dienthoai') || normalized.includes('sđt') || normalized.includes('sdt'))) mapping.managerPhone = h;
        else if (!mapping.status && (normalized.includes('status') || normalized.includes('trạngthái') || normalized.includes('trangthai') || normalized.includes('kiểm tra'))) mapping.status = h;
      });

      setColumnMapping(mapping);
      setShowMappingModal(true);
    } catch (err: any) {
      console.error(err);
      alert(`Lỗi đọc file: ${err.message || 'Không xác định'}`);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const processUpload = async () => {
    setIsUploading(true);
    setShowMappingModal(false);
    try {
      const validStations: any[] = [];
      for (const rawRow of uploadData) {
        let infrastructureCode = rawRow[columnMapping.infrastructureCode] || '';
        let name = rawRow[columnMapping.name];
        let infrastructureDepartment = rawRow[columnMapping.infrastructureDepartment] || '';
        let lat = rawRow[columnMapping.latitude];
        let lng = rawRow[columnMapping.longitude];
        let address = rawRow[columnMapping.address] || '';
        let managerName = rawRow[columnMapping.managerName] || '';
        let managerPhone = rawRow[columnMapping.managerPhone] || '';
        let statusRaw = rawRow[columnMapping.status] || '';
        
        let status: 'checked' | 'unchecked' = 'unchecked';
        if (typeof statusRaw === 'string') {
          const s = statusRaw.toLowerCase();
          if (s.includes('đã') || s.includes('checked') || s.includes('ok') || s === '1' || s === 'true') {
            status = 'checked';
          }
        }

        if (typeof lat === 'string') lat = lat.replace(',', '.');
        if (typeof lng === 'string') lng = lng.replace(',', '.');

        const parsedLat = parseFloat(lat);
        const parsedLng = parseFloat(lng);

        if (name && String(name).trim() !== '' && lat !== undefined && lng !== undefined && !isNaN(parsedLat) && !isNaN(parsedLng)) {
          validStations.push({
            infrastructureCode: String(infrastructureCode || ''),
            name: String(name).trim(),
            infrastructureDepartment: String(infrastructureDepartment || ''),
            latitude: parsedLat,
            longitude: parsedLng,
            address: String(address || ''),
            managerName: String(managerName || ''),
            managerPhone: String(managerPhone || ''),
            status: status
          });
        }
      }
      
      if (validStations.length === 0) {
        alert('Lỗi: Không tìm thấy dữ liệu hợp lệ. Vui lòng đảm bảo bạn đã chọn đúng cột Tên trạm, Vĩ độ và Kinh độ (Vĩ độ/Kinh độ phải là số).');
        setIsUploading(false);
        return;
      }

      setIsValidating(true);
      let warnings: ValidationWarning[] = [];
      try {
        if (process.env.GEMINI_API_KEY) {
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          const prompt = `Tôi có danh sách các trạm viễn thông sau (Tên, Địa chỉ, Vĩ độ, Kinh độ):
          ${validStations.map(s => `- ${s.name} | ${s.address} | ${s.latitude}, ${s.longitude}`).join('\n')}
          
          Hãy kiểm tra xem có trạm nào mà tọa độ (vĩ độ, kinh độ) có vẻ bị sai lệch hoàn toàn so với địa chỉ không (ví dụ: địa chỉ ở Hà Nội nhưng tọa độ ở TP.HCM, hoặc tọa độ ngoài biển, ngoài lãnh thổ Việt Nam).
          Trả về kết quả dưới dạng mảng JSON chứa các object có cấu trúc:
          [
            {
              "name": "Tên trạm",
              "address": "Địa chỉ",
              "latitude": 10.0,
              "longitude": 106.0,
              "issue": "Mô tả lỗi (ví dụ: Tọa độ nằm ngoài lãnh thổ Việt Nam)",
              "recommendation": "Khuyến cáo (ví dụ: Kiểm tra lại tọa độ)"
            }
          ]
          Nếu không có trạm nào sai, trả về mảng rỗng []. Chỉ trả về JSON, không giải thích thêm.`;

          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
          });

          const text = response.text?.trim() || '[]';
          const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsedWarnings = JSON.parse(jsonStr);
          warnings = parsedWarnings.map((w: any) => ({
            ...w,
            id: Math.random().toString(36).substring(2, 9),
            isRead: false
          }));
        } else {
          console.warn("GEMINI_API_KEY is not defined. Skipping AI validation.");
        }
      } catch (err) {
        console.error("AI Validation error:", err);
      }
      setIsValidating(false);

      let successCount = 0;
      let errorCount = 0;
      let errorDetails: string[] = [];
      for (const station of validStations) {
        try {
          await addDoc(collection(db, 'stations'), station);
          successCount++;
        } catch (error: any) {
          console.error("Error adding station:", station.name, error);
          errorCount++;
          if (errorDetails.length < 5) {
            errorDetails.push(`Trạm ${station.name}: ${error.message}`);
          }
        }
      }

      if (warnings.length > 0) {
        setValidationWarnings(warnings);
        setShowWarningsModal(true);
        alert(`Đã nhập thành công ${successCount} trạm! Phát hiện ${warnings.length} trạm có tọa độ đáng ngờ. Vui lòng kiểm tra thông báo ở Trang chủ.`);
      } else {
        alert(`Đã nhập thành công ${successCount} trạm!`);
      }
      
      if (errorCount > 0) {
        alert(`Có ${errorCount} trạm bị lỗi khi lưu vào cơ sở dữ liệu.\nChi tiết lỗi (tối đa 5):\n${errorDetails.join('\n')}\n\nVui lòng kiểm tra lại định dạng dữ liệu hoặc quyền truy cập.`);
      }
    } catch (err: any) {
      console.error(err);
      let msg = err.message || 'Có lỗi xảy ra khi lưu dữ liệu.';
      if (msg.includes('Missing or insufficient permissions') || msg.includes('operationType')) {
        msg = 'Lỗi phân quyền: Dữ liệu không hợp lệ hoặc bạn không có quyền thêm dữ liệu.';
      }
      alert(msg);
    } finally {
      setIsUploading(false);
      setUploadData([]);
      setUploadHeaders([]);
    }
  };

  const handleDelete = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Xóa trạm',
      message: 'Bạn có chắc chắn muốn xóa trạm này?',
      onConfirm: async () => {
        await deleteDoc(doc(db, 'stations', id));
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleDeleteAll = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Xóa tất cả trạm',
      message: 'Bạn có chắc chắn muốn xóa TẤT CẢ các trạm? Hành động này không thể hoàn tác.',
      onConfirm: async () => {
        for (const station of stations) {
          await deleteDoc(doc(db, 'stations', station.id));
        }
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      transition={{ duration: 0.15 }}
      className="space-y-6 w-full relative"
    >
      {/* Validation Loading Overlay */}
      {isValidating && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl flex flex-col items-center text-center">
            <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Đang kiểm tra dữ liệu</h3>
            <p className="text-sm text-gray-600">AI đang phân tích tọa độ và địa chỉ các trạm...</p>
          </div>
        </div>
      )}

      {/* Validation Warnings Modal */}
      <AnimatePresence>
        {showWarningsModal && validationWarnings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] flex flex-col"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-red-600 flex items-center gap-2">
                  <X className="w-6 h-6" />
                  Cảnh báo dữ liệu trạm
                </h3>
                <button onClick={() => setShowWarningsModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 pr-2 space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-gray-600 text-sm">
                    AI đã phát hiện {validationWarnings.length} trạm có tọa độ đáng ngờ ({unreadCount} chưa đọc):
                  </p>
                  {unreadCount > 0 && (
                    <button onClick={handleMarkAllAsRead} className="text-sm text-blue-600 hover:underline">
                      Đánh dấu tất cả đã đọc
                    </button>
                  )}
                </div>
                {validationWarnings.map((warning) => (
                  <div key={warning.id} className={cn("border rounded-xl p-4 relative transition-colors", warning.isRead ? "bg-gray-50 border-gray-200" : "bg-red-50 border-red-100")}>
                    <div className="flex justify-between items-start mb-1">
                      <h4 className={cn("font-bold", warning.isRead ? "text-gray-700" : "text-red-900")}>{warning.name}</h4>
                      <div className="flex gap-3">
                        {!warning.isRead && (
                          <button onClick={() => handleMarkAsRead(warning.id)} className="text-xs text-blue-600 hover:underline font-medium">
                            Đã đọc
                          </button>
                        )}
                        <button onClick={() => handleDeleteWarning(warning.id)} className="text-xs text-red-500 hover:underline font-medium">
                          Xóa
                        </button>
                      </div>
                    </div>
                    <div className={cn("text-sm space-y-1", warning.isRead ? "text-gray-500" : "text-red-800")}>
                      <p><span className="font-medium">Địa chỉ:</span> {warning.address}</p>
                      <p><span className="font-medium">Tọa độ:</span> {warning.latitude}, {warning.longitude}</p>
                      <p><span className="font-medium">Vấn đề:</span> {warning.issue}</p>
                      <p><span className="font-medium">Khuyến cáo:</span> {warning.recommendation}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
                <Button onClick={() => setShowWarningsModal(false)}>
                  Đã hiểu
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Danh sách</h2>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleDeleteAll} variant="danger" disabled={stations.length === 0}>
            <Trash2 className="w-5 h-5" />
            <span className="hidden sm:inline">Xóa tất cả</span>
          </Button>
          <label className="cursor-pointer">
            <input type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
            <div className={cn("px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 bg-gray-100 text-gray-900 hover:bg-gray-200", isUploading && "opacity-50 cursor-not-allowed")}>
              <Upload className="w-5 h-5" />
              <span className="hidden sm:inline">{isUploading ? 'Đang nhập...' : 'Nhập File'}</span>
            </div>
          </label>
          <Button onClick={() => setIsAdding(!isAdding)} variant={isAdding ? 'secondary' : 'primary'}>
            {isAdding ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            <span className="hidden sm:inline">{isAdding ? 'Hủy' : 'Thêm trạm'}</span>
          </Button>
        </div>
      </div>

      {isAdding && (
        <Card className="p-4">
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input placeholder="Mã CSHT" value={newStation.infrastructureCode || ''} onChange={(e: any) => setNewStation({...newStation, infrastructureCode: e.target.value})} />
              <Input placeholder="Tên trạm" value={newStation.name || ''} onChange={(e: any) => setNewStation({...newStation, name: e.target.value})} required />
              <Input placeholder="Phòng Hạ Tầng" value={newStation.infrastructureDepartment || ''} onChange={(e: any) => setNewStation({...newStation, infrastructureDepartment: e.target.value})} />
              <Input placeholder="Địa chỉ" value={newStation.address || ''} onChange={(e: any) => setNewStation({...newStation, address: e.target.value})} required />
              <Input type="number" step="any" placeholder="Vĩ độ (Lat)" value={newStation.latitude || ''} onChange={(e: any) => setNewStation({...newStation, latitude: parseFloat(e.target.value)})} required />
              <Input type="number" step="any" placeholder="Kinh độ (Lng)" value={newStation.longitude || ''} onChange={(e: any) => setNewStation({...newStation, longitude: parseFloat(e.target.value)})} required />
              <Input placeholder="Người quản lý" value={newStation.managerName || ''} onChange={(e: any) => setNewStation({...newStation, managerName: e.target.value})} required />
              <Input placeholder="Số điện thoại" value={newStation.managerPhone || ''} onChange={(e: any) => setNewStation({...newStation, managerPhone: e.target.value})} required />
              <select 
                className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={newStation.status || 'unchecked'}
                onChange={(e: any) => setNewStation({...newStation, status: e.target.value as 'checked' | 'unchecked'})}
              >
                <option value="unchecked">Chưa kiểm tra</option>
                <option value="checked">Đã kiểm tra</option>
              </select>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Biểu tượng / Hình ảnh trạm</label>
                <div className="flex items-center gap-4">
                  {newStation.icon && (
                    <img src={newStation.icon} alt="Icon" className="w-12 h-12 rounded-lg object-cover border border-gray-200" referrerPolicy="no-referrer" />
                  )}
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={handleIconUpload} />
                    <div className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                      Chọn ảnh
                    </div>
                  </label>
                  {newStation.icon && (
                    <button type="button" onClick={() => setNewStation({...newStation, icon: undefined})} className="text-red-500 text-sm hover:underline">Xóa</button>
                  )}
                </div>
              </div>
            </div>
            <Button type="submit" className="w-full">Lưu trạm</Button>
          </form>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input 
            className="pl-10 w-full" 
            placeholder="Tìm kiếm tên trạm hoặc người quản lý..." 
            value={search}
            onChange={(e: any) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative" ref={dropdownRef}>
            <button 
              onClick={() => setIsManagerDropdownOpen(!isManagerDropdownOpen)}
              className="border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white flex items-center justify-between min-w-[200px]"
            >
              <span className="truncate">
                {filterManagers.length === 0 ? 'Tất cả người quản lý' : `Đã chọn ${filterManagers.length} người`}
              </span>
              <ChevronDown className="w-4 h-4 ml-2" />
            </button>
            
            {isManagerDropdownOpen && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                <div 
                  className="p-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2"
                  onClick={() => setFilterManagers([])}
                >
                  <input type="checkbox" checked={filterManagers.length === 0} readOnly className="rounded text-blue-600" />
                  <span className="text-sm">Tất cả</span>
                </div>
                {uniqueManagers.map(manager => (
                  <div 
                    key={manager}
                    className="p-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2"
                    onClick={() => {
                      if (filterManagers.includes(manager)) {
                        setFilterManagers(filterManagers.filter(m => m !== manager));
                      } else {
                        setFilterManagers([...filterManagers, manager]);
                      }
                    }}
                  >
                    <input type="checkbox" checked={filterManagers.includes(manager)} readOnly className="rounded text-blue-600" />
                    <span className="text-sm">{manager}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredStations.map(station => (
        <Card key={station.id} className="p-4 group">
            {editingStation?.id === station.id ? (
              <form onSubmit={handleEdit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input placeholder="Mã CSHT" value={editingStation.infrastructureCode || ''} onChange={(e: any) => setEditingStation({...editingStation, infrastructureCode: e.target.value})} />
                  <Input placeholder="Tên trạm" value={editingStation.name || ''} onChange={(e: any) => setEditingStation({...editingStation, name: e.target.value})} required />
                  <Input placeholder="Phòng Hạ Tầng" value={editingStation.infrastructureDepartment || ''} onChange={(e: any) => setEditingStation({...editingStation, infrastructureDepartment: e.target.value})} />
                  <Input placeholder="Địa chỉ" value={editingStation.address || ''} onChange={(e: any) => setEditingStation({...editingStation, address: e.target.value})} required />
                  <Input type="number" step="any" placeholder="Vĩ độ (Lat)" value={editingStation.latitude || ''} onChange={(e: any) => setEditingStation({...editingStation, latitude: parseFloat(e.target.value)})} required />
                  <Input type="number" step="any" placeholder="Kinh độ (Lng)" value={editingStation.longitude || ''} onChange={(e: any) => setEditingStation({...editingStation, longitude: parseFloat(e.target.value)})} required />
                  <Input placeholder="Người quản lý" value={editingStation.managerName || ''} onChange={(e: any) => setEditingStation({...editingStation, managerName: e.target.value})} required />
                  <Input placeholder="Số điện thoại" value={editingStation.managerPhone || ''} onChange={(e: any) => setEditingStation({...editingStation, managerPhone: e.target.value})} required />
                  <select 
                    className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={editingStation.status || 'unchecked'}
                    onChange={(e: any) => setEditingStation({...editingStation, status: e.target.value as 'checked' | 'unchecked'})}
                  >
                    <option value="unchecked">Chưa kiểm tra</option>
                    <option value="checked">Đã kiểm tra</option>
                  </select>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Biểu tượng / Hình ảnh trạm</label>
                    <div className="flex items-center gap-4">
                      {editingStation.icon && (
                        <img src={editingStation.icon} alt="Icon" className="w-12 h-12 rounded-lg object-cover border border-gray-200" referrerPolicy="no-referrer" />
                      )}
                      <label className="cursor-pointer">
                        <input type="file" accept="image/*" className="hidden" onChange={handleEditIconUpload} />
                        <div className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                          Chọn ảnh
                        </div>
                      </label>
                      {editingStation.icon && (
                        <button type="button" onClick={() => setEditingStation({...editingStation, icon: undefined})} className="text-red-500 text-sm hover:underline">Xóa</button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1">Lưu thay đổi</Button>
                  <Button type="button" variant="secondary" onClick={() => setEditingStation(null)}>Hủy</Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col gap-2">
                <div 
                  className="flex justify-between items-start cursor-pointer" 
                  onClick={() => setExpandedStationId(expandedStationId === station.id ? null : station.id)}
                >
                  <div className="flex items-center gap-3">
                    {station.icon ? (
                      <img src={station.icon} alt={station.name} className="w-10 h-10 rounded-lg object-cover border border-gray-200" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                        <MapPin className="w-5 h-5" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {station.infrastructureCode && (
                          <span className="text-xs font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                            {station.infrastructureCode}
                          </span>
                        )}
                        <h3 className="font-bold text-lg text-gray-900">{station.name}</h3>
                        {station.infrastructureDepartment && (
                          <span className="text-xs font-medium text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded">
                            {station.infrastructureDepartment}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                        <div className="flex items-center gap-1.5">
                          <UserIcon className="w-4 h-4" />
                          <span>{station.managerName || 'Chưa cập nhật'}</span>
                        </div>
                        {station.managerPhone && (
                          <a href={`tel:${station.managerPhone}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 hover:text-blue-600 transition-colors">
                            <Phone className="w-4 h-4" />
                            <span>{station.managerPhone}</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setEditingStation(station); }}
                      className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(station.id); }}
                      className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {expandedStationId === station.id && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }} 
                      animate={{ height: 'auto', opacity: 1 }} 
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-4 border-t border-gray-100 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-gray-900">Thông tin địa chỉ</h4>
                            <span className={cn(
                              "text-xs px-2 py-1 rounded-full font-medium",
                              station.status === 'checked' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            )}>
                              {station.status === 'checked' ? 'Đã kiểm tra' : 'Chưa kiểm tra'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                              <MapPin className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="font-medium text-gray-900">{station.address || 'Chưa cập nhật'}</div>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold text-gray-900">Vị trí bản đồ</h4>
                          <a 
                            href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-3 bg-blue-50 hover:bg-blue-100 transition-colors rounded-lg group"
                          >
                            <div className="w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center text-blue-700">
                              <Navigation className="w-5 h-5 group-hover:scale-110 transition-transform" />
                            </div>
                            <div>
                              <div className="font-medium text-blue-900">Mở Google Maps</div>
                              <div className="text-xs text-blue-700 mt-0.5">
                                {station.latitude}, {station.longitude}
                              </div>
                            </div>
                          </a>
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                          <ClipboardList className="w-4 h-4" />
                          Báo cáo tháng này 
                        </h4>
                        <div className="space-y-2">
                          {(() => {
                            const thisMonthReports = reports.filter(r => {
                              if (r.stationId !== station.id) return false;
                              const reportDate = parseISO(r.date);
                              return isSameMonth(reportDate, new Date());
                            }).sort((a, b) => b.date.localeCompare(a.date));

                            if (thisMonthReports.length === 0) {
                              return <p className="text-sm text-gray-500 italic">Chưa có báo cáo nào trong tháng này.</p>;
                            }

                            return thisMonthReports.map(report => (
                              <div 
                                key={report.id} 
                                className="bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors border border-transparent hover:border-gray-200 rounded-lg p-3 text-sm"
                                onClick={() => setViewingReport(report)}
                              >
                                <div className="flex justify-between items-center mb-1">
                                  <span className="font-medium text-gray-900">{format(parseISO(report.createdAt || report.date), 'dd/MM/yyyy HH:mm:ss')}</span>
                                  <span className={cn(
                                    "text-[10px] uppercase font-bold px-1.5 py-0.5 rounded",
                                    report.status === 'completed' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                                  )}>
                                    {report.status === 'completed' ? 'Hoàn thành' : 'Đang xử lý'}
                                  </span>
                                </div>
                                <p className="text-gray-600 line-clamp-2">{report.content || 'Không có nội dung chi tiết.'}</p>
                                {report.equipmentDetails && report.equipmentDetails.length > 0 && (
                                  <p className="text-xs text-blue-600 mt-1 font-medium">Bao gồm {report.equipmentDetails.reduce((acc, curr) => acc + curr.quantity, 0)} thiết bị/vật tư.</p>
                                )}
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </Card>
        ))}
        {filteredStations.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            Không tìm thấy trạm nào.
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmDialog.isOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-2">{confirmDialog.title}</h3>
              <p className="text-gray-600 mb-6">{confirmDialog.message}</p>
              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}>Hủy</Button>
                <Button variant="danger" onClick={confirmDialog.onConfirm}>Xác nhận</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mapping Modal */}
      <AnimatePresence>
        {showMappingModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white rounded-xl p-6 max-w-2xl w-full shadow-xl max-h-[90vh] overflow-y-auto"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-4">Ghép nối cột dữ liệu</h3>
              <p className="text-gray-600 mb-6">Vui lòng chọn cột tương ứng từ file của bạn cho các trường dữ liệu bên dưới.</p>
              
              <div className="space-y-4 mb-6">
                {[
                  { key: 'infrastructureCode', label: 'Mã CSHT' },
                  { key: 'name', label: 'Tên trạm (*)' },
                  { key: 'infrastructureDepartment', label: 'Phòng Hạ Tầng' },
                  { key: 'latitude', label: 'Vĩ độ (Lat) (*)' },
                  { key: 'longitude', label: 'Kinh độ (Lng) (*)' },
                  { key: 'address', label: 'Địa chỉ' },
                  { key: 'managerName', label: 'Người quản lý' },
                  { key: 'managerPhone', label: 'Số điện thoại' },
                  { key: 'status', label: 'Trạng thái kiểm tra' }
                ].map(field => (
                  <div key={field.key} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <label className="sm:w-1/3 font-medium text-gray-700">{field.label}</label>
                    <select 
                      className="flex-1 border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={columnMapping[field.key] || ''}
                      onChange={(e) => setColumnMapping({...columnMapping, [field.key]: e.target.value})}
                    >
                      <option value="">-- Bỏ qua --</option>
                      {uploadHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={() => setShowMappingModal(false)}>Hủy</Button>
                <Button onClick={processUpload} disabled={!columnMapping.name || !columnMapping.latitude || !columnMapping.longitude}>
                  Xác nhận & Nhập dữ liệu
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* View Report Modal */}
      <AnimatePresence>
        {viewingReport && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[100] flex justify-center items-end sm:items-center p-0 sm:p-4"
          >
            <motion.div 
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              className="bg-white w-full max-w-2xl sm:rounded-xl rounded-t-xl h-[90vh] flex flex-col shadow-2xl"
            >
              <div className="flex justify-between items-center p-4 border-b border-gray-200">
                <h2 className="text-xl font-bold">Chi tiết Báo Cáo</h2>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => {
                      setConfirmDialog({
                        isOpen: true,
                        title: 'Xóa báo cáo',
                        message: `Bạn có chắc chắn muốn xóa báo cáo ngày ${format(parseISO(viewingReport.date), 'dd/MM/yyyy')} không? Hành động này không thể hoàn tác.`,
                        onConfirm: async () => {
                          try {
                            await deleteDoc(doc(db, 'reports', viewingReport.id));
                            setViewingReport(null);
                            setConfirmDialog(p => ({ ...p, isOpen: false }));
                          } catch (e) {
                            console.error("Lỗi xóa báo cáo:", e);
                            alert("Có lỗi khi xóa báo cáo!");
                          }
                        }
                      });
                    }}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                  >
                    <Trash2 className="w-5 h-5"/>
                  </button>
                  <button onClick={() => setViewingReport(null)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full">
                    <X className="w-5 h-5"/>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Trạm</p>
                      <p className="font-bold text-gray-900">{viewingReport.stationName || stations.find(s => s.id === viewingReport.stationId)?.name || viewingReport.stationId}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Ngày</p>
                      <p className="font-medium text-gray-900">{format(parseISO(viewingReport.createdAt || viewingReport.date), 'dd/MM/yyyy HH:mm:ss')}</p>
                    </div>
                    {viewingReport.technologyId && (
                      <div>
                        <p className="text-sm text-gray-500">Công nghệ</p>
                        <p className="font-medium text-gray-900">{viewingReport.technologyId}</p>
                      </div>
                    )}
                    {viewingReport.taskGroupId && (
                      <div>
                        <p className="text-sm text-gray-500">Loại CV</p>
                        <p className="font-medium text-gray-900">
                          {/* Mapped via simple comparison or just ID if not found */}
                          {['TG01', 'TG02', 'TG03', 'TG04'].includes(viewingReport.taskGroupId) ? 
                            (['Lắp đặt', 'Tích hợp', 'Sửa chữa', 'Thu hồi'][['TG01', 'TG02', 'TG03', 'TG04'].indexOf(viewingReport.taskGroupId)] || viewingReport.taskGroupId)
                          : viewingReport.taskGroupId}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-500">Ghi chú tổng quát</p>
                    <p className="bg-gray-50 p-3 rounded-lg text-sm text-gray-800 whitespace-pre-wrap">{viewingReport.content}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold text-blue-700 flex items-center gap-2 border-b pb-2">
                     <Settings2 className="w-5 h-5" /> Chi tiết thiết bị (Detail)
                  </h3>
                  
                  {(!viewingReport.equipmentDetails || viewingReport.equipmentDetails.length === 0) ? (
                    <div className="text-center py-4 text-gray-400 bg-gray-50 rounded-lg italic">
                      Không có thiết bị/vật tư nào được chi tiết trong báo cáo này.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {Array.from(new Set(viewingReport.equipmentDetails.map(d => d.spaceId))).map(space => {
                        const spaceDetails = viewingReport.equipmentDetails!.filter(d => d.spaceId === space);
                        const isIndoor = space.toLowerCase() === 'indoor';
                        
                        return (
                          <div key={space} className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                            <div className="bg-gray-100 px-3 py-2 font-bold text-gray-800 flex items-center gap-2 border-b border-gray-200">
                              {isIndoor ? <Home className="w-4 h-4 text-indigo-600" /> : <Cloud className="w-4 h-4 text-blue-500" />}
                              {space.toUpperCase()}
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm text-left border-collapse">
                                <thead className="bg-white text-gray-500 text-xs uppercase border-b">
                                  <tr>
                                    <th className="px-3 py-2 font-medium">Thiết bị</th>
                                    <th className="px-3 py-2 text-center font-medium">SL</th>
                                    <th className="px-3 py-2 font-medium">Tình trạng</th>
                                    <th className="px-3 py-2 font-medium">Ghi chú</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {spaceDetails.map((detail, idx) => (
                                    <tr key={idx} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50 bg-white">
                                      <td className="px-3 py-2 font-medium text-gray-800">{detail.equipmentId || '-'}</td>
                                      <td className="px-3 py-2 text-center whitespace-nowrap text-blue-700 font-semibold">
                                        {detail.quantity} {detail.unit && <span className="text-xs text-blue-500/70 font-normal ml-0.5">{detail.unit}</span>}
                                      </td>
                                      <td className="px-3 py-2 text-gray-600">{detail.status || '-'}</td>
                                      <td className="px-3 py-2 text-xs text-gray-500 italic">{detail.note || '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function PlannerTab({ stations, dailyPlans, user, reports, onOpenCreateReport }: { stations: Station[], dailyPlans: DailyPlan[], user: User, reports: Report[], onOpenCreateReport: (stationId: string) => void }) {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedStationIds, setSelectedStationIds] = useState<string[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeProgress, setOptimizeProgress] = useState('');
  const [optimizeError, setOptimizeError] = useState<string | null>(null);
  const [optimizedRoute, setOptimizedRoute] = useState<string[] | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null);
  const [routeDistances, setRouteDistances] = useState<number[] | null>(null);
  
  const [confirmSavePlan, setConfirmSavePlan] = useState(false);
  const [stationToRemove, setStationToRemove] = useState<Station | null>(null);
  const [confirmDeletePlan, setConfirmDeletePlan] = useState(false);
  
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [startLocation, setStartLocation] = useState('');
  const [startCoords, setStartCoords] = useState<[number, number] | null>(null);

  const currentPlan = dailyPlans.find(p => p.date === selectedDate);

  const handleGetCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setStartCoords([latitude, longitude]);
          setStartLocation(`Vị trí hiện tại (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`);
        },
        (error) => {
          console.error("Error getting location:", error);
          alert("Không thể lấy vị trí hiện tại. Vui lòng kiểm tra quyền truy cập vị trí.");
        }
      );
    } else {
      alert("Trình duyệt của bạn không hỗ trợ GPS.");
    }
  };

  useEffect(() => {
    if (currentPlan) {
      setSelectedStationIds(currentPlan.stationIds);
      setOptimizedRoute(currentPlan.stationIds);
    } else {
      setSelectedStationIds([]);
      setOptimizedRoute(null);
      setRouteGeometry(null);
      setRouteDistances(null);
    }
  }, [selectedDate, currentPlan]);

  useEffect(() => {
    const fetchRouteGeometry = async () => {
      const activeIds = optimizedRoute || selectedStationIds;
      if (activeIds.length < 2 && !startCoords) {
        setRouteGeometry(null);
        setRouteDistances(null);
        return;
      }
      const routeStations = activeIds.map(id => stations.find(s => s.id === id)).filter(Boolean) as Station[];
      let coordinates = routeStations.map(s => `${s.longitude},${s.latitude}`).join(';');
      
      if (startCoords) {
        coordinates = `${startCoords[1]},${startCoords[0]};` + coordinates;
      }

      if (coordinates.split(';').length < 2) {
        setRouteGeometry(null);
        setRouteDistances(null);
        return;
      }

      try {
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?geometries=geojson&overview=full`);
        const data = await res.json();
        if (data.routes && data.routes[0]) {
          const latLngs = data.routes[0].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
          setRouteGeometry(latLngs);
          if (data.routes[0].legs) {
             const distances = data.routes[0].legs.map((leg: any) => leg.distance);
             setRouteDistances(distances);
          } else {
             setRouteDistances(null);
          }
        }
      } catch (err) {
        console.error("Failed to fetch route geometry", err);
      }
    };
    fetchRouteGeometry();
  }, [optimizedRoute, selectedStationIds, stations, startCoords]);

  const executeRemoveStation = async () => {
    if (!stationToRemove) return;
    const id = stationToRemove.id;
    const newIds = selectedStationIds.filter(sid => sid !== id);
    setSelectedStationIds(newIds);
    
    let newOptimizedRoute = optimizedRoute;
    if (optimizedRoute) {
      newOptimizedRoute = optimizedRoute.filter(sid => sid !== id);
      setOptimizedRoute(newOptimizedRoute);
    }

    if (currentPlan) {
      try {
        const idsToSave = Array.from(new Set(newOptimizedRoute || newIds)).filter(Boolean);
        await updateDoc(doc(db, 'dailyPlans', currentPlan.id), { stationIds: idsToSave });
      } catch (err) {
        console.error("Error updating plan after removing station:", err);
        alert("Có lỗi xảy ra khi cập nhật lộ trình.");
      }
    }
    
    setStationToRemove(null);
  };

  const handleSavePlan = async () => {
    if (selectedStationIds.length === 0) {
      alert('Vui lòng chọn ít nhất 1 trạm để lưu kế hoạch.');
      return;
    }

    try {
      const idsToSave = Array.from(new Set(optimizedRoute || selectedStationIds)).filter(Boolean);
      if (currentPlan) {
        await updateDoc(doc(db, 'dailyPlans', currentPlan.id), { stationIds: idsToSave });
      } else {
        await addDoc(collection(db, 'dailyPlans'), {
          userId: user.uid,
          date: selectedDate,
          stationIds: idsToSave
        });
      }
      setConfirmSavePlan(false);
      alert('Đã lưu kế hoạch ngày!');
    } catch (err) {
      console.error(err);
      alert('Lỗi khi lưu kế hoạch.');
    }
  };

  const handleDeletePlan = async () => {
    if (!currentPlan) return;
    setConfirmDeletePlan(true);
  };

  const executeDeletePlan = async () => {
    if (!currentPlan) return;
    try {
      await deleteDoc(doc(db, 'dailyPlans', currentPlan.id));
      setSelectedStationIds([]);
      setOptimizedRoute(null);
      setRouteGeometry(null);
      setConfirmDeletePlan(false);
      alert('Đã xóa kế hoạch!');
    } catch (err) {
      console.error(err);
      alert('Lỗi khi xóa kế hoạch.');
    }
  };

  const handleOptimizeClick = () => {
    if (selectedStationIds.length < 2) return;
    setShowOptimizeModal(true);
  };

  const executeOptimizeRoute = async () => {
    if (selectedStationIds.length < 2) return;
    setShowOptimizeModal(false);
    setIsOptimizing(true);
    setOptimizeError(null);
    setOptimizeProgress('Khởi tạo AI...');
    
    try {
      const selectedStations = stations.filter(s => selectedStationIds.includes(s.id));
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const prompt = `Tôi có danh sách các trạm viễn thông sau:
      ${selectedStations.map(s => `- ID: ${s.id}, Tên: ${s.name}, Tọa độ: ${s.latitude}, ${s.longitude}`).join('\n')}
      
      Vị trí xuất phát của tôi là: ${startLocation || 'Không xác định, hãy tự chọn điểm bắt đầu phù hợp nhất từ danh sách trạm'}.
      
      Hãy sắp xếp thứ tự các trạm này để tạo thành một lộ trình tối ưu nhất (ngắn nhất) bắt đầu từ vị trí xuất phát. 
      Chỉ trả về danh sách các ID trạm theo đúng thứ tự, cách nhau bởi dấu phẩy. Không giải thích gì thêm.`;

      setOptimizeProgress('Đang phân tích tọa độ và tính toán khoảng cách...');
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { tools: [{ googleMaps: {} }] }
      });

      setOptimizeProgress('Đang hoàn thiện lộ trình...');
      const result = response.text?.trim().split(',').map(id => id.trim());
      if (result && result.length === selectedStationIds.length) {
        setOptimizedRoute(result);
        setSelectedStationIds(result);
      } else {
        throw new Error('AI trả về kết quả không hợp lệ.');
      }
    } catch (err) {
      console.error('Optimization error:', err);
      setOptimizeError('Không thể tối ưu lộ trình lúc này. Vui lòng thử lại sau.');
    } finally {
      setIsOptimizing(false);
      setOptimizeProgress('');
    }
  };

  const activeIds = Array.from(new Set(optimizedRoute || selectedStationIds));

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      transition={{ duration: 0.15 }}
      className="space-y-6 w-full relative"
    >
      {/* Optimization Loading Overlay */}
      {isOptimizing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl flex flex-col items-center text-center">
            <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Đang tối ưu lộ trình</h3>
            <p className="text-sm text-gray-600">{optimizeProgress}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Lộ trình hàng ngày</h2>
        <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-gray-200">
          <Calendar className="w-4 h-4 text-gray-400 ml-2" />
          <input 
            type="date" 
            className="bg-transparent border-none focus:ring-0 text-sm font-medium"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
      </div>

      {optimizeError && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3">
          <div className="bg-red-100 p-1 rounded-full shrink-0 mt-0.5">
            <X className="w-4 h-4 text-red-600" />
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-sm">Lỗi tối ưu</h4>
            <p className="text-sm mt-1">{optimizeError}</p>
          </div>
          <button onClick={() => setOptimizeError(null)} className="shrink-0 text-red-400 hover:text-red-600">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      <Card className="p-4 bg-blue-50 border-blue-100">
        <div className="flex items-start gap-3">
          <div className="bg-blue-600 p-2 rounded-lg mt-1">
            <Navigation className="text-white w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-blue-900">Danh sách các trạm cần làm ngày {format(parseISO(selectedDate), 'dd/MM/yyyy')}</h3>
          </div>
        </div>
      </Card>

      <div className="h-64 w-full rounded-xl overflow-hidden border border-gray-200 z-0 relative">
        <MapContainer 
          center={[14.0583, 108.2772]} 
          zoom={5} 
          style={{ height: '100%', width: '100%' }}
          touchZoom={true}
          dragging={true}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {(activeIds.length > 0 || startCoords) && (
            <MapUpdater positions={[
              ...(startCoords ? [startCoords] : []),
              ...activeIds.map(id => {
                const s = stations.find(st => st.id === id);
                return s ? [s.latitude, s.longitude] as [number, number] : null;
              }).filter(Boolean) as [number, number][]
            ]} />
          )}
          {startCoords && (
            <Marker position={startCoords}>
              <LeafletTooltip direction="top" offset={[0, -30]} opacity={0.9} permanent={true} className="text-xs font-medium border-none shadow-sm rounded px-1.5 py-0.5 bg-green-600 text-white">
                Vị trí xuất phát
              </LeafletTooltip>
            </Marker>
          )}
          {activeIds.map((sid, index) => {
            const station = stations.find(s => s.id === sid);
            if (!station) return null;
            
            return (
              <Marker 
                key={station.id} 
                position={[station.latitude, station.longitude]} 
                icon={getStationIcon(station, true)}
              >
                <LeafletTooltip 
                  direction="top" 
                  offset={[0, -30]} 
                  opacity={0.9} 
                  permanent={true}
                  className="text-xs font-medium border-none shadow-sm rounded px-1.5 py-0.5 bg-blue-600 text-white"
                >
                  {index + 1}. {formatStationName(station.name)}
                </LeafletTooltip>
                <Popup>
                  <div className="space-y-2 min-w-[200px]">
                    <div className="flex items-center gap-2">
                      {station.icon && <img src={station.icon} alt="" className="w-6 h-6 rounded-md object-cover" />}
                      <div>
                        <h4 className="font-bold text-base text-gray-900 m-0">{station.name}</h4>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 m-0">{station.address}</p>
                    <div className="text-sm pt-2 border-t border-gray-100">
                      <div className="flex items-center gap-1.5 mb-1">
                        <UserIcon className="w-3.5 h-3.5 text-gray-400" />
                        <span className="font-medium">{station.managerName || 'Chưa cập nhật'}</span>
                      </div>
                      <a href={`tel:${station.managerPhone}`} className="flex items-center gap-1.5 text-blue-600 hover:underline">
                        <Phone className="w-3.5 h-3.5" />
                        {station.managerPhone || 'Chưa cập nhật'}
                      </a>
                    </div>
                    <a 
                      href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full bg-blue-600 text-white py-2 rounded-md mt-3 no-underline hover:bg-blue-700 transition-colors"
                    >
                      <Navigation className="w-4 h-4" />
                      Chỉ đường
                    </a>
                    <button
                      onClick={() => setStationToRemove(station)}
                      className="flex items-center justify-center gap-2 w-full bg-red-50 text-red-600 py-2 rounded-md mt-2 hover:bg-red-100 transition-colors border-none cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                      Xóa khỏi lộ trình
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}
          {routeGeometry && routeGeometry.length > 1 && (
            <Polyline positions={routeGeometry} color="#2563eb" weight={4} opacity={0.8} />
          )}
        </MapContainer>
      </div>

      {activeIds.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-gray-700">Lộ trình đề xuất ({activeIds.length} trạm)</h4>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleOptimizeClick}
              disabled={isOptimizing || activeIds.length < 2}
            >
              {isOptimizing ? 'Đang tính toán...' : 'Tối ưu lộ trình (AI)'}
            </Button>
          </div>

          <div className="space-y-2">
            {startCoords && routeDistances && routeDistances.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center font-bold text-sm">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="w-0.5 min-h-12 bg-blue-200 my-1 relative">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border border-blue-200 text-blue-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap z-10 shadow-sm">
                      {(routeDistances[0] / 1000).toFixed(1)} km
                    </div>
                  </div>
                </div>
                <Card className="flex-1 p-3 flex items-center bg-gray-50 border-gray-200">
                  <div className="font-medium text-gray-700">Vị trí xuất phát</div>
                </Card>
              </div>
            )}
            {activeIds.map((sid, index) => {
              const station = stations.find(s => s.id === sid);
              if (!station) return null;
              
              const isSaved = currentPlan?.stationIds.includes(sid);
              const existingReport = reports.find(r => r.stationId === sid && r.date === selectedDate);
              const isCompleted = !!existingReport;

              let nextDistance = null;
              if (routeDistances) {
                 if (startCoords && index < activeIds.length - 1) {
                    nextDistance = routeDistances[index + 1];
                 } else if (!startCoords && index < activeIds.length - 1) {
                    nextDistance = routeDistances[index];
                 }
              }

              return (
                <div key={sid} className="flex items-stretch gap-3">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="w-8 h-8 shrink-0 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                      {index + 1}
                    </div>
                    {index < activeIds.length - 1 && (
                      <div className="w-0.5 flex-1 bg-blue-200 my-1 relative min-h-[3rem]">
                        {nextDistance !== null && (
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border border-blue-200 text-blue-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap z-10 shadow-sm">
                            {(nextDistance / 1000).toFixed(1)} km
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <Card className="flex-1 p-3 flex items-start justify-between mb-2">
                    <div className="pr-2">
                      <div className="font-bold text-gray-900 leading-tight">{station.name}</div>
                      <div className="text-xs text-gray-500 mt-1.5">{station.managerName || 'Chưa có QL'}</div>
                      <div className="text-xs text-gray-500">{station.managerPhone || 'Chưa có SĐT'}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 shrink-0">
                      <a 
                        href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg flex items-center justify-center transition-colors"
                        title="Chỉ đường"
                      >
                        <Navigation className="w-4 h-4" />
                      </a>
                      
                      {station.managerPhone ? (
                        <a href={`tel:${station.managerPhone}`} className="p-2 text-green-600 bg-green-50 hover:bg-green-100 rounded-lg flex items-center justify-center transition-colors" title="Gọi điện">
                          <Phone className="w-4 h-4" />
                        </a>
                      ) : (
                        <div className="p-2"></div>
                      )}
                      
                      {isSaved ? (
                        <button 
                          onClick={() => onOpenCreateReport(station.id)}
                          className={cn("p-2 rounded-lg transition-colors flex items-center justify-center", isCompleted ? "text-blue-600 bg-blue-50 hover:bg-blue-100" : "text-amber-600 bg-amber-50 hover:bg-amber-100")}
                          title="Cập nhật công việc"
                        >
                          <ClipboardCheck className="w-4 h-4" />
                        </button>
                      ) : (
                        <div className="p-2"></div>
                      )}

                      <button 
                        onClick={() => setStationToRemove(station)}
                        className="p-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg flex items-center justify-center transition-colors"
                        title="Xóa khỏi lộ trình"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 mt-4">
            <Button onClick={() => setConfirmSavePlan(true)} className="flex-1 py-4">
              Lưu kế hoạch ngày
            </Button>
            {currentPlan && (
              <Button onClick={() => setConfirmDeletePlan(true)} variant="secondary" className="py-4 bg-red-50 text-red-600 hover:bg-red-100 border-red-200">
                Xóa kế hoạch
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modals */}
      <AnimatePresence>
        {confirmSavePlan && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-2">Xác nhận lưu kế hoạch</h3>
              <p className="text-gray-600 mb-6">
                Bạn có chắc chắn muốn lưu kế hoạch lộ trình cho ngày <strong>{format(parseISO(selectedDate), 'dd/MM/yyyy')}</strong> không?
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setConfirmSavePlan(false)}>
                  Hủy
                </Button>
                <Button className="flex-1" onClick={handleSavePlan}>
                  Đồng ý
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {confirmDeletePlan && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-2">Xóa kế hoạch</h3>
              <p className="text-gray-600 mb-6">
                Bạn có chắc chắn muốn xóa kế hoạch của ngày <strong>{format(parseISO(selectedDate), 'dd/MM/yyyy')}</strong> không?
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setConfirmDeletePlan(false)}>
                  Hủy
                </Button>
                <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={executeDeletePlan}>
                  Đồng ý xóa
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {stationToRemove && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-2">Xóa khỏi lộ trình</h3>
              <p className="text-gray-600 mb-6">
                Bạn có chắc chắn muốn xóa trạm <strong>{stationToRemove.name}</strong> khỏi lộ trình không?
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setStationToRemove(null)}>
                  Hủy
                </Button>
                <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={executeRemoveStation}>
                  Đồng ý xóa
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showOptimizeModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-2">Tối ưu lộ trình</h3>
              <p className="text-gray-600 mb-4 text-sm">
                Nhập vị trí xuất phát của bạn (địa chỉ hoặc tọa độ) để AI có thể tính toán lộ trình ngắn nhất.
              </p>
              <div className="mb-6 space-y-3">
                <input
                  type="text"
                  placeholder="Ví dụ: 123 Nguyễn Văn Linh, Đà Nẵng"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={startLocation}
                  onChange={(e) => setStartLocation(e.target.value)}
                />
                <div className="flex items-center justify-center">
                  <span className="text-gray-400 text-sm">Hoặc</span>
                </div>
                <Button 
                  variant="outline" 
                  className="w-full flex items-center justify-center gap-2"
                  onClick={handleGetCurrentLocation}
                >
                  <Navigation className="w-4 h-4" />
                  Sử dụng vị trí hiện tại (GPS)
                </Button>
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setShowOptimizeModal(false)}>
                  Hủy
                </Button>
                <Button className="flex-1" onClick={executeOptimizeRoute}>
                  Bắt đầu tối ưu
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function AdminTab({ equipmentDict, taskGroups }: { equipmentDict: EquipmentDict[], taskGroups: TaskGroup[] }) {
  // Equipment States
  const [newEqName, setNewEqName] = useState('');
  const [newEqSpaces, setNewEqSpaces] = useState<string[]>([]);
  const [newEqUnit, setNewEqUnit] = useState('cái');
  const [isAddingEq, setIsAddingEq] = useState(false);
  const [editingEq, setEditingEq] = useState<EquipmentDict | null>(null);

  // Task Group States
  const [newTaskGroup, setNewTaskGroup] = useState('');
  const [isAddingTaskGroup, setIsAddingTaskGroup] = useState(false);
  const [editingTaskGroup, setEditingTaskGroup] = useState<TaskGroup | null>(null);

  // General tab state
  const [activeConfigTab, setActiveConfigTab] = useState<'eq' | 'tg'>('eq');

  const [confirmDialog, setConfirmDialog] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({
    isOpen: false, title: '', message: '', onConfirm: () => {}
  });

  const SPACES = ['Indoor', 'Outdoor'];

  // --- Equipment Handlers ---
  const toggleSpace = (space: string, isEditing: boolean) => {
    if (isEditing && editingEq) {
      setEditingEq({
        ...editingEq,
        validSpaces: editingEq.validSpaces.includes(space) 
          ? editingEq.validSpaces.filter(s => s !== space) 
          : [...editingEq.validSpaces, space]
      });
    } else {
      setNewEqSpaces(prev => prev.includes(space) ? prev.filter(s => s !== space) : [...prev, space]);
    }
  };

  const handleAddEquipment = async () => {
    if (!newEqName || newEqSpaces.length === 0) {
      setConfirmDialog({
        isOpen: true, title: "Lỗi nhập liệu", message: "Vui lòng nhập tên thiết bị và chọn ít nhất 1 không gian!",
        onConfirm: () => setConfirmDialog(prev => ({...prev, isOpen: false}))
      });
      return;
    }
    try {
      await addDoc(collection(db, 'equipment_dictionary'), { name: newEqName, validSpaces: newEqSpaces, unit: newEqUnit || 'cái' });
      setNewEqName('');
      setNewEqSpaces([]);
      setNewEqUnit('cái');
      setIsAddingEq(false);
    } catch (e) { console.error("Lỗi:", e); }
  };

  const handleUpdateEquipment = async () => {
    if (!editingEq || !editingEq.name || editingEq.validSpaces.length === 0) {
      setConfirmDialog({
        isOpen: true, title: "Lỗi nhập liệu", message: "Vui lòng nhập đầy đủ thông tin!",
        onConfirm: () => setConfirmDialog(prev => ({...prev, isOpen: false}))
      });
      return;
    }
    try {
      await updateDoc(doc(db, 'equipment_dictionary', editingEq.id), {
        name: editingEq.name,
        validSpaces: editingEq.validSpaces,
        unit: editingEq.unit || 'cái'
      });
      setEditingEq(null);
    } catch (e) { console.error("Lỗi cập nhật:", e); }
  };

  const handleDeleteEquipment = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Xác nhận xóa",
      message: "Bạn có chắc chắn muốn xóa thiết bị này khỏi danh mục?",
      onConfirm: async () => {
        try { await deleteDoc(doc(db, 'equipment_dictionary', id)); } catch (e) { console.error("Lỗi:", e); }
        setConfirmDialog(prev => ({...prev, isOpen: false}));
      }
    });
  };

  // --- Task Group Handlers ---
  const handleAddTaskGroup = async () => {
    if (!newTaskGroup) { 
      setConfirmDialog({ isOpen: true, title: "Lỗi", message: "Vui lòng nhập tên loại công việc", onConfirm: () => setConfirmDialog(p => ({...p, isOpen: false})) });
      return; 
    }
    try {
      await addDoc(collection(db, 'task_groups'), { name: newTaskGroup });
      setNewTaskGroup('');
      setIsAddingTaskGroup(false);
    } catch (e) { console.error("Lỗi:", e); }
  };

  const handleUpdateTaskGroup = async () => {
    if (!editingTaskGroup || !editingTaskGroup.name) return;
    try {
      await updateDoc(doc(db, 'task_groups', editingTaskGroup.id), { name: editingTaskGroup.name });
      setEditingTaskGroup(null);
    } catch (e) { console.error("Lỗi:", e); }
  };

  const handleDeleteTaskGroup = (id: string) => {
    setConfirmDialog({
      isOpen: true, title: "Xác nhận xóa", message: "Xóa loại công việc này?",
      onConfirm: async () => {
        try { await deleteDoc(doc(db, 'task_groups', id)); } catch (e) { console.error("Lỗi:", e); }
        setConfirmDialog(p => ({...p, isOpen: false}));
      }
    });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="space-y-6 w-full">
      {/* Confirm Modal */}
      <AnimatePresence>
        {confirmDialog.isOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl">
              <h3 className="text-xl font-bold text-gray-900 mb-2">{confirmDialog.title}</h3>
              <p className="text-gray-600 mb-6">{confirmDialog.message}</p>
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setConfirmDialog(p => ({...p, isOpen: false}))}>Hủy</Button>
                <Button className="flex-1" onClick={confirmDialog.onConfirm}>Xác nhận</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Quản trị Hệ thống</h2>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-4">
            <Database className="w-5 h-5 text-blue-600" />
            Cấu hình Dữ liệu nguồn (Master Data)
          </h3>
          
          <div className="flex space-x-2 border-b border-gray-200 overflow-x-auto pb-px">
            <button onClick={() => setActiveConfigTab('eq')} className={cn("px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors", activeConfigTab === 'eq' ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700")}>
              Thiết bị & Vật tư
            </button>
            <button onClick={() => setActiveConfigTab('tg')} className={cn("px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors", activeConfigTab === 'tg' ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700")}>
              Loại công việc
            </button>
          </div>
        </div>
        
        <div className="p-4 bg-white min-h-[300px]">
          {/* TAB: EQUIPMENT */}
          {activeConfigTab === 'eq' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                <div className="text-sm text-gray-600">Quản lý danh mục thiết bị và không gian cài đặt tương ứng.</div>
                <Button size="sm" onClick={() => setIsAddingEq(!isAddingEq)}>
                  {isAddingEq ? 'Hủy' : '+ Thêm mới'}
                </Button>
              </div>

              <AnimatePresence>
                {isAddingEq && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="p-4 border rounded-lg bg-gray-50 space-y-4 overflow-hidden">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tên thiết bị</label>
                        <Input value={newEqName} onChange={(e: any) => setNewEqName(e.target.value)} placeholder="VD: Acquy tia chớp" />
                      </div>
                      <div className="w-full sm:w-32">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị (ĐVT)</label>
                        <select className="w-full border p-1.5 rounded-md text-sm border-gray-200 h-10" value={newEqUnit} onChange={e => setNewEqUnit(e.target.value)}>
                          <option value="cái">Cái</option>
                          <option value="bộ">Bộ</option>
                          <option value="m">Mét (m)</option>
                          <option value="cuộn">Cuộn</option>
                          <option value="sợi">Sợi</option>
                          <option value="chiếc">Chiếc</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Không gian áp dụng</label>
                      <div className="flex gap-4">
                        {SPACES.map(sp => (
                          <label key={sp} className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={newEqSpaces.includes(sp)} onChange={() => toggleSpace(sp, false)} className="w-4 h-4 text-blue-600 rounded" />
                            <span className="text-sm text-gray-700">{sp}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <Button onClick={handleAddEquipment} className="w-full">Lưu thiết bị mới</Button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {equipmentDict.map(eq => (
                  <div key={eq.id} className="border border-gray-200 p-3 rounded-lg hover:shadow-sm transition-all bg-white relative group">
                    {editingEq?.id === eq.id ? (
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <Input value={editingEq.name} onChange={(e: any) => setEditingEq({...editingEq, name: e.target.value})} className="flex-1 h-8 text-sm font-medium" />
                          <Input value={editingEq.unit || ''} onChange={(e: any) => setEditingEq({...editingEq, unit: e.target.value})} placeholder="ĐVT" className="w-20 h-8 text-sm" />
                        </div>
                        <div className="flex gap-3">
                          {SPACES.map(sp => (
                            <label key={sp} className="flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" checked={editingEq.validSpaces.includes(sp)} onChange={() => toggleSpace(sp, true)} className="w-3.5 h-3.5" />
                              <span className="text-xs text-gray-600">{sp}</span>
                            </label>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={handleUpdateEquipment} className="w-full h-8 text-xs">Lưu</Button>
                          <Button size="sm" variant="secondary" onClick={() => setEditingEq(null)} className="w-full h-8 text-xs">Hủy</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="pr-14">
                          <div className="font-medium text-gray-900 text-sm">
                            {eq.name}
                            {eq.unit && <span className="ml-2 text-xs font-normal text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border">đvt: {eq.unit}</span>}
                          </div>
                          <div className="flex gap-1 mt-1.5">
                            {eq.validSpaces.map(sp => (
                              <span key={sp} className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", sp === 'Indoor' ? 'bg-indigo-50 text-indigo-600' : 'bg-orange-50 text-orange-600')}>
                                {sp}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="absolute top-2 right-2 flex opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditingEq(eq)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded">
                            <Settings2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDeleteEquipment(eq.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: TASK GROUPS */}
          {activeConfigTab === 'tg' && (
            <div className="space-y-4">
               <div className="flex justify-between items-center bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                <div className="text-sm text-gray-600">Danh sách các nhóm công việc chính cho kỹ thuật viên.</div>
                <Button size="sm" onClick={() => setIsAddingTaskGroup(!isAddingTaskGroup)}>
                  {isAddingTaskGroup ? 'Hủy' : '+ Thêm mới'}
                </Button>
              </div>

              <AnimatePresence>
                {isAddingTaskGroup && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="p-4 border rounded-lg bg-gray-50 flex gap-2 overflow-hidden">
                    <Input value={newTaskGroup} onChange={(e: any) => setNewTaskGroup(e.target.value)} placeholder="Tên loại công việc..." className="flex-1" />
                    <Button onClick={handleAddTaskGroup}>Lưu</Button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {taskGroups.map(tg => (
                  <div key={tg.id} className="border p-2 rounded-lg group flex justify-between items-center hover:border-gray-300">
                    {editingTaskGroup?.id === tg.id ? (
                      <div className="flex gap-1 w-full">
                        <Input value={editingTaskGroup.name} onChange={(e: any) => setEditingTaskGroup({...editingTaskGroup, name: e.target.value})} className="h-8 text-sm flex-1" />
                        <button onClick={handleUpdateTaskGroup} className="bg-blue-600 text-white px-2 rounded font-medium text-xs">Lưu</button>
                        <button onClick={() => setEditingTaskGroup(null)} className="bg-gray-200 text-gray-700 px-2 rounded font-medium text-xs">Hủy</button>
                      </div>
                    ) : (
                      <>
                        <span className="font-medium text-sm text-gray-800 ml-1">{tg.name}</span>
                        <div className="flex opacity-0 group-hover:opacity-100">
                           <button onClick={() => setEditingTaskGroup(tg)} className="p-1.5 text-gray-400 hover:text-blue-600">
                             <Settings2 className="w-3.5 h-3.5" />
                           </button>
                           <button onClick={() => handleDeleteTaskGroup(tg.id)} className="p-1.5 text-gray-400 hover:text-red-600">
                             <Trash2 className="w-3.5 h-3.5" />
                           </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

function SettingsTab({ user, logout }: { user: User, logout: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="space-y-6 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Cài đặt cá nhân</h2>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden shrink-0">
            {user.photoURL ? (
              <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <UserIcon className="w-8 h-8 text-gray-400" />
            )}
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">{user.displayName || 'Người dùng'}</h3>
            <p className="text-gray-500">{user.email}</p>
          </div>
        </div>
      </Card>

      <Button onClick={logout} variant="danger" className="w-full py-4 text-lg mt-8">
        <LogOut className="w-5 h-5" /> Đăng xuất
      </Button>
    </motion.div>
  );
}

function DashboardTab({ stations, reports, dailyPlans, user, validationWarnings, setValidationWarnings }: { stations: Station[], reports: Report[], dailyPlans: DailyPlan[], user: User, validationWarnings: ValidationWarning[] | null, setValidationWarnings: (warnings: ValidationWarning[] | null) => void }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterManager, setFilterManager] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'checked' | 'unchecked'>('all');
  const [showNotifications, setShowNotifications] = useState(false);

  const handleMarkAsRead = (id: string) => {
    if (!validationWarnings) return;
    setValidationWarnings(validationWarnings.map(w => w.id === id ? { ...w, isRead: true } : w));
  };

  const handleDeleteWarning = (id: string) => {
    if (!validationWarnings) return;
    const newWarnings = validationWarnings.filter(w => w.id !== id);
    setValidationWarnings(newWarnings.length > 0 ? newWarnings : null);
  };

  const handleMarkAllAsRead = () => {
    if (!validationWarnings) return;
    setValidationWarnings(validationWarnings.map(w => ({ ...w, isRead: true })));
  };

  const unreadCount = validationWarnings ? validationWarnings.filter(w => !w.isRead).length : 0;

  const uniqueDepartments = useMemo(() => {
    const depts = stations.map(s => s.infrastructureDepartment).filter(Boolean) as string[];
    return Array.from(new Set(depts)).sort();
  }, [stations]);

  const uniqueManagers = useMemo(() => {
    const managers = stations.map(s => s.managerName).filter(Boolean) as string[];
    return Array.from(new Set(managers)).sort();
  }, [stations]);

  const baseFilteredStations = useMemo(() => {
    return stations.filter(station => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        (station.name?.toLowerCase().includes(searchLower) || false) ||
        (station.infrastructureCode?.toLowerCase().includes(searchLower) || false);
      const matchesDepartment = !filterDepartment || station.infrastructureDepartment === filterDepartment;
      const matchesManager = !filterManager || station.managerName === filterManager;
      return matchesSearch && matchesDepartment && matchesManager;
    });
  }, [stations, searchTerm, filterDepartment, filterManager]);

  const stats = {
    total: baseFilteredStations.length,
    checked: baseFilteredStations.filter(s => s.status === 'checked').length,
    unchecked: baseFilteredStations.filter(s => s.status !== 'checked').length
  };

  const filteredStations = useMemo(() => {
    return baseFilteredStations.filter(station => {
      if (filterStatus === 'all') return true;
      if (filterStatus === 'checked') return station.status === 'checked';
      return station.status !== 'checked';
    });
  }, [baseFilteredStations, filterStatus]);

  const chartData = [
    { name: 'Đã kiểm tra', value: stats.checked, color: '#10B981' },
    { name: 'Chưa kiểm tra', value: stats.unchecked, color: '#EF4444' }
  ];

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) { // 1MB limit for base64
      alert("Kích thước ảnh quá lớn. Vui lòng chọn ảnh dưới 1MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64String = reader.result as string;
        await updateProfile(user, { photoURL: base64String });
        alert("Cập nhật ảnh đại diện thành công!");
        window.location.reload(); // Reload to reflect changes
      } catch (error) {
        console.error("Error updating avatar:", error);
        alert("Có lỗi xảy ra khi cập nhật ảnh đại diện.");
      }
    };
    reader.readAsDataURL(file);
  };

  const todayDateStr = format(new Date(), 'yyyy-MM-dd');
  const todayPlan = dailyPlans.find(p => p.date === todayDateStr);
  const todayStationIds = todayPlan ? todayPlan.stationIds : [];

  const handleAddToRoute = async (station: Station) => {
    if (todayStationIds.includes(station.id)) return;
    const newStationIds = Array.from(new Set([...todayStationIds, station.id])).filter(Boolean);
    try {
      if (todayPlan) {
        await updateDoc(doc(db, 'dailyPlans', todayPlan.id), { stationIds: newStationIds });
      } else {
        await addDoc(collection(db, 'dailyPlans'), {
          userId: user.uid,
          date: todayDateStr,
          stationIds: newStationIds
        });
      }
      alert(`Đã thêm ${station.name} vào lộ trình hôm nay.`);
    } catch (err) {
      console.error("Error adding station to plan:", err);
      alert("Có lỗi xảy ra khi thêm trạm vào lộ trình.");
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      transition={{ duration: 0.15 }}
      className="pb-24 bg-gray-50 w-full"
    >
      {/* Header Section */}
      <div className="relative bg-gradient-to-b from-blue-600 to-blue-800 rounded-b-[2.5rem] pt-12 pb-24 px-4 text-white shadow-lg">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white to-transparent rounded-b-[2.5rem]"></div>
        
        <div className="relative z-10 flex justify-between items-start">
          <label className="w-14 h-14 bg-white rounded-full flex items-center justify-center p-1 shadow-md cursor-pointer relative group">
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            <div className="w-full h-full bg-blue-100 rounded-full flex items-center justify-center text-blue-600 overflow-hidden">
              {user.photoURL ? (
                <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <UserIcon className="w-6 h-6" />
              )}
            </div>
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Upload className="w-4 h-4 text-white" />
            </div>
          </label>
          <div className="flex flex-col items-center">
            <div className="bg-white text-blue-800 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 mb-1 shadow-sm">
              Xin chào <Award className="w-4 h-4 text-yellow-500" />
            </div>
            <h2 className="text-xl font-bold">{user.displayName || 'Người dùng'}</h2>
          </div>
          <button className="relative p-2" onClick={() => setShowNotifications(true)}>
            <Bell className="w-7 h-7" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-blue-600">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Notifications Modal */}
      <AnimatePresence>
        {showNotifications && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] flex flex-col"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Bell className="w-6 h-6" />
                  Thông báo
                </h3>
                <button onClick={() => setShowNotifications(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 pr-2 space-y-4">
                {(!validationWarnings || validationWarnings.length === 0) ? (
                  <div className="text-center py-8 text-gray-500">
                    <Bell className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>Không có thông báo</p>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-gray-600 text-sm">
                        AI đã phát hiện {validationWarnings.length} trạm có tọa độ đáng ngờ ({unreadCount} chưa đọc):
                      </p>
                      {unreadCount > 0 && (
                        <button onClick={handleMarkAllAsRead} className="text-sm text-blue-600 hover:underline">
                          Đánh dấu tất cả đã đọc
                        </button>
                      )}
                    </div>
                    {validationWarnings.map((warning) => (
                      <div key={warning.id} className={cn("border rounded-xl p-4 relative transition-colors", warning.isRead ? "bg-gray-50 border-gray-200" : "bg-red-50 border-red-100")}>
                        <div className="flex justify-between items-start mb-1">
                          <h4 className={cn("font-bold", warning.isRead ? "text-gray-700" : "text-red-900")}>{warning.name}</h4>
                          <div className="flex gap-3">
                            {!warning.isRead && (
                              <button onClick={() => handleMarkAsRead(warning.id)} className="text-xs text-blue-600 hover:underline font-medium">
                                Đã đọc
                              </button>
                            )}
                            <button onClick={() => handleDeleteWarning(warning.id)} className="text-xs text-red-500 hover:underline font-medium">
                              Xóa
                            </button>
                          </div>
                        </div>
                        <div className={cn("text-sm space-y-1", warning.isRead ? "text-gray-500" : "text-red-800")}>
                          <p><span className="font-medium">Địa chỉ:</span> {warning.address}</p>
                          <p><span className="font-medium">Tọa độ:</span> {warning.latitude}, {warning.longitude}</p>
                          <p><span className="font-medium">Vấn đề:</span> {warning.issue}</p>
                          <p><span className="font-medium">Khuyến cáo:</span> {warning.recommendation}</p>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-end mt-4">
                      <Button variant="outline" onClick={() => setValidationWarnings(null)}>
                        Xóa tất cả thông báo
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stats Section */}
      <div className="px-4 -mt-10 relative z-20">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div 
            onClick={() => setFilterStatus('all')}
            className={cn("rounded-2xl p-2 sm:p-4 shadow-sm border flex flex-col items-center justify-center cursor-pointer transition-all", filterStatus === 'all' ? "bg-blue-50 border-blue-200 ring-2 ring-blue-500" : "bg-white border-gray-100 hover:bg-gray-50")}
          >
            <div className="text-2xl sm:text-3xl font-bold text-blue-600 mb-1">{stats.total}</div>
            <div className="text-[10px] sm:text-xs text-gray-500 font-medium text-center">Tổng số trạm</div>
          </div>
          <div 
            onClick={() => setFilterStatus('checked')}
            className={cn("rounded-2xl p-2 sm:p-4 shadow-sm border flex flex-col items-center justify-center cursor-pointer transition-all", filterStatus === 'checked' ? "bg-green-50 border-green-200 ring-2 ring-green-500" : "bg-white border-gray-100 hover:bg-gray-50")}
          >
            <div className="text-2xl sm:text-3xl font-bold text-green-500 mb-1">{stats.checked}</div>
            <div className="text-[10px] sm:text-xs text-gray-500 font-medium text-center">Đã kiểm tra</div>
          </div>
          <div 
            onClick={() => setFilterStatus('unchecked')}
            className={cn("rounded-2xl p-2 sm:p-4 shadow-sm border flex flex-col items-center justify-center cursor-pointer transition-all", filterStatus === 'unchecked' ? "bg-red-50 border-red-200 ring-2 ring-red-500" : "bg-white border-gray-100 hover:bg-gray-50")}
          >
            <div className="text-2xl sm:text-3xl font-bold text-red-500 mb-1">{stats.unchecked}</div>
            <div className="text-[10px] sm:text-xs text-gray-500 font-medium text-center">Chưa kiểm tra</div>
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <div className="px-4 mt-6">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-900 mb-4">Tỷ lệ kiểm tra trạm</h3>
          <div className="h-48 w-full">
            {stats.total > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    formatter={(value: number) => [`${value} trạm`, 'Số lượng']}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                Chưa có dữ liệu
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Map Section */}
      <div className="px-4 mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-900">Bản đồ tổng thể</h3>
          <span className="text-xs font-medium text-gray-500 bg-gray-200 px-2 py-1 rounded-full">{filteredStations.length} trạm</span>
        </div>
        
        {/* Filters */}
        <div className="mb-4 space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Tìm theo mã trạm, tên trạm..." 
              className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <select 
              className="w-full sm:flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
            >
              <option value="">Tất cả phòng hạ tầng</option>
              {uniqueDepartments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
            <select 
              className="w-full sm:flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterManager}
              onChange={(e) => setFilterManager(e.target.value)}
            >
              <option value="">Tất cả người quản lý</option>
              {uniqueManagers.map(manager => (
                <option key={manager} value={manager}>{manager}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden shadow-sm h-96 relative z-0 border border-gray-200">
          <MapContainer 
            center={[10.762622, 106.660172]} 
            zoom={12} 
            className="w-full h-full"
            zoomControl={true}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {filteredStations.length > 0 && <MapUpdater positions={filteredStations.map(s => [s.latitude, s.longitude]) as [number, number][]} />}
            {filteredStations.map(station => {
              const isPlanned = todayStationIds.includes(station.id);
              return (
              <Marker 
                key={station.id}
                position={[station.latitude, station.longitude]} 
                icon={getStationIcon(station, isPlanned)}
              >
                <Popup className="custom-popup">
                  <div className="p-2 min-w-[200px]">
                    <h4 className="font-bold text-sm mb-1">{station.name}</h4>
                    {station.infrastructureCode && <p className="text-xs text-gray-600 mb-1">Mã: {station.infrastructureCode}</p>}
                    <p className="text-xs text-gray-600 mb-2">{station.address}</p>
                    <div className="flex items-center justify-between mb-3">
                      <div className={cn(
                        "text-xs font-medium px-2 py-1 rounded-full inline-block",
                        station.status === 'checked' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      )}>
                        {station.status === 'checked' ? 'Đã kiểm tra' : 'Chưa kiểm tra'}
                      </div>
                    </div>
                    {!isPlanned ? (
                      <Button 
                        size="sm" 
                        className="w-full flex items-center justify-center gap-1"
                        onClick={() => handleAddToRoute(station)}
                      >
                        <PlusCircle className="w-4 h-4" /> Thêm vào lộ trình
                      </Button>
                    ) : (
                      <div className="text-xs text-center text-green-600 font-medium bg-green-50 py-1.5 rounded-md border border-green-100">
                        Đã có trong lộ trình hôm nay
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            )})}
          </MapContainer>
        </div>
      </div>
    </motion.div>
  );
}


