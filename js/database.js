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
        || ['returned', 'resolved', 'recovered', 'closed', 'rejected', 'archived'].includes(String(other.status || '').toLowerCase())) continue;
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
    callback([], true);
    if (!user) { callback([], false); return; }
    const collected = new Map();
    const initialized = new Set();
    const publish = () => callback([...collected.values()].sort((a, b) =>
      (Number(b.score) || 0) - (Number(a.score) || 0)
      || (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)), initialized.size < 2);
    for (const field of ['lostUserId', 'foundUserId']) {
      stops.push(onSnapshot(query(collection(db, 'matches'), where(field, '==', user.uid)), (snapshot) => {
        if (auth.currentUser?.uid !== user.uid) return;
        snapshot.docChanges().forEach((change) => { if (change.type === 'removed') collected.delete(change.doc.id); else collected.set(change.doc.id, { id: change.doc.id, ...change.doc.data() }); });
        initialized.add(field);
        publish();
      }, (error) => { initialized.add(field); publish(); onError?.(error); }));
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
    const next = action === 'claim' && match.status === 'potential' && uid === match.lostUserId ? 'claim_requested'
      : action === 'confirm' && match.status === 'claim_requested' && uid !== match.claimedBy ? 'confirmed'
      : action === 'reject' && ['potential', 'claim_requested'].includes(match.status) ? 'rejected'
      : action === 'resolve' && match.status === 'confirmed' ? 'resolved' : null;
    if (!next) throw new Error('This action is not available for the current match status.');
    transaction.update(reference, { status: next, ...(action === 'claim' ? { claimedBy: uid, claimRequestedAt: serverTimestamp() } : {}), updatedAt: serverTimestamp() });
    if (action !== 'reject') {
      const other = uid === match.lostUserId ? match.foundUserId : match.lostUserId;
      const notificationRef = doc(collection(db, 'notifications'));
      transaction.set(notificationRef, { type: 'match_update', title: next === 'claim_requested' ? 'Match confirmation requested' : `Match ${next.replace('_', ' ')}`, message: next === 'claim_requested' ? 'A reporter believes the matched item may belong to them and is waiting for your response.' : `The potential match status is now ${next.replace('_', ' ')}.`, userId: other, matchId: id, reportId: uid === match.lostUserId ? match.lostReportId : match.foundReportId, read: false, createdAt: serverTimestamp() });
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

export function watchClaimsForUser(callback, onError) {
  if (!auth || !db) { callback([], false); onError?.(new Error('Firebase is not configured.')); return () => {}; }
  let stopClaims = () => {}, generation = 0;
  const stopAuth = onAuthStateChanged(auth, (user) => {
    generation += 1;
    const currentGeneration = generation;
    stopClaims();
    stopClaims = () => {};
    callback([], true);
    if (!user) { callback([], false); return; }
    stopClaims = onSnapshot(query(collection(db, 'claims'), where('claimantId', '==', user.uid)), (snapshot) => {
      void Promise.all(snapshot.docs.map(async (entry) => {
        const claim = { id: entry.id, ...entry.data() };
        claim.item = await getItemReport(claim.itemId).catch(() => null);
        return claim;
      })).then((claims) => {
        if (currentGeneration === generation) callback(claims.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)), false);
      }).catch(onError);
    }, onError);
  }, onError);
  return () => { generation += 1; stopClaims(); stopAuth(); };
}

