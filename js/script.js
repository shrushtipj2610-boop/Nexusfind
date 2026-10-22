const $ = (s, p = document) => p.querySelector(s);
const root = $('#page-root');
const reports = [
  ['⚡','Apple AirPods Pro','White AirPods in a black case with a small sticker','Library','Electronics','Jul 24, 2026','lost'],
  ['🪪','Student ID Card','Found near the billing counter, name visible on card','Canteen','ID Cards','Jul 23, 2026','found'],
  ['🎒','Blue Backpack','Navy blue Nike backpack with laptop compartment','Classroom B-204','Bags & Backpacks','Jul 22, 2026','returned'],
  ['🔑','Bunch of Keys','3 keys on a red keychain ring','Parking Area','Keys','Jul 22, 2026','found'],
  ['💧','Steel Water Bottle','Silver reusable bottle with black cap','Gym','Personal Items','Jul 21, 2026','found'],
  ['📱','Phone Charger','White Type-C charger and cable','Computer Lab','Electronics','Jul 20, 2026','lost']
];
const itemCard = (r) => `<article class="card item-card"><div class="item-image ${r[6]}"><span class="badge ${r[6]}">${r[6][0].toUpperCase()+r[6].slice(1)}</span>${r[0]}</div><div class="item-content"><h3>${r[1]}</h3><p>${r[2]}</p><div class="place">${r[3]}</div><div class="meta"><span class="tag">${r[4]}</span><span>${r[5]}</span></div></div></article>`;
let persistedReports = [];
let notificationsData = [];
let matchesData = [];
let claimsData = [];
let matchesLoaded = false;
let claimsLoaded = false;
let matchesLoadError = false;
let claimsLoadError = false;
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const reportDate = (report) => report.dateFound || report.dateLost || 'Date not provided';
const localItemImages = [
  { aliases: ['college id card', 'college id', 'student id', 'identity card', 'id card'], src: '/images/collegeid.png', alt: 'Student or college identification card' },
  { aliases: ['laptop charger', 'charger laptop', 'notebook charger', 'laptop adapter', 'charger'], src: '/images/charger%20laptop.png', alt: 'Laptop charger and power adapter' },
  { aliases: ['airpods', 'airpod'], src: '/images/airpods.jpeg', alt: 'AirPods' },
  { aliases: ['earbuds', 'earbud', 'ear buds', 'ear bud', 'earphones', 'earphone', 'headphones', 'headphone'], src: '/images/earbuds.jpeg', alt: 'Earbuds' },
  { aliases: ['keys', 'key', 'keychain', 'keychains'], src: '/images/keys.jpeg', alt: 'Set of keys on a keyring' },
  { aliases: ['document', 'documents', 'personal file', 'file'], src: '/images/document.jpeg', alt: 'Personal documents' },
  { aliases: ['bottle'], src: '/images/bottle.jpeg', alt: 'Reusable water bottle' }
];
const normalizeItemName = (value = '') => ` ${String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ').replace(/\bear\s+buds?\b/g, 'earbuds').replace(/\bearphones?\b/g, 'earbuds')} `;
const getLocalItemImage = (report = {}) => {
  const normalized = `${normalizeItemName(report.itemName)} ${normalizeItemName(report.category)} ${normalizeItemName(report.description)}`;
  return localItemImages.find((image) => image.aliases.some((alias) => normalized.includes(normalizeItemName(alias)))) || null;
};
const getReportImage = (report = {}) => {
  const uploadedImage = [report.imageUrl, report.image].find((value) => typeof value === 'string' && value.trim());
  return uploadedImage?.trim() || getLocalItemImage(report)?.src || null;
};
const reportImageMarkup = (url, itemName, className = '') => url
  ? `<img class="${className}" data-report-image src="${escapeHtml(url)}" alt="${escapeHtml(itemName || 'Reported item')}">`
  : '<span class="image-placeholder" role="img" aria-label="No image available">No image available</span>';
