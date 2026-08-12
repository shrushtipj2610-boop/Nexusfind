import { addDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db, isConfigured } from './firebase.js';
import { getUserDetails } from './auth.js';
import { uploadItemImage } from './storage.js';

export async function createItemReport(report, imageFile = null) {
  if (!isConfigured || !db) {
    throw new Error('Firebase is not configured yet. Add your Firebase web configuration in js/firebase.js.');
  }
  if (!report.type || !report.itemName || !report.category || !report.description) {
    throw new Error('Please complete all required report details.');
  }

  const imageUrl = await uploadItemImage(imageFile);
  const user = getUserDetails();
  const document = {
    ...report,
    itemName: report.itemName.trim(),
    description: report.description.trim(),
    imageUrl,
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    userId: user?.uid || null,
    reporterEmail: user?.email || report.email || null,
    reporterName: user?.name || report.name || null
  };
  const reference = await addDoc(collection(db, 'items'), document);
  return { id: reference.id, imageUrl };
}
