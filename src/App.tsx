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
  BookOpen,
  Wallet
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

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('planner');
  const [stations, setStations] = useState<Station[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [dailyPlans, setDailyPlans] = useState<DailyPlan[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<ValidationWarning[] | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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

    return () => {
      stationsUnsubscribe();
      reportsUnsubscribe();
      plansUnsubscribe();
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
        {activeTab === 'stations' && <StationsTab key="stations" stations={stations} validationWarnings={validationWarnings} setValidationWarnings={setValidationWarnings} />}
        {activeTab === 'planner' && <PlannerTab key="planner" stations={stations} dailyPlans={dailyPlans} user={user} reports={reports} />}
        {activeTab === 'reports' && <ReportsTab key="reports" reports={reports} stations={stations} user={user} />}
        {activeTab === 'settings' && <SettingsTab key="settings" user={user} logout={logout} />}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.05)] rounded-t-3xl z-40">
        <div className="max-w-4xl mx-auto flex justify-between items-center px-6 py-2 relative">
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
          <div className="relative -top-8 flex justify-center w-16">
            <div className="absolute w-20 h-20 bg-white rounded-full -top-2 flex items-center justify-center shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.05)]">
              <button 
                onClick={() => setActiveTab('reports')}
                className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg transition-colors",
                  activeTab === 'reports' ? "bg-blue-600 hover:bg-blue-700" : "bg-[#b90000] hover:bg-red-800"
                )}
                aria-label="Mở báo cáo"
              >
                <FileText className="w-7 h-7" />
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
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')} 
            icon={<Settings />} 
            label="Cài đặt" 
          />
        </div>
      </nav>
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

async function generateWithRetry(
  ai: GoogleGenAI,
  prompt: string,
  model = "gemini-2.5-flash",
  retries = 3
) {
  let lastError: unknown;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });
      return response;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);

      const isTemporary =
        msg.includes('"code":503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('high demand');

      if (!isTemporary || i == retries - 1) {
        throw err;
      }

      await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
    }
  }

  throw lastError;
}