const reportImageFor = (report = {}, className = '') => {
  const url = getReportImage(report);
  if (!url) return reportImageMarkup(null, report.itemName, className);
  const uploaded = report.imageUrl || report.image;
  const local = uploaded ? getLocalItemImage(report)?.src : null;
  return `<img class="${className}" data-report-image${local ? ` data-local-fallback="${local}"` : ''} src="${escapeHtml(url)}" alt="${escapeHtml(report.itemName || 'Reported item')}">`;
};
const bindReportImageFallback = (container = document) => container.querySelectorAll('img[data-report-image]').forEach((image) => image.addEventListener('error', () => {
  if (image.dataset.localFallback && image.src !== new URL(image.dataset.localFallback, document.baseURI).href) {
    image.src = image.dataset.localFallback;
    delete image.dataset.localFallback;
    return;
  }
  let imageUrl = image.currentSrc || image.src;
  try { const safeUrl = new URL(imageUrl); safeUrl.search = ''; imageUrl = safeUrl.href; } catch { /* Keep non-URL image paths readable in logs. */ }
  console.warn('[REPORT IMAGE] Image URL failed to load:', { itemName: image.alt, imageUrl });
  const placeholder = document.createElement('span');
  placeholder.className = 'image-placeholder image-placeholder-error';
  placeholder.textContent = 'Image unavailable';
  image.replaceWith(placeholder);
}));
const imagePreviewUrls = new Map();
function releaseImagePreview(file) {
  const url = imagePreviewUrls.get(file);
  if (url) URL.revokeObjectURL(url);
  imagePreviewUrls.delete(file);
}
function bindImagePreview(input, preview, getFile, setFile) {
  const render = () => {
    const file = getFile();
    preview.replaceChildren();
    if (!file) return;
    let url = imagePreviewUrls.get(file);
    if (!url) { url = URL.createObjectURL(file); imagePreviewUrls.set(file, url); }
    const image = document.createElement('img');
    image.src = url;
    image.alt = 'Selected item image preview';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'small-button';
    remove.textContent = 'Remove image';
    remove.onclick = () => {
      setFile(null);
      input.value = '';
      releaseImagePreview(file);
      render();
    };
    preview.append(image, remove);
  };
  input.onchange = () => {
    const file = input.files?.[0] || null;
    if (!file) { render(); return; }
    const previousFile = getFile();
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setFile(null);
      if (previousFile) releaseImagePreview(previousFile);
      input.value = '';
      preview.textContent = file.size > 5 * 1024 * 1024 ? 'Image size must be 5MB or less.' : 'Choose a PNG or JPG image.';
      preview.classList.add('image-preview-error');
      return;
    }
    preview.classList.remove('image-preview-error');
    if (previousFile && previousFile !== file) releaseImagePreview(previousFile);
    setFile(file);
    render();
  };
  render();
}
const persistedItemCard = (report) => {
  const type = report.type === 'found' ? 'found' : 'lost';
  const visual = reportImageFor(report);
  const canClaim = type === 'found' && !report.reservedFor && !['returned','resolved','recovered','closed'].includes(String(report.status).toLowerCase()) && !claimsData.some((claim) => claim.itemId === report.id && claim.status === 'Pending');
  return `<article class="card item-card"><div class="item-image ${type}"><span class="badge ${type}">${type[0].toUpperCase() + type.slice(1)}</span>${visual}</div><div class="item-content"><h3>${escapeHtml(report.itemName)}</h3><p>${escapeHtml(report.description)}</p><div class="place">${escapeHtml(report.location || 'Location not provided')}</div><div class="meta"><span class="tag">${escapeHtml(report.category)}</span><span>${escapeHtml(reportDate(report))}</span></div><button class="small-button view-report" data-report-id="${escapeHtml(report.id)}" type="button">View Details</button>${canClaim ? `<button class="small-button claim-item" data-item-id="${escapeHtml(report.id)}" type="button">Claim This Item</button>` : ''}</div></article>`;
};
const shell = (body, cls='') => `<div class="page ${cls}">${body}</div>`;
function home(){const recent=persistedReports.slice(0,4);root.innerHTML=shell(`<div class="hero"><span class="eyebrow">189 active reports right now</span><h1>Lost something?<span class="gradient-text">Find it with NexusFind</span></h1><p class="lead">Your college's smart lost & found system. Report lost items, browse found items, and get reunited — fast.</p><div class="action-row"><button class="button go" data-go="lost">📋 &nbsp; Report Lost Item</button><button class="button outline go" data-go="found">✅ &nbsp; Report Found Item</button></div><label class="search">🔍 <input id="homeSearch" placeholder="Search for lost or found items..." /></label></div><div class="section-heading"><div><h2>Recent Reports</h2><p>Latest activity from campus</p></div><button class="small-button go" data-go="browse">View All Items →</button></div><div class="items-grid">${recent.map((report) => persistedItemCard(report, { recent: true })).join('') || '<p class="subtitle">No recent reports yet.</p>'}</div><div class="how-it-works"><h2>How It Works</h2><p>Simple 3-step process to recover your items</p><div class="steps"><div class="step-card"><div class="emoji">📝</div><small>STEP 01</small><h3>Report Your Item</h3></div><div class="step-card"><div class="emoji">🔍</div><small>STEP 02</small><h3>Smart Matching</h3></div><div class="step-card"><div class="emoji">🔔</div><small>STEP 03</small><h3>Get Connected</h3></div></div></div>`,'home');bindDetails();}
function browse(){const defaultCategories=['Electronics','Keys','Bags & Backpacks','ID Cards','Personal Items'];const categories=[...new Set([...defaultCategories,...persistedReports.map((report)=>report.category).filter(Boolean)])];const locations=[...new Set(persistedReports.map((report)=>report.location).filter(Boolean))];const statuses=[...new Set(persistedReports.map((report)=>report.status).filter(Boolean))];root.innerHTML=shell(`<h1 class="page-title">Browse Lost & Found</h1><p class="subtitle">Search active campus reports by item type, category, and location</p><div class="filters"><div class="field"><label>Search</label><label class="search"><span>🔍</span><input id="browseSearch" placeholder="e.g. Laptop, Keys..." /></label></div><div class="field"><label>Type</label><select id="typeFilter"><option value="all">All Types</option><option value="lost">Lost</option><option value="found">Found</option></select></div><div class="field"><label>Category</label><select id="categoryFilter"><option value="all">All Categories</option>${categories.map((value)=>`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}</select></div><div class="field"><label>Location</label><select id="locationFilter"><option value="all">All Locations</option>${locations.map((value)=>`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}</select></div><div class="field"><label>Status</label><select id="statusFilter"><option value="all">All Statuses</option>${statuses.map((value)=>`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}</select></div></div><div class="browse-bar"><span>Showing <b id="resultCount">${persistedReports.length}</b> results</span><div class="tabs"><button class="tab active" data-filter="all">All Types</button><button class="tab" data-filter="lost">Lost</button><button class="tab" data-filter="found">Found</button></div></div><div class="items-grid browse-grid" id="browseGrid">${persistedReports.map(persistedItemCard).join('') || '<p class="subtitle">No reports have been submitted yet.</p>'}</div>`);bindBrowse()}
function reportHeader(kind){return `<div class="form-header"><h1>${kind==='lost'?'🔴 Report a Lost Item':'<span class="eyebrow found-label">FOUND SOMETHING?</span><br>Help return a <span class="gradient-text inline">found item</span>'}</h1><p>${kind==='lost'?'Help us help you find your missing item':'Take 30 seconds to log the item — a fellow student will thank you.'}</p></div>`}
function lost(){root.innerHTML=shell(`${reportHeader('lost')}<div class="progress" id="progress"><div class="progress-step active"><span class="progress-dot">1</span>Item Details</div><div class="progress-line"></div><div class="progress-step"><span class="progress-dot">2</span>Location & Date</div><div class="progress-line"></div><div class="progress-step"><span class="progress-dot">3</span>Contact Info</div></div><form class="form-card" id="lostForm"></form>`,'form-page');renderLostStep(1)}
function legacyRenderLostStep(step){const form=$('#lostForm');const fields= step===1?`<div class="field wide"><label>Item Name</label><input class="input" placeholder="e.g. Earphones, Keys, Wallet..." required></div><div class="field wide"><label>Category</label><select><option>Select category</option><option>Electronics</option><option>Keys</option></select></div><div class="field wide"><label>Description</label><textarea placeholder="Describe distinguishing features..."></textarea></div><div class="field wide"><label>Reward (Optional)</label><input class="input" placeholder="e.g. ₹500"></div>`:step===2?`<div class="field wide"><label>Last Seen Location</label><select><option>Select location</option><option>Library</option><option>Classroom</option></select></div><div class="field wide"><label>Specific Landmark / Area</label><input class="input" placeholder="e.g. Near window seat, 2nd floor..."></div><div class="field wide"><label>Date Lost</label><input type="date" class="input"></div><div class="hint">💡 &nbsp; The more precise your location, the higher the chance of a match.</div>`:`<div class="field wide"><label>Your Name</label><input class="input" placeholder="Full name" required></div><div class="field wide"><label>College Email</label><input type="email" class="input" placeholder="you@college.edu" required></div><div class="field wide"><label>Phone Number</label><input class="input" placeholder="+91 98765 43210"></div><div class="summary"><strong>REPORT SUMMARY</strong>Item: —<br>Category: —<br>Location: —<br>Date: —</div>`;form.innerHTML=`<div class="form-grid">${fields}</div><div class="form-actions">${step>1?'<button type="button" class="back" id="prev">← Back</button>':'<span></span>'}<button class="button" type="submit">${step===3?'Submit Report':'Continue →'}</button></div>`;[...document.querySelectorAll('.progress-step')].forEach((el,i)=>{el.classList.toggle('active',i===step-1);el.classList.toggle('done',i<step-1);el.querySelector('.progress-dot').textContent=i<step-1?'✓':i+1});[...document.querySelectorAll('.progress-line')].forEach((el,i)=>el.classList.toggle('done',i<step-1));form.onsubmit=e=>{e.preventDefault();if(step===3){toast('Your lost item report was submitted!');home();setActive('home')}else renderLostStep(step+1)};const prev=$('#prev');if(prev)prev.onclick=()=>renderLostStep(step-1)}
function legacyFound(){root.innerHTML=shell(`${reportHeader('found')}<form class="form-card" id="foundForm"><div class="form-grid"><div class="field"><label>Item Name</label><input class="input" placeholder="e.g. Silver water bottle" required></div><div class="field"><label>Category</label><select><option>Select category</option><option>Electronics</option></select></div><div class="field wide"><label>Description</label><textarea placeholder="Describe distinguishing features..."></textarea></div><div class="field wide"><label>Upload Image</label><label class="upload"> <span><span class="upload-icon">⇧</span><b>Click to upload · PNG, JPG up to 5MB</b></span><input type="file" hidden></label></div><div class="field"><label>Location Found</label><input class="input" placeholder="e.g. Cafeteria"></div><div class="field"><label>Date Found</label><input type="date" class="input"></div><div class="field wide"><label>Current Storage Location</label><input class="input" placeholder="e.g. Security desk, Block A"></div></div><div class="form-actions"><span></span><button class="button">Submit found item</button></div></form>`,'form-page');$('#foundForm').onsubmit=e=>{e.preventDefault();toast('Thank you for reporting this found item!');home();setActive('home')}}
const relativeTime = (timestamp) => {
  const date = timestamp?.toDate?.();
  if (!date) return 'Just now';
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
};
function notificationCard(notification) {
  if (['claim_decision', 'pickup_update', 'recovery_update'].includes(notification.type)) return `<button class="notification ${notification.read ? 'read' : ''} open-notification" data-notification-id="${escapeHtml(notification.id)}" data-claim-id="${escapeHtml(notification.claimId || '')}" type="button"><div class="notice-icon">✓</div><div class="notice-copy"><h3>${escapeHtml(notification.title)}</h3><p>${escapeHtml(notification.message)}</p></div><time class="notice-time ${notification.read ? '' : 'unread'}">${relativeTime(notification.createdAt)}</time></button>`;
  if (notification.type === 'potential_match' || notification.type === 'match_update') return `<button class="notification ${notification.read ? 'read' : ''} open-notification" data-notification-id="${escapeHtml(notification.id)}" data-match-id="${escapeHtml(notification.matchId || '')}" type="button"><div class="notice-icon">🔔</div><div class="notice-copy"><h3>${escapeHtml(notification.title)}</h3><p>${escapeHtml(notification.message)}</p></div><time class="notice-time ${notification.read ? '' : 'unread'}">${relativeTime(notification.createdAt)}</time></button>`;
  const found = notification.type === 'found_report';
  return `<button class="notification ${notification.read ? 'read' : ''} open-notification" data-notification-id="${escapeHtml(notification.id)}" data-report-id="${escapeHtml(notification.reportId || '')}" type="button"><div class="notice-icon">${found ? '🔵' : '🔴'}</div><div class="notice-copy"><h3>${escapeHtml(notification.title)}</h3><p>${escapeHtml(notification.message)}</p></div><time class="notice-time ${notification.read ? '' : 'unread'}">${relativeTime(notification.createdAt)}</time></button>`;
}
function notifications(){const unread=notificationsData.filter((notification)=>!notification.read).length;root.innerHTML=shell(`<div class="notification-toolbar"><div><h1 class="page-title">Notifications</h1><p class="subtitle">${unread ? `<b>${unread}</b> unread notifications` : 'No unread notifications'}</p></div><div class="tabs"><button class="tab active" data-notification-filter="all">All</button><button class="tab" data-notification-filter="unread">Unread</button></div></div><div class="notification-list" id="notificationList">${notificationsData.map(notificationCard).join('') || '<p class="subtitle">No notifications yet.</p>'}</div>`);bindNotifications()}
function bindNotifications(){let filter='all';const apply=()=>{$('#notificationList').innerHTML=notificationsData.filter((notification)=>filter==='all'||!notification.read).map(notificationCard).join('') || '<p class="subtitle">No unread notifications.</p>';document.querySelectorAll('.open-notification').forEach((button)=>{button.onclick=async()=>{const notification=notificationsData.find((entry)=>entry.id===button.dataset.notificationId);const wasUnread=notification&&!notification.read;if(wasUnread){notification.read=true;updateNotificationCount();apply();try{await window.NexusFind.markNotificationRead(button.dataset.notificationId)}catch(error){notification.read=false;updateNotificationCount();apply();console.error('Unable to mark notification as read:',error);toast('Unable to open this notification. Please try again.');return}}try{if(button.dataset.claimId) render('claims');else if(button.dataset.matchId) await showMatchDetails(button.dataset.matchId);else await showReportDetails(button.dataset.reportId)}catch(error){console.error('Unable to open notification:',error);toast('Unable to open this notification. Please try again.')}}})};document.querySelectorAll('[data-notification-filter]').forEach((button)=>button.onclick=()=>{filter=button.dataset.notificationFilter;document.querySelectorAll('[data-notification-filter]').forEach((tab)=>tab.classList.toggle('active',tab===button));apply()});apply()}
const pages={home,browse,lost,found,notifications,claims:claimsPage,admin:()=>{location.href='admin.html';},'my-reports':myReports};function setActive(page){document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.page===page));}
function render(page){pages[page]();setActive(page);$('#sidebar').classList.remove('open');window.scrollTo({top:0,behavior:'smooth'});bindGo()}
function bindGo(){document.querySelectorAll('.go').forEach(b=>b.onclick=()=>render(b.dataset.go));const hs=$('#homeSearch');if(hs)hs.onkeydown=e=>{if(e.key==='Enter')render('browse')}}
function bindBrowse(){let f='all';const apply=()=>{const q=$('#browseSearch').value.toLowerCase();const t=$('#typeFilter').value;const category=$('#categoryFilter').value;const location=$('#locationFilter').value;const status=$('#statusFilter').value;const view=persistedReports.filter((report)=>(f==='all'||report.type===f)&&(t==='all'||report.type===t)&&(category==='all'||report.category===category)&&(location==='all'||report.location===location)&&(status==='all'||report.status===status)&&[report.itemName,report.category,report.description,report.location].join(' ').toLowerCase().includes(q));$('#browseGrid').innerHTML=view.map(persistedItemCard).join('') || '<p class="subtitle">No matching reports found.</p>';$('#resultCount').textContent=view.length;bindDetails()};$('#browseSearch').oninput=apply;['#typeFilter','#categoryFilter','#locationFilter','#statusFilter'].forEach((selector)=>$(selector).onchange=apply);document.querySelectorAll('.tab[data-filter]').forEach(b=>b.onclick=()=>{f=b.dataset.filter;document.querySelectorAll('.tab[data-filter]').forEach(x=>x.classList.toggle('active',x===b));apply()});bindDetails()}
async function showReportDetails(id) {
  try {
    const report = await window.NexusFind.getItemReport(id);
    const type = report.type === 'found' ? 'FOUND' : 'LOST';
    root.innerHTML = shell(`<button class="back" id="detailsBack" type="button">← Back to Browse</button><article class="form-card"><span class="badge ${report.type}">${type}</span><h1 class="page-title">${escapeHtml(report.itemName)}</h1><div class="detail-image-frame">${reportImageFor(report, 'detail-image')}</div><p>${escapeHtml(report.description)}</p><div class="summary"><strong>REPORT DETAILS</strong><br>Category: ${escapeHtml(report.category)}<br>Location: ${escapeHtml(report.location || 'Not provided')}<br>Date: ${escapeHtml(reportDate(report))}<br>Status: ${escapeHtml(report.status || report.type)}${report.storageLocation ? `<br>Storage location: ${escapeHtml(report.storageLocation)}` : ''}</div></article>`);
    bindReportImageFallback(root);
    $('#detailsBack').onclick = () => render('browse');
  } catch (error) {
    toast('Unable to load this item. Please try again.');
  }
}
function bindDetails() { document.querySelectorAll('.view-report').forEach((button) => { button.onclick = () => showReportDetails(button.dataset.reportId); }); document.querySelectorAll('.claim-item').forEach((button) => { button.onclick = () => showClaimForm(button.dataset.itemId); }); bindReportImageFallback(); }
function showClaimForm(itemId, backPage = 'browse', matchContext = null) {
  const item = persistedReports.find((entry) => entry.id === itemId);
  if (!item) return toast('This item is unavailable.');
  const relatedMatch = matchContext?.matchId && matchContext?.lostReportId
    ? `<br>Potential match ID: ${escapeHtml(matchContext.matchId)}<br>Related lost report ID: ${escapeHtml(matchContext.lostReportId)}` : '';
  root.innerHTML = shell(`<button class="back" id="claimBack" type="button">← Back</button><h1 class="page-title">Claim ${escapeHtml(item.itemName)}</h1><p class="subtitle">This submits a separate ownership claim for admin review${matchContext ? '; the other reporter does not need to respond first' : ''}. Do not include identity documents, passwords, or other sensitive information.</p><form class="form-card" id="claimForm"><div class="summary"><strong>FOUND ITEM ID</strong>${escapeHtml(item.id)} · ${escapeHtml(item.itemName)}${relatedMatch}</div><input type="hidden" name="itemId" value="${escapeHtml(item.id)}"><div class="field"><label for="claimReason">Reason for claim</label><textarea id="claimReason" name="reason" minlength="10" maxlength="1200" required placeholder="When and where did you lose it?"></textarea></div><div class="field"><label for="claimEvidence">Ownership verification details</label><textarea id="claimEvidence" name="evidence" minlength="10" maxlength="1200" required placeholder="Describe a private identifying detail not shown in the public report."></textarea></div><p class="submit-error" id="claimError" role="alert"></p><button class="button" type="submit">Submit Claim for Admin Review</button></form>`);
  $('#claimBack').onclick = () => render(backPage);
  $('#claimForm').onsubmit = async (event) => { event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button[type=submit]'), error = $('#claimError'); button.disabled = true; button.textContent = 'Submitting…'; error.textContent = ''; try { await window.NexusFind.submitOwnershipClaim(itemId, form.reason.value, form.evidence.value, matchContext); toast('Your ownership claim was saved and sent for admin review.'); render('claims'); } catch (err) { error.textContent = err.message || 'Unable to submit this claim.'; button.disabled = false; button.textContent = 'Submit Claim for Admin Review'; } };
}
function claimStatus(status) { return `<span class="claim-status ${String(status).toLowerCase()}">${escapeHtml(status)}</span>`; }
function matchClaimCard(match) {
  const currentUid = window.NexusFind.currentUser?.()?.uid;
  const found = persistedReports.find((report) => report.id === match.foundReportId);
  const lost = persistedReports.find((report) => report.id === match.lostReportId);
  const hasPendingOwnershipClaim = claimsData.some((claim) => claim.itemId === match.foundReportId && claim.status === 'Pending');
  const ownRequest = match.claimedBy === currentUid;
  const canSubmitLinkedClaim = match.lostUserId === currentUid;
  const ownershipAction = canSubmitLinkedClaim && found && !found.reservedFor && !hasPendingOwnershipClaim
    ? `<div class="claim-decision-copy"><b>Want admin verification?</b><p>This match request is not an ownership claim. Submit the separate form with your explanation and private identifying details to send it to Admin Verification.</p><button class="small-button submit-admin-claim" data-item-id="${escapeHtml(found.id)}" data-match-id="${escapeHtml(match.id)}" data-lost-report-id="${escapeHtml(match.lostReportId)}" type="button">Submit ownership claim for admin review</button></div>` : '';
  const responseActions = match.status === 'claim_requested' && !ownRequest
    ? `<div class="admin-actions"><button class="button match-action" data-match-id="${escapeHtml(match.id)}" data-action="confirm" type="button">Confirm Match</button><button class="small-button match-action reject" data-match-id="${escapeHtml(match.id)}" data-action="reject" type="button">Not a Match</button></div>`
    : ownRequest && match.status === 'claim_requested' ? '<p class="subtitle">You sent this request. Waiting for the other reporter.</p>' : '';
  const requested = match.claimRequestedAt || match.updatedAt || match.createdAt;
  const status = match.status === 'claim_requested' ? (ownRequest ? 'Pending · waiting for reporter' : 'Pending · your response needed')
    : match.status === 'confirmed' ? 'Confirmed by reporter'
    : match.status === 'rejected' ? 'Rejected by reporter' : 'Recovered';
  const badge = match.status === 'rejected' ? 'rejected' : match.status === 'resolved' ? 'approved' : 'pending';
  const ownershipInfo = !canSubmitLinkedClaim ? '<p>Only the owner of the linked lost report can submit an ownership claim for this found item.</p>' : '';
  return `<article class="card my-claim-card match-claim-card"><div class="my-claim-photo">${found ? reportImageFor(found) : '<span class="image-placeholder">Found report unavailable</span>'}</div><div class="my-claim-copy"><div class="claim-row"><div><h2>Match request: ${escapeHtml(found?.itemName || 'Found item')}</h2><p>Match ID: ${escapeHtml(match.id)}</p></div><span class="claim-status ${badge}">${escapeHtml(status)}</span></div><p>Requested ${escapeHtml(relativeTime(requested))}${requested?.toDate ? ` · ${escapeHtml(requested.toDate().toLocaleDateString())}` : ''}</p><p>Related lost item: ${escapeHtml(lost?.itemName || match.lostReportId)}</p><p>This is a reporter confirmation request. Its status does not indicate that an ownership claim was submitted to an admin.</p>${ownershipInfo}<button class="small-button view-match" data-match-id="${escapeHtml(match.id)}" type="button">View Match</button>${responseActions}${ownershipAction}</div></article>`;
}
function claimsPage() {
  const currentUid = window.NexusFind.currentUser?.()?.uid;
  const matchRequests = matchesData.filter((match) => [match.lostUserId, match.foundUserId].includes(currentUid) && ['claim_requested', 'confirmed', 'rejected', 'resolved'].includes(match.status));
  const loading = !claimsLoaded || !matchesLoaded;
  const adminClaims = claimsData.map((claim) => {
    const item = claim.item || {};
    const pickup = claim.pickupStatus || 'Awaiting pickup coordination';
    return `<article class="card my-claim-card"><div class="my-claim-photo">${item.imageUrl ? reportImageFor(item) : '<span class="image-placeholder">No item photo</span>'}</div><div class="my-claim-copy"><div class="claim-row"><div><h2>${escapeHtml(claim.itemName || item.itemName || 'Found item')}</h2><p>Found report ID: ${escapeHtml(claim.itemId)}</p>${claim.matchId ? `<p>Match ID: ${escapeHtml(claim.matchId)} · Lost report ID: ${escapeHtml(claim.lostReportId)}</p>` : ''}</div>${claimStatus(claim.status)}</div><p>Submitted ${escapeHtml(relativeTime(claim.createdAt))}${claim.createdAt?.toDate ? ` · ${escapeHtml(claim.createdAt.toDate().toLocaleDateString())}` : ''}</p><p>${escapeHtml(item.description || 'Item details are unavailable.')}</p>${claim.decision ? `<div class="claim-decision-copy"><b>Admin decision:</b> ${escapeHtml(claim.decision)}${claim.decidedAt?.toDate ? ` · ${escapeHtml(claim.decidedAt.toDate().toLocaleString())}` : ''}${claim.decisionReason ? `<br><b>Reason:</b> ${escapeHtml(claim.decisionReason)}` : ''}</div>` : ''}${claim.status === 'Approved' ? `<div class="pickup-panel"><b>Pickup:</b> ${escapeHtml(pickup)}${claim.pickupDetails ? `<p>${escapeHtml(claim.pickupDetails)}</p>` : '<p>The admin will provide pickup details here.</p>'}${claim.pickupStatus === 'Coordinated' ? `<button class="small-button confirm-received" data-claim-id="${escapeHtml(claim.id)}" type="button">Confirm I received the item</button>` : ''}${claim.pickupStatus === 'Recovered' ? '<span class="claim-status approved">Recovered</span>' : ''}</div>` : ''}</div></article>`;
  });
  const empty = loading ? '<p class="subtitle claim-empty">Loading your claims…</p>' : '<p class="subtitle claim-empty">You have not submitted any ownership claims or match requests yet.</p>';
  const claimEmpty = claimsLoadError ? '<p class="subtitle claim-empty">Your ownership claims could not be loaded. Refresh to try again.</p>' : claimsLoaded ? '<p class="subtitle claim-empty">You have not submitted an ownership claim.</p>' : empty;
  const matchEmpty = matchesLoadError ? '<p class="subtitle claim-empty">Your match requests could not be loaded. Refresh to try again.</p>' : matchesLoaded ? '<p class="subtitle claim-empty">No match confirmation requests.</p>' : empty;
  root.innerHTML = shell(`<h1 class="page-title">My Claims</h1><p class="subtitle">Claims and match requests for your account. These use separate workflows and update from Firebase.</p><div class="section-heading matches-heading"><div><h2>Your ownership claims</h2><p>Claims you submitted for administrator review. To review all pending claims, use Admin Verification.</p></div></div><div class="claim-list">${adminClaims.join('') || claimEmpty}</div><div class="section-heading matches-heading"><div><h2>Match confirmation requests</h2><p>“This is My Item” requests awaiting another reporter’s response.</p></div></div><div class="claim-list">${matchRequests.map(matchClaimCard).join('') || matchEmpty}</div>`);
  bindReportImageFallback(root);
  document.querySelectorAll('.view-match').forEach((button) => button.onclick = () => showMatchDetails(button.dataset.matchId));
  document.querySelectorAll('.match-action').forEach((button) => button.onclick = async () => { const id=button.dataset.matchId; button.disabled=true; try { await window.NexusFind.updateMatchStatus(id,button.dataset.action); toast(button.dataset.action==='confirm'?'Match confirmed.':'Match response saved.'); render('claims'); } catch(error) { toast(error.message||'Unable to update match.'); button.disabled=false; } });
  document.querySelectorAll('.submit-admin-claim').forEach((button) => { button.onclick = () => showClaimForm(button.dataset.itemId, 'claims', { matchId: button.dataset.matchId, lostReportId: button.dataset.lostReportId }); });
  document.querySelectorAll('.confirm-received').forEach((button) => button.onclick = async () => {
    if (!window.confirm('Confirm that the item has been returned to you? This will mark the item Recovered.')) return;
    button.disabled = true;
    try { await window.NexusFind.confirmClaimReceived(button.dataset.claimId); toast('Receipt confirmed. The item is marked recovered.'); }
    catch (error) { toast(error.message || 'Unable to confirm receipt.'); button.disabled = false; }
  });
}
const matchReason = (field) => ({ category: 'Same category', itemName: 'Similar item name', color: 'Similar color', description: 'Similar description', location: 'Same or nearby location', date: 'Similar date' }[field] || field);
const matchLevel = (match) => match.matchLevel || (Number(match.score) >= 80 ? 'strong' : 'possible');
const matchLabel = (match) => matchLevel(match) === 'strong' ? 'Strong Match' : 'Possible Match';
function matchCard(match) {
  const current = window.NexusFind.currentUser?.();
  const ownIsLost = match.lostUserId === current?.uid;
  const own = persistedReports.find((report) => report.id === (ownIsLost ? match.lostReportId : match.foundReportId));
  const other = persistedReports.find((report) => report.id === (ownIsLost ? match.foundReportId : match.lostReportId));
  const display = other || own;
  const lost = persistedReports.find((report) => report.id === match.lostReportId);
  const found = persistedReports.find((report) => report.id === match.foundReportId);
  const evidence = [lost, found].filter((report) => report && getReportImage(report)).map((report) => `<div class="match-image"><span>${report.type === 'lost' ? 'Lost image' : 'Found image'}</span>${reportImageFor(report)}</div>`).join('');
  const claimAction = ownIsLost && found && !found.reservedFor && !claimsData.some((claim) => claim.itemId === found.id && claim.status === 'Pending') ? `<button class="small-button claim-item" data-item-id="${escapeHtml(found.id)}" type="button">Submit Admin Ownership Claim</button>` : '';
  return `<article class="card match-card"><div class="match-card-top"><span class="match-level-badge ${matchLevel(match)}">${matchLabel(match)}</span><strong>${Number(match.score) || 0}% match</strong></div>${evidence ? `<div class="match-card-images">${evidence}</div>` : ''}<h3>${escapeHtml(display?.itemName || 'Report unavailable')}</h3><div class="place">${escapeHtml(display?.location || 'Location not provided')}</div><div class="meta"><span class="tag">${escapeHtml(display?.category || 'Category unavailable')}</span><span>${escapeHtml(reportDate(display || {}))}</span></div>${display?.color ? `<p class="match-color">Color: ${escapeHtml(display.color)}</p>` : ''}<p class="match-status">Status: ${escapeHtml((match.status || 'potential').replace('_', ' '))}</p><div class="match-reasons">${(match.matchedFields || []).map((field) => `<span>✓ ${escapeHtml(matchReason(field))}</span>`).join('')}</div><button class="small-button view-match" data-match-id="${escapeHtml(match.id)}" type="button">View Details</button>${claimAction}</article>`;
}
async function showMatchDetails(id) {
  try {
    const match = await window.NexusFind.getMatchDetails(id);
    const current = window.NexusFind.currentUser?.();
    const isParticipant = [match.lostUserId, match.foundUserId].includes(current?.uid);
    const sameReporter = match.lostUserId === match.foundUserId;
    const status = match.status || 'potential';
    const ownClaim = match.claimedBy === current?.uid;
    const actions = !isParticipant ? '' : status === 'potential'
      ? sameReporter ? '<p class="subtitle">Both reports are from your account. Review the details to verify this suggestion.</p><button class="small-button match-action" data-action="reject" type="button">Not a Match</button>' : current?.uid === match.lostUserId ? '<button class="button match-action" data-action="claim" type="button">Ask Found Reporter to Confirm</button><button class="small-button match-action" data-action="reject" type="button">Not a Match</button>' : '<p class="subtitle">The lost report owner can ask you to confirm this match. Only that owner can submit a linked ownership claim.</p>'
      : status === 'claim_requested' ? (ownClaim ? '<p class="subtitle">Match request sent. Waiting for the other reporter. Admin ownership claims appear in My Claims under their separate section.</p>' : '<button class="button match-action" data-action="confirm" type="button">Confirm Match</button><button class="small-button match-action" data-action="reject" type="button">Not a Match</button>')
      : status === 'confirmed' ? '<button class="button match-action" data-action="resolve" type="button">Mark as Recovered</button>' : '';
    const hasPendingOwnershipClaim = claimsData.some((claim) => claim.itemId === match.foundReportId && claim.status === 'Pending');
    const adminClaimAction = match.lostUserId === current?.uid && match.foundUserId !== current?.uid && match.foundReport?.type === 'found'
      && !match.foundReport.reservedFor && !hasPendingOwnershipClaim
      ? `<p class="subtitle">Need an admin to verify ownership? Submit a separate ownership claim with private identifying details. It can be reviewed while the match request is pending.</p><button class="small-button submit-admin-claim" data-item-id="${escapeHtml(match.foundReportId)}" data-match-id="${escapeHtml(match.id)}" data-lost-report-id="${escapeHtml(match.lostReportId)}" type="button">Submit Admin Ownership Claim</button>` : '';
    const reportSection = (title, report) => `<section class="match-report"><h2>${title}</h2><span class="badge ${report.type}">${report.type === 'lost' ? 'Lost report' : 'Found report'}</span><div class="detail-image-frame">${reportImageFor(report, 'detail-image')}</div><h3>${escapeHtml(report.itemName || 'Item')}</h3><p><b>Category:</b> ${escapeHtml(report.category || 'Not provided')}</p><p><b>Location:</b> ${escapeHtml(report.location || 'Not provided')}</p><p><b>Date:</b> ${escapeHtml(reportDate(report))}</p></section>`;
    root.innerHTML = shell(`<button class="back" id="matchesBack" type="button">← Back to My Reports</button><h1 class="page-title">${matchLabel(match)}</h1><p class="subtitle">Please verify these details. This is a suggested connection, not confirmation that the item has been recovered.</p><div class="match-score-panel"><strong>Match score: ${Number(match.score) || 0}%</strong><p>Why this may be a match</p><div class="match-reasons">${(match.matchedFields || []).map((field) => `<span>✓ ${escapeHtml(matchReason(field))}</span>`).join('') || '<span>No comparable fields were recorded.</span>'}</div><p class="match-status">Status: ${escapeHtml(status.replace('_', ' '))}</p></div><div class="match-details-grid">${reportSection('Your Lost Item', match.lostReport)}${reportSection('Matching Found Item', match.foundReport)}</div><div class="match-actions">${actions}${adminClaimAction}</div>`);
    bindReportImageFallback(root);
    $('#matchesBack').onclick = () => render('my-reports');
    document.querySelectorAll('.submit-admin-claim').forEach((button) => { button.onclick = () => showClaimForm(button.dataset.itemId, 'my-reports', { matchId: button.dataset.matchId, lostReportId: button.dataset.lostReportId }); });
    document.querySelectorAll('.match-action').forEach((button) => button.onclick = async () => { button.disabled = true; try { await window.NexusFind.updateMatchStatus(id, button.dataset.action); toast(button.dataset.action === 'claim' ? 'Match request sent to the other reporter.' : 'Match status updated.'); await showMatchDetails(id); } catch (error) { console.error('Unable to update match:', error); toast(error.message || 'Unable to update match. Please try again.'); button.disabled = false; } });
  } catch (error) { console.error('Unable to load match:', error); toast(error.message || 'Unable to load this potential match.'); }
}
function myReports() {
  const currentUser = window.NexusFind.currentUser?.();
  const mine = persistedReports.filter((report) => report.userId === currentUser?.uid);
  const myMatches = matchesData.filter((match) => match.lostUserId === currentUser?.uid || match.foundUserId === currentUser?.uid);
  const matchText = myMatches.length ? `You have ${myMatches.length} potential match${myMatches.length === 1 ? '' : 'es'}.` : 'No potential matches yet. We’ll check new opposite type reports as they are submitted.';
  root.innerHTML = shell(`<h1 class="page-title">My Reports</h1><p class="subtitle">Reports you have submitted</p><div class="items-grid browse-grid">${mine.map(persistedItemCard).join('') || '<p class="subtitle">You have not submitted any reports yet.</p>'}</div><div class="section-heading matches-heading"><div><h2>Ownership Claims</h2><p>Review the current status of your claims.</p></div><button class="small-button go" data-go="claims">View Claims</button></div><div class="claim-list">${claimsData.map((claim) => `<article class="form-card claim-row"><strong>${escapeHtml(claim.itemName || 'Found item')}</strong>${claimStatus(claim.status)}</article>`).join('') || '<p class="subtitle">No claims submitted.</p>'}</div><div class="section-heading matches-heading"><div><h2>Potential Matches</h2><p>${matchText}</p></div></div><div class="items-grid browse-grid matches-grid">${myMatches.map(matchCard).join('') || '<p class="subtitle">Don’t worry. We’ll check new found reports as they are submitted.</p>'}</div>`);
  bindDetails();
  document.querySelectorAll('.view-match').forEach((button) => button.onclick = () => showMatchDetails(button.dataset.matchId));
}
let lostDraft = {};

function renderLostStep(step) {
  const form = $('#lostForm');
  const fields = step === 1
    ? `<div class="form-grid"><div class="field wide"><label>Item Name</label><input class="input" id="lostItemName" value="${escapeHtml(lostDraft.itemName || '')}" placeholder="e.g. Earphones, Keys, Wallet..." required></div><div class="field wide"><label>Category</label><select id="lostCategory" required><option value="">Select category</option><option>Electronics</option><option>Keys</option><option>Bags & Backpacks</option><option>ID Cards</option><option>Personal Items</option></select></div><div class="field wide"><label>Description</label><textarea id="lostDescription" placeholder="Describe distinguishing features..." required>${escapeHtml(lostDraft.description || '')}</textarea></div><div class="field wide"><label>Identifying details</label><input class="input" id="lostIdentifying" value="${escapeHtml(lostDraft.identifyingDetails || '')}" placeholder="Color, brand, sticker, scratches..."></div><div class="field wide"><label>Item image (optional)</label><input class="input" id="lostImage" type="file" accept="image/png,image/jpeg"><div class="image-preview" id="lostImagePreview"></div><small class="subtitle">PNG or JPG, up to 5MB.</small></div><div class="field wide"><label>Reward (Optional)</label><input class="input" id="lostReward" value="${escapeHtml(lostDraft.reward || '')}" placeholder="e.g. ₹500"></div></div>`
    : step === 2
      ? `<div class="form-grid"><div class="field wide"><label>Last Seen Location</label><select id="lostLocation" required><option value="">Select location</option><option>Library</option><option>Canteen</option><option>Classroom</option><option>Parking Area</option><option>Computer Lab</option></select></div><div class="field wide"><label>Specific Landmark / Area</label><input class="input" id="lostLandmark" value="${escapeHtml(lostDraft.landmark || '')}" placeholder="e.g. Near window seat, 2nd floor..."></div><div class="field"><label>Date Lost</label><input type="date" class="input" id="lostDate" value="${escapeHtml(lostDraft.dateLost || '')}" required></div><div class="field"><label>Approximate time</label><input type="time" class="input" id="lostTime" value="${escapeHtml(lostDraft.approximateTime || '')}"></div><div class="hint">💡 &nbsp; The more precise your location, the higher the chance of a match.</div></div>`
      : `<div class="form-grid"><div class="summary"><strong>REPORT SUMMARY</strong>Item: ${escapeHtml(lostDraft.itemName || '—')}<br>Category: ${escapeHtml(lostDraft.category || '—')}<br>Location: ${escapeHtml(lostDraft.location || '—')}<br>Date: ${escapeHtml(lostDraft.dateLost || '—')}</div><p class="subtitle wide">Your account will be used as the report owner. Contact details remain private.</p></div>`;
  form.innerHTML = `${fields}<p class="submit-error" id="lostSubmitError" role="alert" aria-live="polite"></p><div class="form-actions">${step > 1 ? '<button type="button" class="back" id="prev">← Back</button>' : '<span></span>'}<button class="button" type="submit">${step === 3 ? 'Submit Report' : 'Continue →'}</button></div>`;
  if (step === 1) {
    $('#lostCategory').value = lostDraft.category || '';
    $('#lostCategory').closest('.field').insertAdjacentHTML('afterend', `<div class="field"><label>Color (optional)</label><input class="input" id="lostColor" value="${escapeHtml(lostDraft.color || '')}" placeholder="e.g. Black"></div>`);
    $('#lostIdentifying').placeholder = 'Private verification details';
  }
  if (step === 2) $('#lostLocation').value = lostDraft.location || '';
  if (step === 1) bindImagePreview($('#lostImage'), $('#lostImagePreview'), () => lostDraft.imageFile || null, (file) => { lostDraft.imageFile = file; });
  [...document.querySelectorAll('.progress-step')].forEach((el, i) => { el.classList.toggle('active', i === step - 1); el.classList.toggle('done', i < step - 1); el.querySelector('.progress-dot').textContent = i < step - 1 ? '✓' : i + 1; });
  [...document.querySelectorAll('.progress-line')].forEach((el, i) => el.classList.toggle('done', i < step - 1));
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (step === 1) Object.assign(lostDraft, { itemName: $('#lostItemName').value, category: $('#lostCategory').value, description: $('#lostDescription').value, reward: $('#lostReward').value });
    if (step === 1) lostDraft.color = $('#lostColor').value;
    if (step === 1) { const file = $('#lostImage').files[0]; if (file) lostDraft.imageFile = file; Object.assign(lostDraft, { identifyingDetails: $('#lostIdentifying').value }); }
    if (step === 2) Object.assign(lostDraft, { location: $('#lostLocation').value, landmark: $('#lostLandmark').value, approximateTime: $('#lostTime').value, dateLost: $('#lostDate').value });
    if (!form.checkValidity()) { form.reportValidity(); return; }
    if (step < 3) { renderLostStep(step + 1); return; }
    const submitButton = $('button[type="submit"]', form);
    const errorElement = $('#lostSubmitError', form);
    submitButton.disabled = true; submitButton.textContent = 'Submitting...';
    try {
      console.info('[REPORT] Submit started');
      const result = await window.NexusFind.createItemReport({ ...lostDraft, type: 'lost' });
      console.info('[REPORT] Submission completed:', result.id);
      toast('Your lost item report was submitted!'); releaseImagePreview(lostDraft.imageFile); lostDraft = {}; render('my-reports');
    } catch (error) {
      console.error('[REPORT] Lost report submission failed:', error);
      if (errorElement) errorElement.textContent = reportSubmissionError(error);
      toast(reportSubmissionError(error));
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Submit Report';
    }
  };
  const previous = $('#prev'); if (previous) previous.onclick = () => renderLostStep(step - 1);
}

function found() {
  let foundImageFile = null;
  root.innerHTML = shell(`${reportHeader('found')}<form class="form-card" id="foundForm"><div class="form-grid"><div class="field"><label>Item Name</label><input class="input" id="foundItemName" placeholder="e.g. Silver water bottle" required></div><div class="field"><label>Category</label><select id="foundCategory" required><option value="">Select category</option><option>Electronics</option><option>Keys</option><option>Bags & Backpacks</option><option>ID Cards</option><option>Personal Items</option></select></div><div class="field wide"><label>Description</label><textarea id="foundDescription" placeholder="Describe distinguishing features..." required></textarea></div><div class="field wide"><label>Identifying details</label><input class="input" id="foundIdentifying" placeholder="Color, brand, sticker, scratches..."></div><div class="field wide"><label>Item image (optional)</label><input class="input" id="foundImage" type="file" accept="image/png,image/jpeg"><div class="image-preview" id="foundImagePreview"></div><small class="subtitle">PNG or JPG, up to 5MB.</small></div><div class="field"><label>Location Found</label><input class="input" id="foundLocation" placeholder="e.g. Cafeteria" required></div><div class="field"><label>Date Found</label><input type="date" class="input" id="foundDate" required></div><div class="field"><label>Approximate time</label><input type="time" class="input" id="foundTime"></div><div class="field wide"><label>Current Storage Location</label><input class="input" id="foundStorage" placeholder="e.g. Security desk, Block A"></div></div><p class="submit-error" id="foundSubmitError" role="alert" aria-live="polite"></p><div class="form-actions"><span></span><button class="button" type="submit">Submit found item</button></div></form>`, 'form-page');
  const form = $('#foundForm');
  $('#foundCategory').closest('.field').insertAdjacentHTML('afterend', '<div class="field"><label>Color (optional)</label><input class="input" id="foundColor" placeholder="e.g. Black"></div>');
  $('#foundIdentifying').placeholder = 'Private verification details';
  bindImagePreview($('#foundImage'), $('#foundImagePreview'), () => foundImageFile, (file) => { foundImageFile = file; });
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const submitButton = $('button[type="submit"]', form);
    const errorElement = $('#foundSubmitError', form);
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';
    try {
      console.info('[REPORT] Submit started');
      const result = await window.NexusFind.createItemReport({ type: 'found', itemName: $('#foundItemName').value, category: $('#foundCategory').value, color: $('#foundColor').value, description: $('#foundDescription').value, identifyingDetails: $('#foundIdentifying').value, imageFile: foundImageFile, location: $('#foundLocation').value, dateFound: $('#foundDate').value, approximateTime: $('#foundTime').value, storageLocation: $('#foundStorage').value });
      console.info('[REPORT] Submission completed:', result.id);
      toast('Thank you for reporting this found item!');
      releaseImagePreview(foundImageFile);
      foundImageFile = null;
      render('my-reports');
    } catch (error) {
      console.error('[REPORT] Found report submission failed:', error);
      if (errorElement) errorElement.textContent = reportSubmissionError(error);
      toast(reportSubmissionError(error));
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Submit found item';
    }
  };
}

function reportSubmissionError(error) {
  if (/image upload failed/i.test(error?.message || '')) return 'Image upload failed. Please try again.';
  if (error?.code === 'permission-denied' || error?.code === 'firestore/permission-denied') return 'Unable to submit your report. Your account may not have permission to create reports.';
  if (error?.code === 'unavailable' || error?.code === 'firestore/unavailable' || error?.code === 'auth/network-request-failed') return 'Unable to reach Firebase. Check your connection and try again.';
  if (/sign in|authenticated/i.test(error?.message || '')) return 'Please log in before submitting a report.';
  return 'Unable to submit your report. Please try again.';
}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000)}
window.NexusFind.watchItemReports((items) => {
  persistedReports = items.filter((item) => item.type === 'lost' || item.type === 'found');
  const activePage = document.querySelector('.nav-link.active')?.dataset.page;
  if (activePage === 'browse') render('browse');
  if (activePage === 'my-reports') render('my-reports');
  if (activePage === 'home') render('home');
}, (error) => {
  console.error('Unable to load item reports:', error);
  toast('Unable to load reports. Please refresh and try again.');
});
function updateNotificationCount() {
  const unread = notificationsData.filter((notification) => !notification.read).length;
  document.querySelectorAll('.notify-link em, .notify-link i b').forEach((badge) => {
    badge.textContent = unread;
    badge.hidden = unread === 0;
  });
}
window.NexusFind.watchNotifications((notifications) => {
  notificationsData = notifications;
  updateNotificationCount();
  if (document.querySelector('.nav-link.active')?.dataset.page === 'notifications') render('notifications');
}, (error) => {
  console.error('Unable to load notifications:', error);
  toast('Unable to load notifications. Please refresh and try again.');
});
window.NexusFind.watchMatchesForUser((matches, loading = false) => {
  matchesData = matches;
  matchesLoaded = !loading;
  if (loading) matchesLoadError = false;
  const page = document.querySelector('.nav-link.active')?.dataset.page;
  if (['my-reports', 'matches'].includes(page)) render('my-reports');
  if (page === 'claims') render('claims');
}, (error) => {
  matchesLoadError = true;
  console.error('Unable to load potential matches:', error);
  if (document.querySelector('.nav-link.active')?.dataset.page === 'claims') render('claims');
  toast('Potential matches could not be updated right now.');
});
document.querySelector('.sidebar-bottom a')?.addEventListener('click', (event) => { event.preventDefault(); render('my-reports'); });
window.NexusFind.watchClaimsForUser((claims, loading = false) => { claimsData = claims; claimsLoaded = !loading; if (loading) claimsLoadError = false; const page = document.querySelector('.nav-link.active')?.dataset.page; if (['claims', 'my-reports', 'browse'].includes(page)) render(page); }, (error) => { claimsLoadError = true; console.error('Unable to load ownership claims:', error); const page = document.querySelector('.nav-link.active')?.dataset.page; if (page === 'claims') render('claims'); toast('Claims could not be loaded. Please refresh and try again.'); });
document.querySelectorAll('.nav-link').forEach(b=>b.onclick=()=>render(b.dataset.page));function applyLogoTheme(){const light=document.body.dataset.theme==='light';const logo=light?'images/logo_nexusfind_light.png':'images/logo_nexusfind.png';document.querySelectorAll('.brand-logo,.mobile-logo,.auth-logo').forEach(img=>{img.src=logo})}function toggleTheme(){const light=document.body.dataset.theme==='light';document.body.dataset.theme=light?'':'light';localStorage.nexusTheme=light?'dark':'light';document.querySelectorAll('#themeToggle span').forEach(s=>s.textContent=light?'Light mode':'Dark mode');applyLogoTheme()}$('#themeToggle').onclick=toggleTheme;$('#mobileTheme').onclick=toggleTheme;$('#mobileMenu').onclick=()=>$('#sidebar').classList.toggle('open');if(localStorage.nexusTheme==='light')document.body.dataset.theme='light';applyLogoTheme();home();bindGo();
