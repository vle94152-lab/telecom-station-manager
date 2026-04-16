import React, { useEffect, useState } from 'react';
import { addDoc, arrayUnion, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { AnimatePresence, motion } from 'motion/react';
import { Calendar, ClipboardCheck, Navigation, Phone, User as UserIcon, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { MapContainer, Marker, Popup, Polyline, TileLayer, Tooltip as LeafletTooltip } from 'react-leaflet';
import { User } from 'firebase/auth';
import { db } from '@/src/firebase';
import { Report, Station, DailyPlan } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { Button, Card } from '@/src/components/ui';
import { MapUpdater, formatStationName, getStationIcon } from '@/src/features/map/mapUtils';
import { fetchRouteGeometry as fetchRouteGeometryService } from '@/src/services/routingService';
import { optimizeRouteWithAI } from '@/src/services/aiService';

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
      let coordinates = routeStations.map(s => `${s.longitude},${s.latitude}`).join(';');
      
      if (startCoords) {
        coordinates = `${startCoords[1]},${startCoords[0]};` + coordinates;
      }

      if (coordinates.split(';').length < 2) {
        setRouteGeometry(null);
        return;
      }

      try {
        const latLngs = await fetchRouteGeometryService(coordinates);
        setRouteGeometry(latLngs.length ? latLngs : null);
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
    
    try {
      if (existing) {
        const historyEntry = {
          userId: user.uid,
          userName: user.email || 'Unknown',
          timestamp: now,
          content: existing.content || ''
        };
        await updateDoc(doc(db, 'reports', existing.id), {
          content: reportContent,
          updatedAt: now,
          history: arrayUnion(historyEntry)
        });
      } else {
        await addDoc(collection(db, 'reports'), {
          stationId: reportModalStation.id,
          stationName: reportModalStation.name,
          userId: user.uid,
          date: selectedDate,
          content: reportContent,
          status: 'completed',
          createdAt: now,
          updatedAt: now,
          history: []
        });
        await updateDoc(doc(db, 'stations', reportModalStation.id), { status: 'checked' });
      }
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
      const selectedStations = stations.filter(s => selectedStationIds.includes(s.id));
      setOptimizeProgress('Đang phân tích tọa độ và tính toán khoảng cách...');
      const result = await optimizeRouteWithAI(selectedStations, startLocation);
      setOptimizeProgress('Đang hoàn thiện lộ trình...');
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


export default PlannerTab;
