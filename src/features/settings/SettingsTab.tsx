import React from 'react';
import { motion } from 'motion/react';
import { LogOut, User as UserIcon } from 'lucide-react';
import { User } from 'firebase/auth';
import { Button, Card } from '@/src/components/ui';

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


export default SettingsTab;