function StationsTab({ stations, validationWarnings, setValidationWarnings }: { stations: Station[], validationWarnings: ValidationWarning[] | null, setValidationWarnings: (warnings: ValidationWarning[] | null) => void }) {
  const [isAdding, setIsAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [newStation, setNewStation] = useState<Partial<Station>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [expandedStationId, setExpandedStationId] = useState<string | null>(null);
  const [showWarningsModal, setShowWarningsModal] = useState(false);

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
        
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        data = XLSX.utils.sheet_to_json(worksheet);
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

        if (
          name &&
          String(name).trim() !== '' &&
          lat !== undefined &&
          lng !== undefined &&
          !isNaN(parsedLat) &&
          !isNaN(parsedLng)
        ) {
          validStations.push({
            infrastructureCode: String(infrastructureCode || ''),
            name: String(name).trim(),
            infrastructureDepartment: String(infrastructureDepartment || ''),
            latitude: parsedLat,
            longitude: parsedLng,
            address: String(address || ''),
            managerName: String(managerName || ''),
            managerPhone: String(managerPhone || ''),
            status,
          });
        }
      }

      if (validStations.length === 0) {
        alert('Lỗi: Không tìm thấy dữ liệu hợp lệ. Vui lòng đảm bảo bạn đã chọn đúng cột Tên trạm, Vĩ độ và Kinh độ (Vĩ độ/Kinh độ phải là số).');
        return;
      }

      setIsValidating(true);
      let warnings: ValidationWarning[] = [];

      try {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

        if (apiKey) {
          const ai = new GoogleGenAI({ apiKey });

          const prompt = `Tôi có danh sách các trạm viễn thông sau (Tên, Địa chỉ, Vĩ độ, Kinh độ):
${validStations.map(s => `- ${s.name} | ${s.address} | ${s.latitude}, ${s.longitude}`).join('\n')}

Hãy chỉ kiểm tra các trạm có tọa độ lệch rất nhiều so với địa chỉ thực tế.

Chỉ cảnh báo khi:
- Địa chỉ ở tỉnh/thành này nhưng tọa độ nằm sang tỉnh/thành khác rất xa
- Tọa độ nằm ngoài biển
- Tọa độ nằm ngoài lãnh thổ Việt Nam
- Sai lệch lớn trên 20km so với vị trí hợp lý của địa chỉ

Không cảnh báo các sai lệch nhỏ.

Trả về JSON dạng:
[
  {
    "name": "Tên trạm",
    "address": "Địa chỉ",
    "latitude": 10.0,
    "longitude": 106.0,
    "issue": "Tọa độ lệch xa so với địa chỉ",
    "recommendation": "Kiểm tra lại tọa độ vì sai lệch lớn"
  }
]

Nếu không có trạm nào sai lệch lớn thì trả về [].

Chỉ trả về JSON, không giải thích thêm.`;

          const response = await generateWithRetry(
            ai,
            prompt,
            "gemini-2.5-flash",
            3
          );

          const rawText =
            typeof response.text === 'function'
              ? await response.text()
              : (response.text || '[]');

          const text = rawText.trim();
          const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsedWarnings = JSON.parse(jsonStr);

          warnings = parsedWarnings.map((w: any) => ({
            ...w,
            id: Math.random().toString(36).substring(2, 9),
            isRead: false,
          }));
        } else {
          console.warn("VITE_GEMINI_API_KEY is not defined. Skipping AI validation.");
        }
      } catch (err) {
        console.error("AI Validation error:", err);
        const msg = err instanceof Error ? err.message : String(err);

        if (msg.includes('"code":503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
          alert("AI đang quá tải tạm thời. Vui lòng thử lại sau ít phút.");
        } else {
          alert("Lỗi kiểm tra địa chỉ/tọa độ bằng AI: " + msg);
        }
      } finally {
        setIsValidating(false);
      }

      let successCount = 0;
      let errorCount = 0;
      const errorDetails: string[] = [];

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
        alert(`Có ${errorCount} trạm bị lỗi khi lưu vào cơ sở dữ liệu.
Chi tiết lỗi (tối đa 5):
${errorDetails.join('\n')}

Vui lòng kiểm tra lại định dạng dữ liệu hoặc quyền truy cập.`);
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
    </motion.div>
  );
}

