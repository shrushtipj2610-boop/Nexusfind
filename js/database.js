import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, updateDoc, where, runTransaction, getDocs, setDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { auth, db, isConfigured } from './firebase.js';
import { getUserDetails } from './auth.js';
import { uploadItemImage } from './storage.js';
import { calculateMatchScore } from './matching.js';

function matchKey(lostId, foundId) { return `${lostId}_${foundId}`; }

async function createPotentialMatches(reportId, report) {
  try {
    console.info('[MATCHING] Started:', { reportId, type: report.type });
    const opposite = report.type === 'lost' ? 'found' : 'lost';
    const candidates = await getDocs(query(collection(db, 'items'), where('type', '==', opposite)));
    console.info('[MATCHING] Opposite-type candidates:', candidates.size, { type: opposite });
    for (const candidateSnapshot of candidates.docs) {
      const other = { id: candidateSnapshot.id, ...candidateSnapshot.data() };
      if (other.type !== opposite || other.id === reportId || !other.userId
        || ['returned', 'resolved', 'closed', 'rejected', 'archived'].includes(String(other.status || '').toLowerCase())) continue;
      const lost = report.type === 'lost' ? { ...report, id: reportId } : other;
      const found = report.type === 'found' ? { ...report, id: reportId } : other;
      const { score, matchedFields, matchLevel } = calculateMatchScore(lost, found);
      console.info('[MATCHING] Candidate scored:', { candidateId: other.id, score, matchedFields });
      if (score < 60) continue;
      const id = matchKey(lost.id, found.id);
      const matchRef = doc(db, 'matches', id);
      console.info('[MATCHING] Creating or refreshing match:', { matchId: id, lostReportId: lost.id, foundReportId: found.id, score });
      await runTransaction(db, async (transaction) => {
        const existing = await transaction.get(matchRef);
        if (existing.exists()) {
          if (existing.data().status === 'potential' && score > (existing.data().score || 0)) transaction.update(matchRef, { score, matchedFields, updatedAt: serverTimestamp() });
          return;
        }
        transaction.set(matchRef, { lostReportId: lost.id, foundReportId: found.id, lostUserId: lost.userId, foundUserId: found.userId, score, matchLevel, matchedFields, status: 'potential', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        const notice = (recipientId, ownReport, counterpart) => {
          const notificationRef = doc(collection(db, 'notifications'));
          transaction.set(notificationRef, { type: 'potential_match', title: matchLevel === 'strong' ? 'Strong match found' : 'Possible match found', message: `${matchLevel === 'strong' ? 'Strong' : 'Possible'} match found for your ${ownReport.type} item: ${ownReport.itemName}. Score: ${score}%.`, userId: recipientId, reportId: reportId, matchId: id, itemName: ownReport.itemName, read: false, createdAt: serverTimestamp() });
        };
        notice(lost.userId, lost, found);
        if (found.userId !== lost.userId) notice(found.userId, found, lost);
      });
      console.info('[MATCHING] Match saved:', id);
    }
  } catch (error) {
    console.error('[MATCHING] Match search or write failed; report remains saved:', error);
    return false;
  }
  return true;
}

export async function createItemReport(report = {}) {
  if (!isConfigured || !db) {
    throw new Error('Firebase is not configured yet. Add your Firebase web configuration in js/firebase.js.');
  }
  const requiredText = [report.itemName, report.category, report.description, report.location];
  if (!['lost', 'found'].includes(report.type) || requiredText.some((value) => typeof value !== 'string' || !value.trim())) {
    throw new Error('Please complete all required report details.');
  }

  const user = getUserDetails();
  if (!user?.uid) {
    throw new Error('Please sign in before submitting a report.');
  }

  let imageUrl = report.imageUrl || null;
  if (report.imageFile) {
    try {
      console.info('[IMAGE] Upload started');
      imageUrl = await uploadItemImage(report.imageFile);
      if (!imageUrl) throw new Error('Firebase Storage returned no image URL.');
      console.info('[IMAGE] Upload completed');
    } catch (error) {
      console.error('[IMAGE] Upload failed; report was not saved:', error);
      throw new Error('Image upload failed. Please try again.', { cause: error });
    }
  }

  const { imageFile, identifyingDetails, ...reportFields } = report;
  const itemDocument = {
    ...reportFields,
    itemName: report.itemName.trim(),
    description: report.description.trim(),
    imageUrl,
    status: report.status || report.type,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    userId: user.uid
  };
  console.info('[REPORT] Saving image URL:', Boolean(imageUrl));
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
    userId: user.uid,
    read: false
  };
  // The selected image must finish uploading before the report is written so
  // a report cannot silently lose its chosen image. Notifications and matching
  // remain independent best-effort tasks after the confirmed report write.
  console.info('[REPORT] Creating Firebase report');
  const reportBatch = writeBatch(db);
  reportBatch.set(reference, itemDocument);
  if (typeof identifyingDetails === 'string' && identifyingDetails.trim()) {
    reportBatch.set(doc(db, 'privateItemDetails', reference.id), {
      userId: user.uid,
      identifyingDetails: identifyingDetails.trim(),
      createdAt: serverTimestamp()
    });
  }
  await reportBatch.commit();
  console.info('[REPORT] Firebase report created:', reference.id);

  void setDoc(notificationReference, notificationDocument)
    .catch((error) => console.error('[REPORT] Report notification could not be created:', error));
  void createPotentialMatches(reference.id, itemDocument);
  return { id: reference.id, imageUrl: itemDocument.imageUrl };
}

export function watchMatchesForUser(callback, onError) {
  if (!isConfigured || !db || !auth) { onError?.(new Error('Firebase is not configured yet.')); return () => {}; }
  let stops = [];
  const stopAuth = onAuthStateChanged(auth, (user) => {
    stops.forEach((stop) => stop()); stops = [];
    if (!user) { callback([]); return; }
    const collected = new Map();
    const publish = () => callback([...collected.values()].sort((a, b) =>
      (Number(b.score) || 0) - (Number(a.score) || 0)
      || (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
    for (const field of ['lostUserId', 'foundUserId']) {
      stops.push(onSnapshot(query(collection(db, 'matches'), where(field, '==', user.uid)), (snapshot) => {
        snapshot.docChanges().forEach((change) => { if (change.type === 'removed') collected.delete(change.doc.id); else collected.set(change.doc.id, { id: change.doc.id, ...change.doc.data() }); });
        publish();
      }, onError));
    }
  }, onError);
  return () => { stops.forEach((stop) => stop()); stopAuth(); };
}

export async function getMatchDetails(id) {
  const snapshot = await getDoc(doc(db, 'matches', id));
  if (!snapshot.exists()) throw new Error('This potential match is no longer available.');
  const match = { id: snapshot.id, ...snapshot.data() };
  const [lostReport, foundReport] = await Promise.all([getItemReport(match.lostReportId).catch(() => null), getItemReport(match.foundReportId).catch(() => null)]);
  if (!lostReport || !foundReport) throw new Error('One of the reports in this match is no longer available.');
  return { ...match, lostReport, foundReport };
}

export async function updateMatchStatus(id, action) {
  if (!auth?.currentUser) throw new Error('Please sign in to update this match.');
  const reference = doc(db, 'matches', id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error('This match is no longer available.');
    const match = snapshot.data(), uid = auth.currentUser.uid;
    if (![match.lostUserId, match.foundUserId].includes(uid)) throw new Error('You cannot update this match.');
    const next = action === 'claim' && match.status === 'potential' ? 'claim_requested'
      : action === 'confirm' && match.status === 'claim_requested' && uid !== match.claimedBy ? 'confirmed'
      : action === 'reject' && ['potential', 'claim_requested'].includes(match.status) ? 'rejected'
      : action === 'resolve' && match.status === 'confirmed' ? 'resolved' : null;
    if (!next) throw new Error('This action is not available for the current match status.');
    transaction.update(reference, { status: next, ...(action === 'claim' ? { claimedBy: uid } : {}), updatedAt: serverTimestamp() });
    if (action !== 'reject') {
      const other = uid === match.lostUserId ? match.foundUserId : match.lostUserId;
      const notificationRef = doc(collection(db, 'notifications'));
      transaction.set(notificationRef, { type: 'match_update', title: next === 'claim_requested' ? 'Claim request received' : `Match ${next.replace('_', ' ')}`, message: next === 'claim_requested' ? 'A user believes this item may belong to them. Review the potential match.' : `The potential match status is now ${next.replace('_', ' ')}.`, userId: other, matchId: id, reportId: uid === match.lostUserId ? match.lostReportId : match.foundReportId, read: false, createdAt: serverTimestamp() });
    }
    if (next === 'resolved') {
      const ownReportId = uid === match.lostUserId ? match.lostReportId : match.foundReportId;
      transaction.update(doc(db, 'items', ownReportId), { status: 'resolved', updatedAt: serverTimestamp() });
    }
  });
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
  if (!isConfigured || !db || !auth) {
    onError?.(new Error('Firebase is not configured yet.'));
    return () => {};
  }
  let stopNotificationSnapshot = () => {};
  const stopAuthentication = onAuthStateChanged(auth, (user) => {
    stopNotificationSnapshot();
    if (!user) {
      callback([]);
      return;
    }
    const notificationsQuery = query(collection(db, 'notifications'), where('userId', '==', user.uid));
    stopNotificationSnapshot = onSnapshot(notificationsQuery, (snapshot) => {
      const notifications = snapshot.docs.map((notification) => ({ id: notification.id, ...notification.data() }));
      notifications.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      callback(notifications);
    }, onError);
  }, onError);
  return () => {
    stopNotificationSnapshot();
    stopAuthentication();
  };
}

export async function markNotificationRead(id) {
  if (!isConfigured || !db || !id) throw new Error('Notification is unavailable.');
  await updateDoc(doc(db, 'notifications', id), { read: true });
}
