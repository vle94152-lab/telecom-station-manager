import React, { useState, useMemo, useEffect, useRef } from 'react';
import { collection, addDoc, doc, updateDoc, query, getDocs, deleteDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { db } from '../firebase';
import { Station, EquipmentDict, TaskGroup, Report, ReportDetail } from '../types';
import { User } from 'firebase/auth';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { cn } from '../lib/utils';
import { FileText, Save, CheckCircle, Image as ImageIcon, MessageSquare, X, ChevronDown, ChevronRight, Check, ClipboardList, Search, Settings2, Trash2, Home, Cloud, Plus, History, MapPin, Clock } from 'lucide-react';
import { handleFirestoreError } from '../lib/firebase-utils';

export function ReportsTab({
  stations,
  user,
  equipmentDict,
  taskGroups,
  technologies,
  initialStationId = '',
  reports
}: {
  stations: Station[];
  user: User;
  equipmentDict: EquipmentDict[];
  taskGroups: TaskGroup[];
  technologies?: string[];
  initialStationId?: string;
  reports: Report[];
}) {
  const [activeSubTab, setActiveSubTab] = useState<'create' | 'view'>('create');
  const [viewingReport, setViewingReport] = useState<Report | null>(null);
  const [reportSearch, setReportSearch] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const [stationId, setStationId] = useState(initialStationId);
  const [stationSearch, setStationSearch] = useState('');
  const [isStationDropdownOpen, setIsStationDropdownOpen] = useState(false);
  const stationDropdownRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    setStationId(initialStationId);
    if (initialStationId) setActiveSubTab('create');
  }, [initialStationId]);

  const generateAutoFillDetails = (space: 'Indoor' | 'Outdoor' | 'Full', eqDict: EquipmentDict[]): ReportDetail[] => {
    const newDetailsList: ReportDetail[] = [];
    
    // Helper finder emphasizing exact or closest matching
    const findEqId = (name: string) => {
      // Remove all spaces and convert to lowercase for the most robust matching 
      // Allows matching "Dây Nguồn" and "dâynguồn" and " Dây  nguồn" perfectly.
      const normalizedQuery = name.toLowerCase().replace(/\s+/g, '');
      
      const exact = eqDict.find(e => e.name.toLowerCase().replace(/\s+/g, '') === normalizedQuery);
      if (exact) return exact.id;

      const partial = eqDict.find(e => e.name.toLowerCase().replace(/\s+/g, '').includes(normalizedQuery));
      return partial ? partial.id : '';
    };

    const addIndoor = () => {
      // User requirements precisely: Baseband, Dây Nguồn, Dây Tiếp Đất 
      newDetailsList.push({ id: Math.random().toString(36).substr(2, 9), spaceId: 'Indoor', equipmentId: findEqId('baseband'), quantity: 1, status: 'Bình thường', note: '' });
      newDetailsList.push({ id: Math.random().toString(36).substr(2, 9), spaceId: 'Indoor', equipmentId: findEqId('dâynguồn'), quantity: 1, status: 'Bình thường', note: '' });
      newDetailsList.push({ id: Math.random().toString(36).substr(2, 9), spaceId: 'Indoor', equipmentId: findEqId('dâytiếpđất'), quantity: 1, status: 'Bình thường', note: '' });
    };

    const addOutdoor = () => {
      newDetailsList.push({ id: Math.random().toString(36).substr(2, 9), spaceId: 'Outdoor', equipmentId: findEqId('anten'), quantity: 3, status: 'Bình thường', note: '' });
      newDetailsList.push({ id: Math.random().toString(36).substr(2, 9), spaceId: 'Outdoor', equipmentId: findEqId('rru'), quantity: 3, status: 'Bình thường', note: '' });
      newDetailsList.push({ id: Math.random().toString(36).substr(2, 9), spaceId: 'Outdoor', equipmentId: findEqId('quang'), quantity: 3, status: 'Bình thường', note: '' });
      newDetailsList.push({ id: Math.random().toString(36).substr(2, 9), spaceId: 'Outdoor', equipmentId: findEqId('jumper'), quantity: 3, status: 'Bình thường', note: '' });
      newDetailsList.push({ id: Math.random().toString(36).substr(2, 9), spaceId: 'Outdoor', equipmentId: findEqId('dâyjet'), quantity: 3, status: 'Bình thường', note: '' });
      newDetailsList.push({ id: Math.random().toString(36).substr(2, 9), spaceId: 'Outdoor', equipmentId: findEqId('dâynguồn'), quantity: 3, status: 'Bình thường', note: '' });
    };

    if (space === 'Indoor' || space === 'Full') addIndoor();
    if (space === 'Outdoor' || space === 'Full') addOutdoor();

    return newDetailsList;
  };

  useEffect(() => {
    if (equipmentDict.length === 0) return;

    if (stationId) {
      const st = stations.find(s => s.id === stationId);
      if (st && stationSearch !== st.name) {
        setStationSearch(st.name);
      }
      
      // We only apply autofill if it's the very first time setting up the station or if no details exist
      if (detailsList.length === 0) {
        setDetailsList(generateAutoFillDetails(workSpace, equipmentDict));
      }
    } else {
      if (detailsList.length === 0) {
        setDetailsList(generateAutoFillDetails(workSpace, equipmentDict));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId, equipmentDict.length]);

  const [taskGroupId, setTaskGroupId] = useState('');
  const [workSpace, setWorkSpace] = useState<'Indoor' | 'Outdoor' | 'Full'>('Indoor');
  const [detailsList, setDetailsList] = useState<ReportDetail[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDeleteDetailDialog, setConfirmDeleteDetailDialog] = useState<{isOpen: boolean, detailId: string | null}>({isOpen: false, detailId: null});
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
    setConfirmDeleteDetailDialog({ isOpen: true, detailId: id });
  };

  const confirmRemoveDetail = () => {
    if (confirmDeleteDetailDialog.detailId) {
      setDetailsList(detailsList.filter(d => d.id !== confirmDeleteDetailDialog.detailId));
    }
    setConfirmDeleteDetailDialog({ isOpen: false, detailId: null });
  };

  const handleChangeDetail = (id: string, field: keyof ReportDetail, value: any) => {
    setDetailsList(detailsList.map(d => {
      if (d.id === id) {
        if (field === 'spaceId') {
          // Reset equipment if space changes to prevent invalid equipment
          return { ...d, [field]: value, equipmentId: '', unit: undefined };
        }
        if (field === 'equipmentId') {
          const matchedEq = equipmentDict.find(eq => eq.id === value || eq.name === value);
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
        content: '',
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
      
      // Auto-update station status to "checked" when a report is created
      if (selectedStation && selectedStation.status !== 'checked') {
        await updateDoc(doc(db, 'stations', finalStationId), {
          status: 'checked'
        });
      }

      alert("Lưu báo cáo thành công!");
      
      // Clear form
      setStationId(''); setDetailsList([]); setWorkSpace('Full'); setNoteDialog({isOpen: false, detailId: null});
      setActiveSubTab('view');
    } catch (err: any) {
      console.error(err);
      alert(`Có lỗi xảy ra khi lưu báo cáo: ${err?.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
      className="space-y-4 w-full relative pb-20"
    >
      <div className="flex flex-col sm:flex-row gap-4 mb-2">
        <div className="flex bg-gray-100 p-1 rounded-xl w-full sm:w-80 border border-gray-200">
          <button 
            onClick={() => setActiveSubTab('create')} 
            className={cn("flex-1 py-1.5 sm:py-2 text-sm font-bold rounded-lg transition-all", activeSubTab === 'create' ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700")}
          >
            Tạo Báo Cáo
          </button>
          <button 
            onClick={() => setActiveSubTab('view')} 
            className={cn("flex-1 py-1.5 sm:py-2 text-sm font-bold rounded-lg transition-all", activeSubTab === 'view' ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700")}
          >
            Xem Báo Cáo
          </button>
        </div>
      </div>

      {activeSubTab === 'create' && (
        <Card className="p-4 sm:p-6 flex-col flex shadow-sm border border-gray-200">
          <div className="space-y-6">
            {/* Master Form */}
            <div className="space-y-4">
              <h3 className="font-semibold text-blue-700 flex items-center gap-2 border-b pb-2">
                <ClipboardList className="w-5 h-5" /> 1. Thông tin chung (Master)
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div ref={stationDropdownRef} className="relative z-50">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Trạm <span className="text-red-500">*</span>
                </label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Loại công việc <span className="text-red-500">*</span>
                </label>
                <select className="w-full border p-2 rounded-lg" value={taskGroupId} onChange={(e) => setTaskGroupId(e.target.value)}>
                  <option value="">-- Chọn Loại CV --</option>
                  {taskGroups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                </select>
              </div>
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
                      // Set auto fill when space dropdown changes
                      setDetailsList(generateAutoFillDetails(newSpace, equipmentDict));
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
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {(() => {
                const renderDetailRow = (detail: ReportDetail) => {
                  const availableEquipments = getEquipmentsForSpace(detail.spaceId || workSpace);
                  const hasNote = detail.note && detail.note.trim().length > 0;
                  return (
                    <div key={detail.id} className="flex gap-2 items-center bg-white p-2 border border-gray-200 rounded-lg shadow-sm w-full">
                      <div className="w-[180px] md:w-[220px] shrink-0 sticky left-0 z-10 bg-white/95 backdrop-blur-sm -ml-2 pl-2 shadow-[2px_0_10px_-4px_rgba(0,0,0,0.15)] flex items-center">
                        <select className="w-full border-gray-200 bg-gray-50 focus:bg-white p-1.5 rounded-md text-sm border truncate" value={detail.equipmentId} onChange={e => handleChangeDetail(detail.id, 'equipmentId', e.target.value)}>
                          <option value="">- Chọn Thiết bị -</option>
                          {equipmentDict.filter(eq => eq.validSpaces.includes(detail.spaceId || workSpace)).map(eq => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
                        </select>
                      </div>
                      <div className="flex-1 shrink-0 min-w-[100px]">
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
                    const title = spaceCode === 'Indoor' ? <><Home className="w-4 h-4"/> INDOOR : {items.length}</> : spaceCode === 'Outdoor' ? <><Cloud className="w-4 h-4"/> OUTDOOR : {items.length}</> : null;
                    const titleClass = spaceCode === 'Indoor' ? "text-indigo-700" : "text-blue-700";
                    
                    return (
                        <div key={spaceCode} className="bg-gray-50/50 p-2 sm:p-3 rounded-xl border border-gray-200 border-dashed space-y-3 overflow-x-auto relative">
                             {title && <h4 className={`font-bold flex items-center gap-1.5 text-sm px-1 ${titleClass}`}>{title}</h4>}
                             {items.length === 0 ? (
                                 <div className="text-center py-4 text-gray-400 text-sm border border-dashed border-gray-300 rounded-lg bg-white/50">Chưa có thiết bị.</div>
                             ) : (
                                 <div className="space-y-2 min-w-[600px] pb-1">
                                     <div className="flex gap-2 items-center px-2 py-1 text-xs font-semibold text-gray-500">
                                       <div className="w-[180px] md:w-[220px] shrink-0 sticky left-0 z-10 bg-gray-50/90 backdrop-blur-sm -ml-2 pl-2 shadow-[2px_0_8px_-4px_rgba(0,0,0,0.05)]">Thiết bị</div>
                                       <div className="flex-1 text-center min-w-[100px]">Tình trạng</div>
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

        <div className="p-4 sm:p-6 pb-8">
          <Button 
            className="w-full py-4 text-base sm:text-lg rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98]" 
            onClick={handleSubmit} 
            disabled={isSubmitting || !stationId || detailsList.length === 0}
          >
            <Save className="w-5 h-5" />
            {isSubmitting ? 'Đang lưu báo cáo...' : 'Lưu'}
          </Button>
        </div>
        </Card>
      )}

      {activeSubTab === 'view' && (
        <Card className="flex-col flex shadow-sm border border-gray-200 min-h-[400px]">
          <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
              <History className="w-5 h-5 text-blue-600" /> Lịch sử Báo Cáo
            </h3>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input 
                className="pl-9 h-9 text-sm w-full" 
                placeholder="Tìm trạm, nội dung..." 
                value={reportSearch}
                onChange={(e: any) => setReportSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="p-2 sm:p-4 bg-gray-50/50 flex-1">
            <div className="grid grid-cols-1 gap-3">
              {(() => {
                const searchLower = reportSearch.toLowerCase();
                const filteredReports = reports.filter(r => {
                  const station = stations.find(s => s.id === r.stationId);
                  const stationName = station ? station.name : r.stationName;
                  return (stationName && stationName.toLowerCase().includes(searchLower)) ||
                         (r.content && r.content.toLowerCase().includes(searchLower));
                }).sort((a, b) => (b.createdAt || b.date).localeCompare(a.createdAt || a.date));

                if (filteredReports.length === 0) {
                  return (
                    <div className="text-center py-12 text-gray-400 italic">
                      Không tìm thấy báo cáo nào.
                    </div>
                  );
                }

                return filteredReports.map(report => {
                  const station = stations.find(s => s.id === report.stationId);
                  const displayStationName = station ? station.name : report.stationName;
                  return (
                    <div 
                      key={report.id} 
                      className="bg-white border border-gray-200 hover:border-blue-300 rounded-xl p-3 sm:p-4 shadow-sm cursor-pointer transition-all hover:shadow-md"
                      onClick={() => setViewingReport(report)}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
                          <h4 className="font-bold text-gray-900 text-sm sm:text-base">{displayStationName}</h4>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-gray-500 whitespace-nowrap">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {format(parseISO(report.createdAt || report.date), 'dd/MM/yyyy HH:mm:ss')}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2 mb-2 break-words">{report.content || 'Không có ghi chú'}</p>
                      <div className="flex items-center justify-between border-t border-gray-100 pt-2">
                        <div className="text-xs font-medium text-blue-600">
                          {report.equipmentDetails && report.equipmentDetails.length > 0 
                            ? `+ ${report.equipmentDetails.length} dòng thiết bị`
                            : 'Không có chi tiết thiết bị'}
                        </div>
                        <span className={cn(
                          "text-[10px] uppercase font-bold px-2 py-1 rounded-full",
                          report.status === 'completed' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                        )}>
                          {report.status === 'completed' ? 'Hoàn thành' : 'Đang xử lý'}
                        </span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </Card>
      )}

      {/* Viewing Report Modal inside ReportsTab */}
      <AnimatePresence>
        {viewingReport && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[110] flex justify-center items-end sm:items-center p-0 sm:p-4"
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
                        message: `Bạn có chắc chắn muốn xóa báo cáo này không? Hành động này không thể hoàn tác.`,
                        onConfirm: async () => {
                          try {
                            setConfirmDialog(p => ({ ...p, isOpen: false }));
                            await deleteDoc(doc(db, 'reports', viewingReport.id));
                            setViewingReport(null);
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

              <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
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
                                      <td className="px-3 py-2 font-medium text-gray-800">
                                        {equipmentDict.find(eq => eq.id === detail.equipmentId)?.name || detail.equipmentId || '-'}
                                      </td>
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

      {/* Detail Delete Confirmation Modal */}
      <AnimatePresence>
        {confirmDeleteDetailDialog.isOpen && (
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
                <Button variant="secondary" size="sm" onClick={() => setConfirmDeleteDetailDialog({ isOpen: false, detailId: null })}>Hủy</Button>
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
    </motion.div>
  );
}

