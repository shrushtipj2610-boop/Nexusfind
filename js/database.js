import { collection, doc, getDoc, onSnapshot, serverTimestamp, updateDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db, isConfigured } from './firebase.js';
import { getUserDetails } from './auth.js';

export async function createItemReport(report) {
  if (!isConfigured || !db) {
    throw new Error('Firebase is not configured yet. Add your Firebase web configuration in js/firebase.js.');
  }
  if (!report.type || !report.itemName || !report.category || !report.description || !report.location) {
    throw new Error('Please complete all required report details.');
  }

  const user = getUserDetails();
  if (!user?.uid) {
    throw new Error('Please sign in before submitting a report.');
  }

  const imageUrl = null;
  const itemDocument = {
    ...report,
    itemName: report.itemName.trim(),
    description: report.description.trim(),
    imageUrl,
    status: report.status || report.type,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    userId: user.uid,
    reporterEmail: user?.email || report.email || null,
    reporterName: user?.name || report.name || null
  };
  const reference = doc(collection(db, 'items'));
  const notificationReference = doc(db, 'notifications', reference.id);
  const reportType = report.type === 'found' ? 'found' : 'lost';
  const notificationDocument = {
    type: `${reportType}_report`,
    title: reportType === 'found' ? 'New Found Item Reported' : 'New Lost Item Reported',
    message: `${itemDocument.itemName} was reported as ${reportType} near ${report.location.trim()}.`,
    reportId: reference.id,
    itemName: itemDocument.itemName,
    location: report.location.trim(),
    createdAt: serverTimestamp(),
    read: false
  };
  // A single commit ensures a report cannot create duplicate notifications and
  // no notification can exist without its report.
  const batch = writeBatch(db);
  batch.set(reference, itemDocument);
  batch.set(notificationReference, notificationDocument);
  await batch.commit();
  return { id: reference.id, imageUrl };
}

// All reports intentionally share the existing `items` collection. This keeps
// Browse Items consistent for both lost and found reports and avoids a second
// data structure that could get out of sync.
export function watchItemReports(callback, onError) {
  if (!isConfigured || !db) {
    onError?.(new Error('Firebase is not configured yet.'));
    return () => {};
  }
  return onSnapshot(collection(db, 'items'), (snapshot) => {
    const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    items.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
    callback(items);
  }, onError);
}

export async function getItemReport(id) {
  if (!isConfigured || !db || !id) throw new Error('Item details are unavailable.');
  const snapshot = await getDoc(doc(db, 'items', id));
  if (!snapshot.exists()) throw new Error('This item report is no longer available.');
  return { id: snapshot.id, ...snapshot.data() };
}

export function watchNotifications(callback, onError) {
  if (!isConfigured || !db) {
    onError?.(new Error('Firebase is not configured yet.'));
    return () => {};
  }
  return onSnapshot(collection(db, 'notifications'), (snapshot) => {
    const notifications = snapshot.docs.map((notification) => ({ id: notification.id, ...notification.data() }));
    notifications.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    callback(notifications);
  }, onError);
}

export async function markNotificationRead(id) {
  if (!isConfigured || !db || !id) throw new Error('Notification is unavailable.');
  await updateDoc(doc(db, 'notifications', id), { read: true });
}
