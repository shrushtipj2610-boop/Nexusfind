import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { collection, doc, getDoc, onSnapshot, query, where, updateDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { coordinateClaimPickup, decideOwnershipClaim } from './database.js';

const message = document.querySelector('#adminMessage');
const summaryRoot = document.querySelector('#adminSummary');
const claimsRoot = document.querySelector('#pendingClaims');
const inboxRoot = document.querySelector('#adminInbox');
const escape = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
let stopClaims = () => {}, stopInbox = () => {};
const dateText = (stamp) => stamp?.toDate?.().toLocaleString() || 'Recently';
const clear = () => { stopClaims(); stopInbox(); };
const showError = (error) => { message.textContent = error?.message || 'Something went wrong. Please try again.'; };

function renderSummary(claims) {
  const pending = claims.filter((claim) => claim.status === 'Pending').length;
  const approved = claims.filter((claim) => claim.status === 'Approved').length;
  const rejected = claims.filter((claim) => claim.status === 'Rejected').length;
  const items = new Set(claims.filter((claim) => claim.status === 'Pending').map((claim) => claim.itemId));
  summaryRoot.innerHTML = [['Pending Claims', pending], ['Approved Claims', approved], ['Rejected Claims', rejected], ['Items Awaiting Verification', items.size]].map(([label, count]) => `<article class="card admin-stat"><span>${escape(label)}</span><strong>${count}</strong></article>`).join('');
}

function claimCard(claim) {
  const pending = claim.status === 'Pending';
  const approved = claim.status === 'Approved';
  const pickupStatus = claim.pickupStatus || 'Awaiting pickup coordination';
  const decision = claim.decision || claim.status;
  return `<article class="card admin-claim"><div class="admin-claim-photo">${claim.itemImage ? `<img src="${escape(claim.itemImage)}" alt="${escape(claim.itemName)}">` : '<span>Image unavailable</span>'}</div><div class="admin-claim-content"><div class="claim-row"><div><h3>${escape(claim.itemName || claim.item?.itemName || 'Found item')}</h3><span class="claim-meta">Found item/report ID: ${escape(claim.itemId)}<br>Claim ID: ${escape(claim.id)}</span></div><span class="claim-status ${escape(claim.status.toLowerCase())}">${escape(claim.status)}</span></div><p><b>Claimant:</b> ${escape(claim.claimantName || 'NexusFind user')} · ${escape(claim.claimantEmail || '')}<br><b>Claimant ID:</b> ${escape(claim.claimantId)}<br><b>Submitted:</b> ${escape(dateText(claim.createdAt))}</p><details class="admin-details"><summary>View details and ownership evidence</summary><div class="summary"><strong>ITEM DETAILS</strong>${escape(claim.item?.description || 'No public description available.')}<br>Location: ${escape(claim.item?.location || 'Not provided')}</div><div class="summary"><strong>OWNERSHIP EXPLANATION</strong>${escape(claim.reason)}</div><div class="summary"><strong>PRIVATE VERIFICATION DETAILS</strong>${escape(claim.evidence)}</div>${!pending ? `<div class="summary"><strong>ADMIN DECISION</strong>${escape(decision)} · ${escape(dateText(claim.decidedAt))}<br>Admin ID: ${escape(claim.decidedBy || 'Unavailable')}${claim.decisionReason ? `<br>Reason: ${escape(claim.decisionReason)}` : ''}</div>` : ''}${approved ? `<div class="summary"><strong>PICKUP COORDINATION</strong>${escape(pickupStatus)}${claim.pickupDetails ? `<br>${escape(claim.pickupDetails)}` : ''}${claim.pickupCoordinatedAt ? `<br>Updated: ${escape(dateText(claim.pickupCoordinatedAt))}` : ''}</div>` : ''}</details>${pending ? `<div class="admin-actions"><button class="button claim-decision" data-id="${escape(claim.id)}" data-decision="Approved" type="button">Approve</button><button class="small-button claim-decision reject" data-id="${escape(claim.id)}" data-decision="Rejected" type="button">Reject</button></div>` : ''}${approved && pickupStatus !== 'Recovered' ? `<button class="small-button coordinate-pickup" data-id="${escape(claim.id)}" type="button">${pickupStatus === 'Coordinated' ? 'Update pickup details' : 'Coordinate pickup'}</button>` : ''}${approved && pickupStatus === 'Recovered' ? '<p class="claim-status approved">Item recovered</p>' : ''}</div></article>`;
}

function renderClaims(claims) {
  renderSummary(claims);
  const sorted = claims.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  const pending = sorted.filter((claim) => claim.status === 'Pending');
  const history = sorted.filter((claim) => claim.status !== 'Pending');
  claimsRoot.innerHTML = `<section class="admin-claim-group"><h3>Pending review</h3>${pending.length ? pending.map(claimCard).join('') : '<p class="subtitle admin-empty">No pending claims need review.</p>'}</section>${history.length ? `<section class="admin-claim-group"><h3>Decisions and pickup</h3>${history.map(claimCard).join('')}</section>` : ''}`;
  claimsRoot.querySelectorAll('.claim-decision').forEach((button) => button.onclick = async () => {
    const decision = button.dataset.decision;
    const reason = decision === 'Rejected' ? (window.prompt('Optional rejection reason for the claimant:') || '') : '';
    if (!window.confirm(`${decision} this claim? ${decision === 'Approved' ? 'The item will be reserved for the claimant.' : 'The claimant will receive the rejection decision.'}`)) return;
    button.disabled = true;
    try { await decideOwnershipClaim(button.dataset.id, decision, reason); message.textContent = `Claim ${decision.toLowerCase()} and saved.`; }
    catch (error) { showError(error); button.disabled = false; }
  });
  claimsRoot.querySelectorAll('.coordinate-pickup').forEach((button) => button.onclick = async () => {
    const details = window.prompt('Enter the agreed pickup place and time:');
    if (!details?.trim()) return;
    if (!window.confirm('Save and send these pickup coordination details to the claimant?')) return;
    button.disabled = true;
    try { await coordinateClaimPickup(button.dataset.id, details); message.textContent = 'Pickup details sent to the claimant.'; }
    catch (error) { showError(error); button.disabled = false; }
  });
}

function renderInbox(entries) {
  inboxRoot.innerHTML = entries.length ? `<h2>Admin notifications</h2>${entries.map((entry) => `<button class="notification ${entry.read ? 'read' : ''}" data-notice="${escape(entry.id)}" type="button"><span class="notice-copy"><b>${escape(entry.title)}</b><p>${escape(entry.message)}</p></span><time class="notice-time">${entry.read ? 'Read' : 'Unread'}</time></button>`).join('')}` : '';
  inboxRoot.querySelectorAll('[data-notice]').forEach((button) => button.onclick = async () => { try { await updateDoc(doc(db, 'notifications', button.dataset.notice), { read: true }); } catch (error) { showError(error); } });
}

function setTheme() { document.body.dataset.theme = document.body.dataset.theme === 'light' ? '' : 'light'; localStorage.nexusTheme = document.body.dataset.theme || 'dark'; }
document.querySelector('#adminTheme').onclick = setTheme;
document.querySelector('#adminThemeMobile').onclick = setTheme;

onAuthStateChanged(auth, async (user) => {
  clear(); summaryRoot.replaceChildren(); inboxRoot.replaceChildren();
  claimsRoot.innerHTML = '<div class="admin-loading">Loading claims…</div>';
  if (!user) { message.textContent = 'Sign in on the main NexusFind page with your administrator account.'; claimsRoot.replaceChildren(); return; }
  try {
    const admin = await getDoc(doc(db, 'admins', user.uid));
    if (!admin.exists()) { message.textContent = 'This account is not authorized to access Admin Verification.'; claimsRoot.replaceChildren(); return; }
    message.textContent = 'Administrator access confirmed.';
    stopClaims = onSnapshot(collection(db, 'claims'), async (snapshot) => {
      message.textContent = 'Loading current Firebase claims…';
      try {
        const claims = await Promise.all(snapshot.docs.map(async (entry) => {
          const claim = { id: entry.id, ...entry.data() };
          try { const item = await getDoc(doc(db, 'items', claim.itemId)); claim.item = item.exists() ? item.data() : null; claim.itemImage = claim.item?.imageUrl || ''; } catch { claim.item = null; claim.itemImage = ''; }
          return claim;
        }));
        renderClaims(claims);
        message.textContent = 'Claims are live from Firebase. Updates appear automatically.';
      } catch (error) { showError(error); }
    }, showError);
    stopInbox = onSnapshot(query(collection(db, 'notifications'), where('audience', '==', 'admins')), (snapshot) => {
      renderInbox(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })).sort((a,b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
    }, showError);
  } catch (error) { claimsRoot.replaceChildren(); showError(error); }
});

const doSignOut = async () => { try { await signOut(auth); location.href = 'index.html'; } catch (error) { showError(error); } };
document.querySelector('#adminLogout').onclick = doSignOut;
document.querySelector('#adminLogoutMobile').onclick = doSignOut;
window.addEventListener('pagehide', clear);
