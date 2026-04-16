import React, { useMemo, useState } from 'react';
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { AnimatePresence, motion } from 'motion/react';
import { Award, Bell, PlusCircle, Search, Upload, User as UserIcon, X } from 'lucide-react';
import { format } from 'date-fns';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { updateProfile, User } from 'firebase/auth';
import { db } from '@/src/firebase';
import { DailyPlan, Report, Station, ValidationWarning } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { Button } from '@/src/components/ui';
import { MapUpdater, getStationIcon } from '@/src/features/map/mapUtils';

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



export default DashboardTab;
