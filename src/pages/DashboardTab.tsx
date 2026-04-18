import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Bell, Layers, Map, ClipboardCheck, Upload, Database, PlusCircle, LogOut, CheckCircle2, History, X } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { Station, Report, DailyPlan, User, ValidationWarning, Tab } from '../types';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/utils';
import { getStationIcon } from '../lib/constants';
import { MapUpdater } from '../components/MapComponents';

export function DashboardTab({ stations, reports, dailyPlans, user, logout, validationWarnings, setValidationWarnings, setActiveTab }: { stations: Station[], reports: Report[], dailyPlans: DailyPlan[], user: User, logout: () => void, validationWarnings: ValidationWarning[] | null, setValidationWarnings: (warnings: ValidationWarning[] | null) => void, setActiveTab: (tab: Tab) => void }) {
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

  const filteredStations = useMemo(() => {
    return stations.filter(s => {
      const matchSearch = searchTerm === '' || s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.infrastructureCode?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchDept = filterDepartment === '' || s.infrastructureDepartment === filterDepartment;
      const matchManager = filterManager === '' || s.managerName === filterManager;
      const matchStatus = filterStatus === 'all' || s.status === filterStatus;
      return matchSearch && matchDept && matchManager && matchStatus;
    });
  }, [stations, searchTerm, filterDepartment, filterManager, filterStatus]);

  const stats = useMemo(() => {
    const total = filteredStations.length;
    const checked = filteredStations.filter(s => s.status === 'checked').length;
    return {
      total,
      checked,
      unchecked: total - checked
    };
  }, [filteredStations]);

  const chartData = [
    { name: 'Đã kiểm tra', value: stats.checked, color: '#10b981' },
    { name: 'Chưa kiểm tra', value: stats.unchecked, color: '#f43f5e' }
  ];

  const todayStr = new Date().toISOString().split('T')[0];
  const todayPlan = dailyPlans.find(p => p.date === todayStr && p.userId === user.id);
  const todayStationIds = todayPlan ? todayPlan.stationIds : [];

  const handleAddToRoute = (station: Station) => {
    // Basic navigation or trigger planner
    setActiveTab('planner');
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      transition={{ duration: 0.2 }}
      className="max-w-md mx-auto min-h-screen bg-slate-50 overflow-x-hidden"
    >
      {/* Header Profile Section */}
      <div className="bg-gradient-to-b from-blue-600 to-blue-700 pt-6 pb-20 px-4 sm:px-6 rounded-b-[2rem] shadow-md relative z-10">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/30 text-white font-bold text-lg shadow-sm">
              {user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}
            </div>
            <div>
              <p className="text-blue-100 text-xs font-medium mb-0.5">Xin chào,</p>
              <h2 className="text-white font-bold text-sm sm:text-base pr-2 truncate max-w-[150px] sm:max-w-[200px]">
                {user.displayName || user.email}
              </h2>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowNotifications(true)}
              className="bg-white/10 hover:bg-white/20 p-2.5 rounded-full backdrop-blur-sm border border-white/20 transition-all text-white relative shadow-sm"
            >
              <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 sm:w-2.5 sm:h-2.5 bg-rose-500 rounded-full border border-blue-600 animate-pulse"></span>
              )}
            </button>
            <button 
              onClick={logout}
              className="bg-white/10 hover:bg-white/20 p-2.5 rounded-full backdrop-blur-sm border border-white/20 transition-all text-white shadow-sm"
            >
              <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Notifications Panel */}
        <AnimatePresence>
          {showNotifications && (
            <>
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setShowNotifications(false)}
                className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
              />
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }} 
                animate={{ opacity: 1, y: 0, scale: 1 }} 
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                className="absolute top-20 right-4 w-80 bg-white rounded-2xl shadow-xl z-50 overflow-hidden border border-slate-100"
              >
                <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <Bell className="w-4 h-4 text-blue-600" />
                    Bảng tin & Cảnh báo
                  </h3>
                  <div className="flex gap-2">
                    {unreadCount > 0 && (
                      <button onClick={handleMarkAllAsRead} className="text-[10px] text-blue-600 font-medium hover:underline bg-blue-50 px-2 py-1 rounded">
                        Đọc tất cả
                      </button>
                    )}
                    <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-slate-600 p-1">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="max-h-[60vh] overflow-y-auto p-2 space-y-2 bg-slate-50/50">
                  {!validationWarnings || validationWarnings.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 flex flex-col items-center">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-2 opacity-50" />
                      <p className="text-xs font-medium">Hệ thống đang hoạt động tốt.</p>
                      <p className="text-[10px] text-slate-400">Không có cảnh báo dữ liệu nào.</p>
                    </div>
                  ) : (
                    validationWarnings.map(warning => (
                      <div key={warning.id} className={cn("border rounded-xl p-3 relative transition-colors shadow-sm", warning.isRead ? "bg-white border-slate-200" : "bg-rose-50 border-rose-100")}>
                        <div className="pr-6">
                          <h4 className={cn("font-bold text-xs mb-1", warning.isRead ? "text-slate-700" : "text-rose-900")}>{warning.name}</h4>
                          {warning.infrastructureCode && <p className="text-[10px] text-slate-500 mb-1">Mã: {warning.infrastructureCode}</p>}
                          <div className={cn("text-[10px] space-y-1 mb-2", warning.isRead ? "text-slate-600" : "text-rose-800")}>
                            {warning.issues.map((issue, idx) => (
                              <div key={idx} className="flex items-start gap-1.5">
                                <span className={cn("mt-0.5", warning.isRead ? "text-slate-400" : "text-rose-500")}>•</span>
                                <span>{issue}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="absolute top-2 right-2 flex gap-1">
                          {!warning.isRead && (
                            <button onClick={() => handleMarkAsRead(warning.id)} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors" title="Đánh dấu đã đọc">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button onClick={() => handleDeleteWarning(warning.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Bỏ qua cảnh báo">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      <div className="-mt-12 relative z-20 px-4 sm:px-6">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <History className="w-5 h-5 text-blue-500" />
            <div>
              <div className="text-xs text-slate-500 font-medium mb-0.5">Tiến độ hôm nay</div>
              <div className="text-sm font-bold text-slate-800">
                {reports.filter(r => r.date === todayStr && r.createdBy === user.email).length} / {todayStationIds.length} báo cáo
              </div>
            </div>
          </div>
          <Button 
            size="sm" 
            className="text-xs h-8 px-3 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 border-0 shadow-none font-semibold"
            onClick={() => setActiveTab('planner')}
          >
            Lộ trình
          </Button>
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
        </div>

        <div className="rounded-2xl overflow-hidden shadow-sm h-96 relative z-0 border border-gray-200">
          <MapContainer 
            center={[10.762622, 106.660172]} 
            zoom={12} 
            className="w-full h-full"
            zoomControl={false}
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

      {/* Stats Section & Chart */}
      <div className="px-4 sm:px-6 mt-6 relative z-20">
        <div className="bg-white rounded-[1.5rem] pt-5 pb-6 px-4 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-white/60">
          <div className="flex items-center gap-2 mb-4 mt-1">
            <div className="p-1 bg-green-100 rounded-md text-green-600">
               <Database className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-800 text-base">Tổng quan dữ liệu</h3>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
            <div 
              onClick={() => setFilterStatus('all')}
              className={cn("rounded-[1.125rem] p-3 shadow-sm border flex flex-col items-center justify-center cursor-pointer transition-all", filterStatus === 'all' ? "bg-blue-50 border-blue-200 ring-2 ring-blue-500/20" : "bg-white border-slate-100 hover:bg-slate-50")}
            >
              <div className="text-2xl font-bold text-blue-600 mb-0.5">{stats.total}</div>
              <div className="text-[10px] text-slate-500 font-medium text-center">Tổng số</div>
            </div>
            <div 
              onClick={() => setFilterStatus('checked')}
              className={cn("rounded-[1.125rem] p-3 shadow-sm border flex flex-col items-center justify-center cursor-pointer transition-all", filterStatus === 'checked' ? "bg-emerald-50 border-emerald-200 ring-2 ring-emerald-500/20" : "bg-white border-slate-100 hover:bg-slate-50")}
            >
              <div className="text-2xl font-bold text-emerald-500 mb-0.5">{stats.checked}</div>
              <div className="text-[10px] text-slate-500 font-medium text-center">Đã kiểm tra</div>
            </div>
            <div 
              onClick={() => setFilterStatus('unchecked')}
              className={cn("rounded-[1.125rem] p-3 shadow-sm border flex flex-col items-center justify-center cursor-pointer transition-all", filterStatus === 'unchecked' ? "bg-rose-50 border-rose-200 ring-2 ring-rose-500/20" : "bg-white border-slate-100 hover:bg-slate-50")}
            >
              <div className="text-2xl font-bold text-rose-500 mb-0.5">{stats.unchecked}</div>
              <div className="text-[10px] text-slate-500 font-medium text-center">Chưa K/T</div>
            </div>
          </div>
          
          <div className="h-44 w-full">
            {stats.total > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    formatter={(value: number) => [`${value} trạm`, 'Số lượng']}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                  />
                  <Legend verticalAlign="bottom" height={24} iconType="circle" wrapperStyle={{ fontSize: '11px', color: '#64748b' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 space-y-2">
                <Database className="w-8 h-8 text-slate-200" />
                <div className="text-xs font-medium">Chưa có dữ liệu</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 sm:px-6 mt-6 mb-8 relative z-20">
        <div className="bg-white rounded-[1.5rem] pt-5 pb-6 px-4 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-white/60">
          <div className="flex items-center gap-2 mb-5">
            <div className="p-1 bg-blue-100 rounded-md text-blue-600">
               <Layers className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-800 text-base">Tính năng thường dùng</h3>
          </div>
          
          <div className="grid grid-cols-4 gap-x-2 gap-y-4">
            <div className="flex flex-col items-center gap-2 cursor-pointer group" onClick={() => setActiveTab('stations')}>
              <div className="w-[3.25rem] h-[3.25rem] rounded-[1.125rem] border border-slate-100 flex items-center justify-center text-blue-500 bg-white group-hover:bg-blue-50 transition-colors shadow-sm">
                <Map className="w-6 h-6 stroke-[1.5]" />
              </div>
              <span className="text-[10px] sm:text-xs text-slate-600 font-medium text-center leading-[1.15]">Bản đồ<br/>Trạm</span>
            </div>
            
            <div className="flex flex-col items-center gap-2 cursor-pointer group" onClick={() => setActiveTab('reports')}>
              <div className="w-[3.25rem] h-[3.25rem] rounded-[1.125rem] border border-slate-100 flex items-center justify-center text-emerald-500 bg-white group-hover:bg-emerald-50 transition-colors shadow-sm">
                <ClipboardCheck className="w-6 h-6 stroke-[1.5]" />
              </div>
              <span className="text-[10px] sm:text-xs text-slate-600 font-medium text-center leading-[1.15]">Tạo<br/>Báo cáo</span>
            </div>

            <div className="flex flex-col items-center gap-2 cursor-pointer group" onClick={() => setActiveTab('stations')}>
              <div className="w-[3.25rem] h-[3.25rem] rounded-[1.125rem] border border-slate-100 flex items-center justify-center text-amber-500 bg-white group-hover:bg-amber-50 transition-colors shadow-sm">
                <Upload className="w-6 h-6 stroke-[1.5]" />
              </div>
              <span className="text-[10px] sm:text-xs text-slate-600 font-medium text-center leading-[1.15]">Nhập<br/>Dữ liệu</span>
            </div>

            <div className="flex flex-col items-center gap-2 cursor-pointer group" onClick={() => setShowNotifications(true)}>
              <div className="w-[3.25rem] h-[3.25rem] rounded-[1.125rem] border border-slate-100 flex items-center justify-center text-rose-500 bg-white group-hover:bg-rose-50 transition-colors shadow-sm relative">
                <Bell className="w-6 h-6 stroke-[1.5]" />
                {unreadCount > 0 && <span className="absolute top-0 right-0 w-3 h-3 bg-rose-500 rounded-full border-2 border-white"></span>}
              </div>
              <span className="text-[10px] sm:text-xs text-slate-600 font-medium text-center leading-[1.15]">Cảnh báo<br/>Hệ thống</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
