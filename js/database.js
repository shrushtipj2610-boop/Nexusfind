import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, updateDoc, where, runTransaction, getDocs, setDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { auth, db, isConfigured } from './firebase.js';
import { getUserDetails } from './auth.js';
import { uploadItemImage } from './storage.js';

const normalize = (value = '') => String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const synonyms = { mobile: 'phone', cellphone: 'phone', handset: 'phone', sneakers: 'shoes', spectacles: 'glasses', earphones: 'earbuds' };
const tokens = (value = '') => new Set(normalize(value).split(' ').filter((word) => word.length > 1).map((word) => synonyms[word] || word));
function similarity(a, b) {
  const left = tokens(a), right = tokens(b);
  if (!left.size || !right.size) return 0;
  let common = 0;
  left.forEach((word) => { if (right.has(word)) common += 1; });
  return common / Math.max(left.size, right.size);
}
function scoreReports(a, b) {
  const fields = [];
  let score = 0;
  const add = (name, points, threshold) => { if (points > 0) score += points; if (points >= threshold) fields.push(name); };
  const category = normalize(a.category) && normalize(a.category) === normalize(b.category);
  add('category', category ? 20 : 0, 15);
  const nameSimilarity = similarity(a.itemName, b.itemName);
  add('itemName', Math.round(nameSimilarity * 25), 13);
  const descriptionSimilarity = similarity(a.description, b.description);
  add('description', Math.round(descriptionSimilarity * 20), 10);
  const locationSimilarity = similarity(a.location, b.location);
  add('location', Math.round(locationSimilarity * 20), 10);
  const dateA = a.dateLost || a.dateFound || '', dateB = b.dateLost || b.dateFound || '';
  let datePoints = 0;
  if (dateA && dateB) {
    const delta = Math.abs(Date.parse(`${dateA}T00:00:00Z`) - Date.parse(`${dateB}T00:00:00Z`)) / 86400000;
    datePoints = delta === 0 ? 10 : delta <= 1 ? 8 : delta <= 3 ? 5 : delta <= 7 ? 2 : 0;
  }
  add('date', datePoints, 5);
  const identifying = similarity([a.identifyingDetails, a.landmark, a.approximateTime].filter(Boolean).join(' '), [b.identifyingDetails, b.landmark, b.approximateTime].filter(Boolean).join(' '));
  add('identifyingDetails', Math.round(identifying * 5), 2);
  return { score: Math.min(100, score), matchedFields: [...new Set(fields)] };
}

function matchKey(lostId, foundId) { return `${lostId}_${foundId}`; }

async function createPotentialMatches(reportId, report) {
  try {
    const opposite = report.type === 'lost' ? 'found' : 'lost';
    const candidates = await getDocs(query(collection(db, 'items'), where('type', '==', opposite)));
    for (const candidateSnapshot of candidates.docs) {
      const other = { id: candidateSnapshot.id, ...candidateSnapshot.data() };
      if (!other.userId || other.userId === report.userId || ['resolved', 'returned'].includes(other.status)) continue;
      const lost = report.type === 'lost' ? { ...report, id: reportId } : other;
      const found = report.type === 'found' ? { ...report, id: reportId } : other;
      const { score, matchedFields } = scoreReports(lost, found);
      if (score < 60) continue;
      const id = matchKey(lost.id, found.id);
      const matchRef = doc(db, 'matches', id);
      await runTransaction(db, async (transaction) => {
        const existing = await transaction.get(matchRef);
        if (existing.exists()) {
          if (existing.data().status === 'potential' && score > (existing.data().score || 0)) transaction.update(matchRef, { score, matchedFields, updatedAt: serverTimestamp() });
          return;
        }
        transaction.set(matchRef, { lostReportId: lost.id, foundReportId: found.id, lostUserId: lost.userId, foundUserId: found.userId, score, matchedFields, status: 'potential', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        const notice = (recipientId, ownReport, counterpart) => {
          const notificationRef = doc(collection(db, 'notifications'));
          transaction.set(notificationRef, { type: 'potential_match', title: 'Potential match found', message: `Your ${ownReport.type} item “${ownReport.itemName}” may match “${counterpart.itemName || 'a reported item'}”. Match confidence: ${score}%.`, userId: recipientId, reportId: reportId, matchId: id, itemName: ownReport.itemName, read: false, createdAt: serverTimestamp() });
        };
        notice(lost.userId, lost, found);
        notice(found.userId, found, lost);
      });
    }
  } catch (error) {
    console.error('Potential match creation failed; report was saved:', error);
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

  const { imageFile, ...reportFields } = report;
  const itemDocument = {
    ...reportFields,
    itemName: report.itemName.trim(),
    description: report.description.trim(),
    imageUrl: report.imageUrl || null,
    status: report.status || report.type,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    userId: user.uid
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
    userId: user.uid,
    read: false
  };
  // The report is the required operation. Optional image, notification, and
  // matching work starts only after Firestore confirms this write and cannot
  // keep the user on the submission screen.
  console.info('[REPORT] Creating Firebase report');
  await setDoc(reference, itemDocument);
  console.info('[REPORT] Firebase report created:', reference.id);

  if (imageFile) {
    void uploadItemImage(imageFile).then((imageUrl) => updateDoc(reference, { imageUrl, updatedAt: serverTimestamp() }))
      .catch((error) => console.error('[REPORT] Optional image upload failed:', error));
  }
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
    const publish = () => callback([...collected.values()].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
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
