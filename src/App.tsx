import React, { useEffect, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { Route, LogOut } from 'lucide-react';
import { motion } from 'motion/react';
import 'leaflet/dist/leaflet.css';

import { auth, db } from './firebase';
import { DailyPlan, Report, Station, Tab, ValidationWarning } from './types';
import { Button } from './components/ui';
import { NavButton, navIcons } from './features/map/mapUtils';
import DashboardTab from './features/dashboard/DashboardTab';
import StationsTab from './features/stations/StationsTab';
import PlannerTab from './features/planner/PlannerTab';
import SettingsTab from './features/settings/SettingsTab';
import { subscribeDailyPlans, subscribeReports, subscribeStations } from './services/firestoreService';
import { doc, getDocFromServer } from 'firebase/firestore';
import { logger } from './lib/logger';

enum OperationType {
  LIST = 'list',
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
  };
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
  };
  logger.error('Firestore Error', errInfo as unknown as Record<string, unknown>);
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('planner');
  const [stations, setStations] = useState<Station[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [dailyPlans, setDailyPlans] = useState<DailyPlan[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<ValidationWarning[] | null>(null);

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
        if (error instanceof Error && error.message.includes('the client is offline')) {
          logger.error('Please check Firebase configuration', { error: error.message });
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    if (!user) return;

    const stationsUnsubscribe = subscribeStations(
      setStations,
      (error) => handleFirestoreError(error, OperationType.LIST, 'stations'),
    );
    const reportsUnsubscribe = subscribeReports(
      user.uid,
      setReports,
      (error) => handleFirestoreError(error, OperationType.LIST, 'reports'),
    );
    const plansUnsubscribe = subscribeDailyPlans(
      user.uid,
      setDailyPlans,
      (error) => handleFirestoreError(error, OperationType.LIST, 'dailyPlans'),
    );

    return () => {
      stationsUnsubscribe();
      reportsUnsubscribe();
      plansUnsubscribe();
    };
  }, [user]);

  const login = () => signInWithPopup(auth, new GoogleAuthProvider());
  const logout = () => signOut(auth);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full">
          <div className="bg-blue-600 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-blue-200"><Route className="text-white w-10 h-10" /></div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Telecom Station Manager</h1>
          <p className="text-gray-600 mb-8">Quản lý trạm viễn thông, tối ưu hóa tuyến đường và báo cáo công việc hàng ngày.</p>
          <Button onClick={login} className="w-full py-4 text-lg">Đăng nhập với Google</Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {activeTab !== 'dashboard' && (
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-blue-600 p-1.5 rounded-lg"><Route className="text-white w-5 h-5" /></div>
              <span className="font-bold text-gray-900">TSM App</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500 hidden sm:block">{user.displayName}</span>
              <button onClick={logout} className="p-2 text-gray-400 hover:text-red-600 transition-colors"><LogOut className="w-5 h-5" /></button>
            </div>
          </div>
        </header>
      )}

      <main className={activeTab !== 'dashboard' ? 'max-w-4xl mx-auto relative p-4' : 'max-w-4xl mx-auto relative'}>
        {activeTab === 'dashboard' && <DashboardTab stations={stations} reports={reports} dailyPlans={dailyPlans} user={user} validationWarnings={validationWarnings} setValidationWarnings={setValidationWarnings} />}
        {activeTab === 'stations' && <StationsTab stations={stations} validationWarnings={validationWarnings} setValidationWarnings={setValidationWarnings} />}
        {activeTab === 'planner' && <PlannerTab stations={stations} dailyPlans={dailyPlans} user={user} reports={reports} />}
        {activeTab === 'settings' && <SettingsTab user={user} logout={logout} />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.05)] rounded-t-3xl z-40">
        <div className="max-w-4xl mx-auto flex justify-between items-center px-6 py-2 relative">
          <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<navIcons.Home />} label="Trang chủ" />
          <NavButton active={activeTab === 'planner'} onClick={() => setActiveTab('planner')} icon={<navIcons.Route />} label="Lộ trình" />
          <div className="relative -top-8 flex justify-center w-16"><div className="absolute w-20 h-20 bg-white rounded-full -top-2 flex items-center justify-center shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.05)]"><button className="w-16 h-16 bg-[#b90000] rounded-full flex items-center justify-center text-white shadow-lg hover:bg-red-800 transition-colors"><span className="text-4xl font-light leading-none mb-1">+</span></button></div></div>
          <NavButton active={activeTab === 'stations'} onClick={() => setActiveTab('stations')} icon={<navIcons.MapPin />} label="Danh sách" />
          <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<navIcons.Settings />} label="Cài đặt" />
        </div>
      </nav>
    </div>
  );
}