export async function submitOwnershipClaim(itemId, reason, evidence, matchContext = null) {
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in before claiming an item.');
  if (!itemId || reason.trim().length < 10 || evidence.trim().length < 10) throw new Error('Add a clear reason and ownership details (at least 10 characters each).');
  if (matchContext && !matchContext.matchId) throw new Error('The related match ID is missing. Reopen the match and try again.');
  const itemRef = doc(db, 'items', itemId);
  const claimRef = doc(collection(db, 'claims'));
  const activeRef = doc(db, 'activeClaims', `${itemId}_${user.uid}`);
  const reviewNotice = doc(db, 'notifications', `claim_submitted_${claimRef.id}`);
  await runTransaction(db, async (tx) => {
    const reads = [tx.get(itemRef), tx.get(activeRef)];
    if (matchContext) reads.push(tx.get(doc(db, 'matches', matchContext.matchId)));
    const [itemSnap, activeSnap, matchSnap] = await Promise.all(reads);
    if (!itemSnap.exists() || itemSnap.data().type !== 'found') throw new Error('This found item is unavailable for claims.');
    if (itemSnap.data().reservedFor || ['returned', 'resolved', 'recovered', 'closed'].includes(String(itemSnap.data().status).toLowerCase())) throw new Error('This item has already been reserved or recovered.');
    if (activeSnap.exists()) throw new Error('You already have an active claim for this item.');
    let relatedMatch = null;
    if (matchContext) {
      if (!matchSnap?.exists()) throw new Error('The selected potential match no longer exists. Reopen the match and try again.');
      relatedMatch = matchSnap.data();
      if (relatedMatch.foundReportId !== itemId) throw new Error('The selected match points to a different found item. Reopen the intended match and try again.');
      if (relatedMatch.lostUserId !== user.uid) throw new Error('Only the owner of the matched lost report can submit an ownership claim from this match.');
      if (!relatedMatch.lostReportId || !relatedMatch.foundUserId) throw new Error('The selected match is missing its report references.');
      const lostSnap = await tx.get(doc(db, 'items', relatedMatch.lostReportId));
      if (!lostSnap.exists() || lostSnap.data().type !== 'lost' || lostSnap.data().userId !== user.uid) throw new Error('Your account does not own the lost report linked to this match.');
      if (relatedMatch.foundUserId !== itemSnap.data().userId) throw new Error('The selected match does not belong to this found report. Reopen the match and try again.');
    }
    if (itemSnap.data().userId === user.uid) throw new Error('You cannot submit an ownership claim for a found item you reported.');
    tx.set(claimRef, { itemId, itemName: itemSnap.data().itemName, claimantId: user.uid, claimantName: user.displayName || user.email || 'User', claimantEmail: user.email || '', reason: reason.trim(), evidence: evidence.trim(), status: 'Pending', ...(relatedMatch ? { matchId: matchContext.matchId, lostReportId: relatedMatch.lostReportId } : {}), createdAt: serverTimestamp() });
    tx.set(activeRef, { claimId: claimRef.id, itemId, claimantId: user.uid, status: 'Pending' });
    tx.set(reviewNotice, { type: 'claim_submitted', audience: 'admins', title: 'Ownership claim needs review', message: `A claim was submitted for ${itemSnap.data().itemName}.`, claimId: claimRef.id, itemId, read: false, createdAt: serverTimestamp() });
  });
  return claimRef.id;
}

export function watchPendingClaims(callback, onError) {
  return onSnapshot(query(collection(db, 'claims'), where('status', '==', 'Pending')), (snapshot) => callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))), onError);
}

export async function decideOwnershipClaim(claimId, decision, rejectionReason = '') {
  if (!['Approved', 'Rejected'].includes(decision)) throw new Error('Invalid claim decision.');
  if (decision === 'Rejected' && String(rejectionReason).trim().length < 3) throw new Error('Add a rejection reason of at least 3 characters.');
  const admin = auth?.currentUser;
  if (!admin) throw new Error('Sign in with an administrator account.');
  const claimRef = doc(db, 'claims', claimId);
  const decisionNotice = doc(db, 'notifications', `claim_decision_${claimId}`);
  await runTransaction(db, async (tx) => {
    const claimSnap = await tx.get(claimRef);
    if (!claimSnap.exists()) throw new Error('This claim no longer exists.');
    const claim = claimSnap.data(), itemRef = doc(db, 'items', claim.itemId);
    const itemSnap = await tx.get(itemRef);
    if (!itemSnap.exists() || claim.status !== 'Pending') throw new Error('This claim has already been decided or its item is unavailable.');
    if (decision === 'Approved' && (itemSnap.data().reservedFor || ['returned', 'resolved', 'recovered', 'closed'].includes(String(itemSnap.data().status).toLowerCase()))) throw new Error('This item has already been reserved or recovered.');
    tx.update(claimRef, { status: decision, decision, decisionReason: decision === 'Rejected' ? rejectionReason.trim().slice(0, 1000) : '', decidedBy: admin.uid, decidedAt: serverTimestamp() });
    const activeRef = doc(db, 'activeClaims', `${claim.itemId}_${claim.claimantId}`);
    if (decision === 'Approved') tx.update(activeRef, { status: decision });
    else tx.delete(activeRef);
    if (decision === 'Approved') tx.update(itemRef, { status: 'reserved', reservedFor: claim.claimantId, reservedClaimId: claimId, updatedAt: serverTimestamp() });
    const reasonText = decision === 'Rejected' && rejectionReason.trim() ? ` Reason: ${rejectionReason.trim().slice(0, 1000)}` : '';
    tx.set(decisionNotice, { type: 'claim_decision', title: `Claim ${decision.toLowerCase()}`, message: `Your claim for ${claim.itemName} was ${decision.toLowerCase()}.${reasonText}`, userId: claim.claimantId, claimId, itemId: claim.itemId, read: false, createdAt: serverTimestamp() });
    tx.set(doc(collection(db, 'adminAudit')), { actorUid: admin.uid, action: `claim_${decision.toLowerCase()}`, targetId: claimId, outcome: 'success', createdAt: serverTimestamp() });
  });
}

