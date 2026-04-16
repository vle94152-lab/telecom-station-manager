import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/src/firebase';
import { DailyPlan, Report, Station } from '@/src/types';

export function subscribeStations(onData: (items: Station[]) => void, onError?: (error: unknown) => void) {
  return onSnapshot(collection(db, 'stations'), (snapshot) => {
    onData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Station)));
  }, onError);
}

export function subscribeReports(userId: string, onData: (items: Report[]) => void, onError?: (error: unknown) => void) {
  return onSnapshot(
    query(collection(db, 'reports'), where('userId', '==', userId), orderBy('date', 'desc')),
    (snapshot) => onData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Report))),
    onError,
  );
}

export function subscribeDailyPlans(userId: string, onData: (items: DailyPlan[]) => void, onError?: (error: unknown) => void) {
  return onSnapshot(
    query(collection(db, 'dailyPlans'), where('userId', '==', userId)),
    (snapshot) => onData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyPlan))),
    onError,
  );
}
