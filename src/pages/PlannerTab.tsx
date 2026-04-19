import React, { useState, useEffect, useMemo } from 'react';
import { format, addDays, subDays, parseISO } from 'date-fns';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { Map as MapIcon, List, Calendar, MapPin, CheckCircle, CalendarClock, Loader2, X, Crosshair, ArrowRight, Trash2, Edit2, Navigation, User as UserIcon, Phone, ClipboardCheck, Save } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Tooltip as LeafletTooltip } from 'react-leaflet';
import { db } from '../firebase';
import { Station, DailyPlan, Report } from '../types';
import { User } from 'firebase/auth';
import { GoogleGenAI } from "@google/genai";
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { BRAND_COLORS, getStationIcon, formatStationName } from '../lib/constants';
import { cn } from '../lib/utils';
import { MapUpdater } from '../components/MapComponents';

export function PlannerTab({ stations, dailyPlans, user, reports, onOpenCreateReport }: { stations: Station[], dailyPlans: DailyPlan[], user: User, reports: Report[], onOpenCreateReport: (stationId: string) => void }) {
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
  const [showStationCode, setShowStationCode] = useState(false);

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="bg-blue-600 p-2 rounded-lg mt-1">
              <Navigation className="text-white w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-blue-900 mt-1">Lộ trình ngày {format(parseISO(selectedDate), 'dd/MM/yyyy')}</h3>
            </div>
          </div>
          <div className="flex items-center">
            <label className="flex items-center gap-1.5 cursor-pointer bg-white px-3 py-1.5 rounded-md border text-xs shadow-sm w-max">
              <input type="checkbox" checked={showStationCode} onChange={(e) => setShowStationCode(e.target.checked)} className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
              <span className="font-medium text-gray-700">Hiện mã trạm</span>
            </label>
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
                  offset={[0, -36]} 
                  opacity={0.9} 
                  permanent={true}
                  className="text-xs font-bold border-none shadow-sm rounded px-1.5 py-0.5 bg-blue-600 text-white"
                >
                  {showStationCode ? `${index + 1}. ${formatStationName(station.name)}` : `${index + 1}`}
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
                    <div className="grid grid-cols-2 gap-1.5 shrink-0 max-w-[80px]">
                      <a 
                        href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg flex items-center justify-center transition-colors"
                        title="Chỉ đường"
                      >
                        <Navigation className="w-4 h-4" />
                      </a>
                      
                      {station.managerPhone ? (
                        <a href={`tel:${station.managerPhone}`} className="p-1.5 text-green-600 bg-green-50 hover:bg-green-100 rounded-lg flex items-center justify-center transition-colors" title="Gọi điện">
                          <Phone className="w-4 h-4" />
                        </a>
                      ) : (
                        <div className="p-1.5"></div>
                      )}
                      
                      {isSaved ? (
                        <button 
                          onClick={() => onOpenCreateReport(station.id)}
                          className={cn("p-1.5 rounded-lg transition-colors flex items-center justify-center", isCompleted ? "text-blue-600 bg-blue-50 hover:bg-blue-100" : "text-amber-600 bg-amber-50 hover:bg-amber-100")}
                          title="Cập nhật công việc"
                        >
                          <ClipboardCheck className="w-4 h-4" />
                        </button>
                      ) : (
                        <div className="p-1.5"></div>
                      )}

                      <button 
                        onClick={() => setStationToRemove(station)}
                        className="p-1.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg flex items-center justify-center transition-colors"
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
            <Button onClick={() => setConfirmSavePlan(true)} className="flex-1 py-4 flex items-center justify-center gap-2">
              <Save className="w-5 h-5" />
              Lưu
            </Button>
            {currentPlan && (
              <Button onClick={() => setConfirmDeletePlan(true)} variant="secondary" className="py-4 bg-red-50 text-red-600 hover:bg-red-100 border-red-200 flex-1 flex items-center justify-center gap-2">
                <Trash2 className="w-5 h-5" />
                Xóa
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