function PlannerTab({ stations, dailyPlans, user, reports }: { stations: Station[], dailyPlans: DailyPlan[], user: User, reports: Report[] }) {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedStationIds, setSelectedStationIds] = useState<string[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeProgress, setOptimizeProgress] = useState('');
  const [optimizeError, setOptimizeError] = useState<string | null>(null);
  const [optimizedRoute, setOptimizedRoute] = useState<string[] | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null);
  
  const [confirmSavePlan, setConfirmSavePlan] = useState(false);
  const [stationToRemove, setStationToRemove] = useState<Station | null>(null);
  const [reportModalStation, setReportModalStation] = useState<Station | null>(null);
  const [reportContent, setReportContent] = useState('');
  const [confirmSaveReport, setConfirmSaveReport] = useState(false);
  
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
    }
  }, [selectedDate, currentPlan]);

  useEffect(() => {
    const fetchRouteGeometry = async () => {
      const activeIds = optimizedRoute || selectedStationIds;
      if (activeIds.length < 2 && !startCoords) {
        setRouteGeometry(null);
        return;
      }
      const routeStations = activeIds.map(id => stations.find(s => s.id === id)).filter(Boolean) as Station[];
      let coordinates = routeStations.map(s => `${s.longitude},${s.latitude}`).join('\n');
      
      if (startCoords) {
        coordinates = `${startCoords[1]},${startCoords[0]};` + coordinates;
      }

      if (coordinates.split(';').length < 2) {
        setRouteGeometry(null);
        return;
      }

      try {
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?geometries=geojson&overview=full`);
        const data = await res.json();
        if (data.routes && data.routes[0]) {
          const latLngs = data.routes[0].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
          setRouteGeometry(latLngs);
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

  const openReportModal = (station: Station) => {
    const existing = reports.find(r => r.stationId === station.id && r.date === selectedDate);
    setReportContent(existing?.content || '');
    setReportModalStation(station);
  };

  const handleSaveReport = async () => {
    if (!reportModalStation) return;
    const existing = reports.find(r => r.stationId === reportModalStation.id && r.date === selectedDate);
    const now = new Date().toISOString();
    const trimmedContent = reportContent.trim();

    if (!trimmedContent) {
      alert('Nội dung báo cáo không được để trống.');
      return;
    }

    try {
      if (existing) {
        const updatePayload: Record<string, unknown> = {
          content: trimmedContent,
          updatedAt: now,
        };

        if ((existing.content || '').trim() !== trimmedContent) {
          updatePayload.history = arrayUnion({
            userId: user.uid,
            userName: user.email || 'Unknown',
            timestamp: now,
            content: existing.content || ''
          });
        }

        await updateDoc(doc(db, 'reports', existing.id), updatePayload);
      } else {
        await addDoc(collection(db, 'reports'), {
          stationId: reportModalStation.id,
          stationName: reportModalStation.name,
          userId: user.uid,
          date: selectedDate,
          content: trimmedContent,
          status: 'completed',
          createdAt: now,
          updatedAt: now,
          history: []
        });
      }

      await updateDoc(doc(db, 'stations', reportModalStation.id), { status: 'checked' });
      setReportModalStation(null);
      alert('Đã cập nhật báo cáo công việc!');
    } catch (err) {
      console.error(err);
      alert('Lỗi khi lưu báo cáo.');
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
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Thiếu VITE_GEMINI_API_KEY');
      }

      const selectedStations = stations.filter(s => selectedStationIds.includes(s.id));
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `Tôi có danh sách các trạm viễn thông sau:
${selectedStations.map(s => `- ID: ${s.id}, Tên: ${s.name}, Tọa độ: ${s.latitude}, ${s.longitude}`).join('\n')}

Vị trí xuất phát của tôi là: ${startLocation || 'Không xác định, hãy tự chọn điểm bắt đầu phù hợp nhất từ danh sách trạm'}.

Hãy sắp xếp thứ tự các trạm này để tạo thành một lộ trình tối ưu nhất (ngắn nhất) bắt đầu từ vị trí xuất phát.
Chỉ trả về danh sách các ID trạm theo đúng thứ tự, cách nhau bởi dấu phẩy.
Không giải thích gì thêm.`;

      setOptimizeProgress('Đang phân tích tọa độ và tính toán khoảng cách...');

      const response = await generateWithRetry(
        ai,
        prompt,
        "gemini-2.5-flash",
        3
      );

      setOptimizeProgress('Đang hoàn thiện lộ trình...');

      const rawText =
        typeof response.text === 'function'
          ? await response.text()
          : (response.text || '');

      const result = rawText
        .trim()
        .split(',')
        .map(id => id.trim())
        .filter(Boolean);

      if (result.length === selectedStationIds.length) {
        setOptimizedRoute(result);
        setSelectedStationIds(result);
      } else {
        throw new Error('AI trả về kết quả không hợp lệ: ' + rawText);
      }
    } catch (err) {
      console.error('Optimization error:', err);
      const msg = err instanceof Error ? err.message : String(err);

      if (msg.includes('"code":503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
        setOptimizeError('AI đang quá tải tạm thời. Vui lòng thử lại sau ít phút.');
      } else {
        setOptimizeError('Không thể tối ưu lộ trình lúc này. Chi tiết: ' + msg);
      }
    } finally {
      setIsOptimizing(false);
      setOptimizeProgress('');
    }
  };

  const [confirmDeletePlan, setConfirmDeletePlan] = useState(false);
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
            {activeIds.map((sid, index) => {
              const station = stations.find(s => s.id === sid);
              if (!station) return null;
              
              const isSaved = currentPlan?.stationIds.includes(sid);
              const existingReport = reports.find(r => r.stationId === sid && r.date === selectedDate);
              const isCompleted = !!existingReport;

              return (
                <div key={sid} className="flex items-center gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                      {index + 1}
                    </div>
                    {index < activeIds.length - 1 && (
                      <div className="w-0.5 h-8 bg-blue-200 my-1"></div>
                    )}
                  </div>
                  <Card className="flex-1 p-3 flex items-start justify-between">
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
                          onClick={() => openReportModal(station)}
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

        {reportModalStation && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl flex flex-col max-h-[90vh]"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900">Cập nhật công việc</h3>
                <button onClick={() => setReportModalStation(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto pr-2">
                <div className="mb-4">
                  <p className="text-sm text-gray-500">Trạm</p>
                  <p className="font-bold text-gray-900">{reportModalStation.name}</p>
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nội dung công việc đã thực hiện</label>
                  <textarea
                    className="w-full border border-gray-300 rounded-lg p-3 min-h-[120px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="Nhập chi tiết công việc, tình trạng thiết bị..."
                    value={reportContent}
                    onChange={(e) => setReportContent(e.target.value)}
                  />
                </div>
                
                {reports.find(r => r.stationId === reportModalStation.id && r.date === selectedDate)?.history?.length ? (
                  <div className="mt-6 border-t border-gray-100 pt-4">
                    <h4 className="text-sm font-bold text-gray-700 mb-3">Lịch sử thay đổi</h4>
                    <div className="space-y-3">
                      {reports.find(r => r.stationId === reportModalStation.id && r.date === selectedDate)?.history?.map((h, i) => (
                        <div key={i} className="bg-gray-50 p-3 rounded-lg text-sm">
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span className="font-medium text-gray-700">{h.userName}</span>
                            <span>{format(parseISO(h.timestamp), 'dd/MM/yyyy HH:mm')}</span>
                          </div>
                          <p className="text-gray-600 whitespace-pre-wrap">{h.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              
              <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
                <Button variant="secondary" className="flex-1" onClick={() => setReportModalStation(null)}>
                  Hủy
                </Button>
                <Button className="flex-1" onClick={() => setConfirmSaveReport(true)} disabled={!reportContent.trim()}>
                  Lưu báo cáo
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {confirmSaveReport && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-2">Xác nhận lưu báo cáo</h3>
              <p className="text-gray-600 mb-6">
                Bạn có chắc chắn muốn lưu báo cáo công việc cho trạm <strong>{reportModalStation?.name}</strong> không?
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setConfirmSaveReport(false)}>
                  Hủy
                </Button>
                <Button className="flex-1" onClick={() => { setConfirmSaveReport(false); handleSaveReport(); }}>
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

function ReportsTab({ reports, stations, user }: { reports: Report[], stations: Station[], user: User }) {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'pending'>('all');
  const [reportTemplate, setReportTemplate] = useState(`1) Thông tin trạm:
- Tên trạm:
- Mã trạm:
- Địa chỉ:

2) Công việc thực hiện:
- Hạng mục:
- Chi tiết thao tác:
- Kết quả:

3) Tình trạng thiết bị:
- Nguồn điện:
- Truyền dẫn:
- Thiết bị chính:

4) Sự cố/rủi ro:
- Mô tả:
- Mức độ ảnh hưởng:
- Biện pháp xử lý tạm thời:

5) Kiến nghị:
- Vật tư/nhân lực cần bổ sung:
- Kế hoạch follow-up:
`);
  const [copyStatus, setCopyStatus] = useState('');

  const stationsMap = useMemo(() => {
    return stations.reduce<Record<string, Station>>((acc, station) => {
      acc[station.id] = station;
      return acc;
    }, {});
  }, [stations]);

  const selectedDateReports = useMemo(() => {
    return reports.filter(report => report.date === selectedDate);
  }, [reports, selectedDate]);

  const filteredReports = useMemo(() => {
    return selectedDateReports.filter(report => {
      const stationName = report.stationName || stationsMap[report.stationId]?.name || '';
      const keyword = search.toLowerCase();
      const matchesSearch =
        !keyword ||
        stationName.toLowerCase().includes(keyword) ||
        report.content.toLowerCase().includes(keyword);
      const matchesStatus = statusFilter === 'all' || report.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [selectedDateReports, search, statusFilter, stationsMap]);

  const monthlyStats = useMemo(() => {
    const start = startOfMonth(parseISO(selectedDate));
    const end = endOfMonth(parseISO(selectedDate));
    const inMonth = reports.filter(r => isWithinInterval(parseISO(r.date), { start, end }));
    const completed = inMonth.filter(r => r.status === 'completed').length;
    const pending = inMonth.length - completed;
    return { total: inMonth.length, completed, pending };
  }, [reports, selectedDate]);

  const copyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(reportTemplate);
      setCopyStatus('Đã sao chép mẫu báo cáo.');
      setTimeout(() => setCopyStatus(''), 2000);
    } catch (error) {
      console.error(error);
      setCopyStatus('Không thể sao chép. Hãy copy thủ công.');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="space-y-6 w-full"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-900">Báo cáo công việc</h2>
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

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3 text-center">
          <p className="text-xs text-gray-500">Báo cáo tháng</p>
          <p className="text-2xl font-bold text-blue-600">{monthlyStats.total}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-gray-500">Hoàn thành</p>
          <p className="text-2xl font-bold text-green-600">{monthlyStats.completed}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-gray-500">Chờ xử lý</p>
          <p className="text-2xl font-bold text-amber-600">{monthlyStats.pending}</p>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="font-bold text-gray-900 mb-3">Form báo cáo đề xuất (tối ưu cho đội vận hành)</h3>
        <p className="text-sm text-gray-600 mb-3">
          Mẫu này ưu tiên đủ thông tin cho kỹ thuật + quản lý: hiện trạng, xử lý, rủi ro, kiến nghị và kế hoạch follow-up.
        </p>
        <textarea
          className="w-full border border-gray-300 rounded-lg p-3 min-h-[220px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
          value={reportTemplate}
          onChange={(e) => setReportTemplate(e.target.value)}
        />
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-gray-500">{copyStatus || 'Bạn có thể tùy biến mẫu theo đơn vị.'}</span>
          <Button onClick={copyTemplate} variant="outline">
            <Copy className="w-4 h-4" /> Sao chép mẫu
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Tìm theo tên trạm hoặc nội dung..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="w-full sm:w-44 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'completed' | 'pending')}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="completed">Hoàn thành</option>
            <option value="pending">Chờ xử lý</option>
          </select>
        </div>

        <div className="space-y-3">
          {filteredReports.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              Chưa có báo cáo phù hợp bộ lọc trong ngày đã chọn.
            </div>
          ) : (
            filteredReports.map(report => {
              const station = stationsMap[report.stationId];
              return (
                <div key={report.id} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-gray-900">{report.stationName || station?.name || 'Không xác định trạm'}</h4>
                      <p className="text-xs text-gray-500 mt-1">Ngày: {format(parseISO(report.date), 'dd/MM/yyyy')}</p>
                    </div>
                    <span className={cn(
                      "text-xs font-semibold px-2 py-1 rounded-full",
                      report.status === 'completed' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    )}>
                      {report.status === 'completed' ? 'Hoàn thành' : 'Chờ xử lý'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap">{report.content}</p>
                  <div className="text-xs text-gray-500 mt-3 pt-2 border-t border-gray-100">
                    Người thực hiện: {user.displayName || user.email || 'Không xác định'} • Số lần chỉnh sửa: {report.history?.length || 0}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </motion.div>
  );
}

function SettingsTab({ user, logout }: { user: User, logout: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      transition={{ duration: 0.15 }}
      className="space-y-6 w-full"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Cài đặt</h2>
      </div>
      <Card className="p-6">
        <div className="flex flex-col items-center gap-4 mb-6">
          <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
            {user.photoURL ? (
              <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <UserIcon className="w-12 h-12 text-gray-400" />
            )}
          </div>
          <div className="text-center">
            <h3 className="text-xl font-bold text-gray-900">{user.displayName || 'Người dùng'}</h3>
            <p className="text-gray-500">{user.email}</p>
          </div>
        </div>
        <div className="space-y-4">
          <Button onClick={logout} variant="danger" className="w-full">
            <LogOut className="w-5 h-5" /> Đăng xuất
          </Button>
        </div>
      </Card>
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