export async function coordinateClaimPickup(claimId, pickupDetails) {
  const admin = auth?.currentUser;
  if (!admin || !pickupDetails.trim()) throw new Error('Add pickup location and timing details.');
  const claimRef = doc(db, 'claims', claimId), noticeRef = doc(collection(db, 'notifications'));
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(claimRef);
    if (!snapshot.exists() || snapshot.data().status !== 'Approved') throw new Error('Only approved claims can be coordinated for pickup.');
    const claim = snapshot.data();
    if (claim.pickupStatus === 'Recovered') throw new Error('This item has already been marked recovered.');
    tx.update(claimRef, { pickupStatus: 'Coordinated', pickupDetails: pickupDetails.trim().slice(0, 1000), pickupCoordinatedBy: admin.uid, pickupCoordinatedAt: serverTimestamp() });
    tx.set(noticeRef, { type: 'pickup_update', title: 'Pickup coordinated', message: `Pickup details for ${claim.itemName}: ${pickupDetails.trim().slice(0, 1000)}`, userId: claim.claimantId, claimId, itemId: claim.itemId, read: false, createdAt: serverTimestamp() });
    tx.set(doc(collection(db, 'adminAudit')), { actorUid: admin.uid, action: 'claim_pickup_coordinated', targetId: claimId, outcome: 'success', createdAt: serverTimestamp() });
  });
}

export async function confirmClaimReceived(claimId) {
  const claimant = auth?.currentUser;
  if (!claimant) throw new Error('Sign in before confirming pickup.');
  const claimRef = doc(db, 'claims', claimId), recoveredNotice = doc(db, 'notifications', `recovery_claimant_${claimId}`), adminNotice = doc(db, 'notifications', `recovery_admin_${claimId}`);
  await runTransaction(db, async (tx) => {
    const claimSnap = await tx.get(claimRef);
    if (!claimSnap.exists()) throw new Error('This claim no longer exists.');
    const claim = claimSnap.data();
    if (claim.claimantId !== claimant.uid || claim.status !== 'Approved' || claim.pickupStatus !== 'Coordinated') throw new Error('Pickup must be coordinated before you can confirm receipt.');
    const itemRef = doc(db, 'items', claim.itemId), itemSnap = await tx.get(itemRef);
    if (!itemSnap.exists() || itemSnap.data().reservedClaimId !== claimRef.id || itemSnap.data().reservedFor !== claimant.uid) throw new Error('This item is no longer reserved for your claim.');
    tx.update(claimRef, { pickupStatus: 'Recovered', receivedAt: serverTimestamp() });
    tx.update(itemRef, { status: 'recovered', updatedAt: serverTimestamp() });
    tx.set(recoveredNotice, { type: 'recovery_update', title: 'Item marked recovered', message: `${claim.itemName} was marked recovered after the claimant confirmed receipt.`, userId: itemSnap.data().userId, claimId: claimRef.id, itemId: claim.itemId, read: false, createdAt: serverTimestamp() });
    tx.set(adminNotice, { type: 'recovery_update', audience: 'admins', title: 'Pickup confirmed', message: `${claim.itemName} was marked recovered by the claimant.`, claimId: claimRef.id, itemId: claim.itemId, read: false, createdAt: serverTimestamp() });
  });
}
