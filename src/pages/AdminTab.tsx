import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, Settings2, Trash2 } from 'lucide-react';
import { collection, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { EquipmentDict, TaskGroup } from '../types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { cn } from '../lib/utils';

export function AdminTab({ equipmentDict, taskGroups }: { equipmentDict: EquipmentDict[], taskGroups: TaskGroup[] }) {
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
              <div className="flex flex-row justify-between items-center bg-blue-50/50 p-3 rounded-lg border border-blue-100 gap-3">
                <div className="text-sm font-medium text-gray-700">Danh mục thiết bị</div>
                <Button className="whitespace-nowrap shrink-0 px-3 py-1.5 text-sm" onClick={() => setIsAddingEq(!isAddingEq)}>
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
                        <select className="w-full border p-1.5 rounded-md text-sm border-gray-200 h-10" value={newEqUnit} onChange={(e: any) => setNewEqUnit(e.target.value)}>
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
               <div className="flex flex-row justify-between items-center bg-blue-50/50 p-3 rounded-lg border border-blue-100 gap-3">
                <div className="text-sm font-medium text-gray-700">Nhóm công việc</div>
                <Button className="whitespace-nowrap shrink-0 px-3 py-1.5 text-sm" onClick={() => setIsAddingTaskGroup(!isAddingTaskGroup)}>
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
