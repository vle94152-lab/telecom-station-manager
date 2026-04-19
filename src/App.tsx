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
import { Station, Report, DailyPlan, Tab, ValidationWarning, EquipmentDict, TaskGroup, ReportDetail } from './types';
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
  Database,
  Zap,
  Ticket,
  Percent,
  Star,
  Activity,
  Layers,
  Save
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

import { OperationType, FirestoreErrorInfo, handleFirestoreError } from './lib/firebase-utils';

// Fix for default marker icon in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

import { Button } from './components/ui/Button';
import { Input } from './components/ui/Input';
import { Card } from './components/ui/Card';
import { getStationIcon, formatStationName } from './lib/constants';

// --- Components ---

import { MapUpdater } from './components/MapComponents';
import { ReportsTab } from './pages/ReportsTab';
import { StationsTab } from './pages/StationsTab';
import { PlannerTab } from './pages/PlannerTab';
import { AdminTab } from './pages/AdminTab';
import { DashboardTab } from './pages/DashboardTab';

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
  const [workspaces, setWorkspaces] = useState<{id: string, name: string}[]>([]);
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
          { name: 'Dây nguồn', validSpaces: ['Indoor', 'Outdoor'] },
          { name: 'Dây Jet', validSpaces: ['Indoor', 'Outdoor'] },
          { name: 'Dây tiếp đất', validSpaces: ['Indoor', 'Outdoor'] }
        ];
        try {
          for (const eq of initialEquipments) {
            await addDoc(collection(db, 'equipment_dictionary'), eq);
          }
        } catch (e) {
          console.error("Failed to seed equipment dictionary", e);
        }
      } else {
        const dict = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EquipmentDict));
        setEquipmentDict(dict);
        
        // Ensure missing required items exist
        const requiredMissing = [];
        if (!dict.some(d => d.name.toLowerCase() === 'dây jet')) {
          requiredMissing.push({ name: 'Dây Jet', validSpaces: ['Indoor', 'Outdoor'] });
        }
        if (!dict.some(d => d.name.toLowerCase() === 'dây tiếp đất')) {
          requiredMissing.push({ name: 'Dây tiếp đất', validSpaces: ['Indoor', 'Outdoor'] });
        }
        if (requiredMissing.length > 0) {
          requiredMissing.forEach(eq => addDoc(collection(db, 'equipment_dictionary'), eq).catch(console.error));
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'equipment_dictionary');
    });

    const taskGroupUnsubscribe = onSnapshot(collection(db, 'task_groups'), async (snapshot) => {
      if (snapshot.empty) {
        const initialTaskGroups = [
          { name: 'Lắp đặt', modules: ['EQUIPMENT', 'NOTE'] }, 
          { name: 'Tích hợp', modules: ['EQUIPMENT', 'NOTE'] }, 
          { name: 'Sửa chữa', modules: ['EQUIPMENT', 'NOTE'] }, 
          { name: 'Khảo sát', modules: ['NOTE'] },
          { name: 'Thu hồi', modules: ['EQUIPMENT', 'NOTE'] }
        ];
        for (const tg of initialTaskGroups) {
          await addDoc(collection(db, 'task_groups'), tg);
        }
      } else {
        setTaskGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TaskGroup)));
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'task_groups'));

    const workspacesUnsubscribe = onSnapshot(collection(db, 'workspaces'), async (snapshot) => {
      if (snapshot.empty) {
        const initialWorkspaces = [{ name: 'Indoor' }, { name: 'Outdoor' }];
        for (const ws of initialWorkspaces) {
          await addDoc(collection(db, 'workspaces'), ws);
        }
      } else {
        setWorkspaces(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as {id: string, name: string})));
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'workspaces'));

    return () => {
      stationsUnsubscribe();
      reportsUnsubscribe();
      plansUnsubscribe();
      equipUnsubscribe();
      taskGroupUnsubscribe();
      workspacesUnsubscribe();
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
    <div className="min-h-screen bg-gradient-to-b from-[#bde0fe] via-[#e0f2fe] to-gray-50 pb-24">
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
      <main className={cn("mx-auto relative", activeTab !== 'dashboard' ? "p-3 sm:p-6 pb-24 max-w-4xl" : "pb-24")}>
        {activeTab === 'dashboard' && <DashboardTab key="dashboard" stations={stations} reports={reports} dailyPlans={dailyPlans} user={user} logout={logout} validationWarnings={validationWarnings} setValidationWarnings={setValidationWarnings} setActiveTab={setActiveTab} />}
        {activeTab === 'stations' && <StationsTab key="stations" stations={stations} reports={reports} validationWarnings={validationWarnings} setValidationWarnings={setValidationWarnings} />}
        {activeTab === 'planner' && <PlannerTab key="planner" stations={stations} dailyPlans={dailyPlans} user={user} reports={reports} onOpenCreateReport={(stationId) => { setPrefilledStationId(stationId); setActiveTab('reports'); }} />}
        {activeTab === 'admin' && <AdminTab key="admin" equipmentDict={equipmentDict} taskGroups={taskGroups} workspaces={workspaces} />}
        {activeTab === 'reports' && <ReportsTab key="reports" stations={stations} user={user} equipmentDict={equipmentDict} taskGroups={taskGroups} workspaces={workspaces} technologies={['2G', '3G', '4G', '5G']} initialStationId={prefilledStationId} reports={reports} />}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.08)] rounded-t-[2rem] z-40 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-4xl mx-auto flex justify-between items-end px-4 sm:px-8 relative h-[4.5rem]">
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
          
          <div 
             className="relative -top-5 flex flex-col items-center group cursor-pointer w-16 sm:w-20" 
             onClick={() => { setPrefilledStationId(''); setActiveTab('reports'); }}
          >
            <div className={cn(
              "w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-lg transform transition-transform group-hover:scale-105 border-[3px] border-gray-50",
               activeTab === 'reports' ? "shadow-blue-500/30" : "shadow-gray-200/50"
            )}>
               <div className={cn(
                 "w-full h-full rounded-full flex items-center justify-center transition-colors", 
                 activeTab === 'reports' ? "bg-gradient-to-tr from-blue-600 to-cyan-500 text-white" : "text-gray-500"
               )}>
                  <span className="transform -rotate-12"><Activity className="w-6 h-6" /></span>
               </div>
            </div>
            <span className={cn(
               "text-[9px] sm:text-[10px] mt-1 whitespace-nowrap transition-all", 
               activeTab === 'reports' ? "font-bold text-blue-600" : "font-medium text-gray-500"
            )}>Báo cáo</span>
          </div>

          <NavButton 
            active={activeTab === 'stations'} 
            onClick={() => setActiveTab('stations')} 
            icon={<List />} 
            label="Danh sách" 
          />
          <NavButton 
            active={activeTab === 'admin'} 
            onClick={() => setActiveTab('admin')} 
            icon={<Settings2 />} 
            label="Quản trị" 
          />
        </div>
      </nav>

      {/* Bottom Navigation */}
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1 pb-2 transition-all duration-300 w-14 sm:w-16 overflow-hidden group',
        active ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'
      )}
    >
      <div className={cn(
        "relative w-8 h-8 flex items-center justify-center transition-all duration-300",
        active ? "text-blue-600" : "text-gray-500"
      )}>
        {React.cloneElement(icon, { 
          className: cn(
            'w-6 h-6 flex-shrink-0 transition-all duration-300', 
            active ? 'stroke-[2.5px]' : 'stroke-1 relative top-[1px]'
          ) 
        })}
      </div>
      <div className="nav-text-container w-full px-0.5">
        <span className={cn(
          "text-[9px] sm:text-[10px] whitespace-nowrap overflow-hidden text-ellipsis block text-center transition-all duration-300", 
          active ? "font-bold" : "font-medium"
        )}>{label}</span>
      </div>
    </button>
  );
}