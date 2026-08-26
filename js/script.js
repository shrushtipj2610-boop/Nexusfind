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
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const reportDate = (report) => report.dateFound || report.dateLost || 'Date not provided';
const persistedItemCard = (report) => {
  const type = report.type === 'found' ? 'found' : 'lost';
  const visual = report.imageUrl ? `<img src="${escapeHtml(report.imageUrl)}" alt="${escapeHtml(report.itemName)}">` : (type === 'found' ? '✓' : '○');
  return `<article class="card item-card"><div class="item-image ${type}"><span class="badge ${type}">${type[0].toUpperCase() + type.slice(1)}</span>${visual}</div><div class="item-content"><h3>${escapeHtml(report.itemName)}</h3><p>${escapeHtml(report.description)}</p><div class="place">${escapeHtml(report.location || 'Location not provided')}</div><div class="meta"><span class="tag">${escapeHtml(report.category)}</span><span>${escapeHtml(reportDate(report))}</span></div><button class="small-button view-report" data-report-id="${escapeHtml(report.id)}" type="button">View Details</button></div></article>`;
};
const shell = (body, cls='') => `<div class="page ${cls}">${body}</div>`;
function home(){const recent=persistedReports.slice(0,4);root.innerHTML=shell(`<div class="hero"><span class="eyebrow">189 active reports right now</span><h1>Lost something?<span class="gradient-text">Find it with NexusFind</span></h1><p class="lead">Your college's smart lost & found system. Report lost items, browse found items, and get reunited — fast.</p><div class="action-row"><button class="button go" data-go="lost">📋 &nbsp; Report Lost Item</button><button class="button outline go" data-go="found">✅ &nbsp; Report Found Item</button></div><label class="search">🔍 <input id="homeSearch" placeholder="Search for lost or found items..." /></label></div><div class="section-heading"><div><h2>Recent Reports</h2><p>Latest activity from campus</p></div><button class="small-button go" data-go="browse">View All Items →</button></div><div class="items-grid">${recent.map(persistedItemCard).join('') || '<p class="subtitle">No recent reports yet.</p>'}</div><div class="how-it-works"><h2>How It Works</h2><p>Simple 3-step process to recover your items</p><div class="steps"><div class="step-card"><div class="emoji">📝</div><small>STEP 01</small><h3>Report Your Item</h3></div><div class="step-card"><div class="emoji">🔍</div><small>STEP 02</small><h3>Smart Matching</h3></div><div class="step-card"><div class="emoji">🔔</div><small>STEP 03</small><h3>Get Connected</h3></div></div></div>`,'home');bindDetails();}
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
  const found = notification.type === 'found_report';
  return `<button class="notification ${notification.read ? 'read' : ''} open-notification" data-notification-id="${escapeHtml(notification.id)}" data-report-id="${escapeHtml(notification.reportId)}" type="button"><div class="notice-icon">${found ? '🔵' : '🔴'}</div><div class="notice-copy"><h3>${escapeHtml(notification.title)}</h3><p>${escapeHtml(notification.message)}</p></div><time class="notice-time ${notification.read ? '' : 'unread'}">${relativeTime(notification.createdAt)}</time></button>`;
}
function notifications(){const unread=notificationsData.filter((notification)=>!notification.read).length;root.innerHTML=shell(`<div class="notification-toolbar"><div><h1 class="page-title">Notifications</h1><p class="subtitle">${unread ? `<b>${unread}</b> unread notifications` : 'No unread notifications'}</p></div><div class="tabs"><button class="tab active" data-notification-filter="all">All</button><button class="tab" data-notification-filter="unread">Unread</button></div></div><div class="notification-list" id="notificationList">${notificationsData.map(notificationCard).join('') || '<p class="subtitle">No notifications yet.</p>'}</div>`);bindNotifications()}
function bindNotifications(){let filter='all';const apply=()=>{$('#notificationList').innerHTML=notificationsData.filter((notification)=>filter==='all'||!notification.read).map(notificationCard).join('') || '<p class="subtitle">No unread notifications.</p>';document.querySelectorAll('.open-notification').forEach((button)=>{button.onclick=async()=>{try{await window.NexusFind.markNotificationRead(button.dataset.notificationId);await showReportDetails(button.dataset.reportId)}catch(error){console.error('Unable to open notification:',error);toast('Unable to open this notification. Please try again.')}}})};document.querySelectorAll('[data-notification-filter]').forEach((button)=>button.onclick=()=>{filter=button.dataset.notificationFilter;document.querySelectorAll('[data-notification-filter]').forEach((tab)=>tab.classList.toggle('active',tab===button));apply()});apply()}
const pages={home,browse,lost,found,notifications,'my-reports':myReports};function setActive(page){document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.page===page));}
function render(page){pages[page]();setActive(page);$('#sidebar').classList.remove('open');window.scrollTo({top:0,behavior:'smooth'});bindGo()}
function bindGo(){document.querySelectorAll('.go').forEach(b=>b.onclick=()=>render(b.dataset.go));const hs=$('#homeSearch');if(hs)hs.onkeydown=e=>{if(e.key==='Enter')render('browse')}}
function bindBrowse(){let f='all';const apply=()=>{const q=$('#browseSearch').value.toLowerCase();const t=$('#typeFilter').value;const category=$('#categoryFilter').value;const location=$('#locationFilter').value;const status=$('#statusFilter').value;const view=persistedReports.filter((report)=>(f==='all'||report.type===f)&&(t==='all'||report.type===t)&&(category==='all'||report.category===category)&&(location==='all'||report.location===location)&&(status==='all'||report.status===status)&&[report.itemName,report.category,report.description,report.location].join(' ').toLowerCase().includes(q));$('#browseGrid').innerHTML=view.map(persistedItemCard).join('') || '<p class="subtitle">No matching reports found.</p>';$('#resultCount').textContent=view.length;bindDetails()};$('#browseSearch').oninput=apply;['#typeFilter','#categoryFilter','#locationFilter','#statusFilter'].forEach((selector)=>$(selector).onchange=apply);document.querySelectorAll('.tab[data-filter]').forEach(b=>b.onclick=()=>{f=b.dataset.filter;document.querySelectorAll('.tab[data-filter]').forEach(x=>x.classList.toggle('active',x===b));apply()});bindDetails()}
async function showReportDetails(id) {
  try {
    const report = await window.NexusFind.getItemReport(id);
    const type = report.type === 'found' ? 'FOUND' : 'LOST';
    root.innerHTML = shell(`<button class="back" id="detailsBack" type="button">← Back to Browse</button><article class="form-card"><span class="badge ${report.type}">${type}</span><h1 class="page-title">${escapeHtml(report.itemName)}</h1>${report.imageUrl ? `<img class="detail-image" src="${escapeHtml(report.imageUrl)}" alt="${escapeHtml(report.itemName)}">` : ''}<p>${escapeHtml(report.description)}</p><div class="summary"><strong>REPORT DETAILS</strong><br>Category: ${escapeHtml(report.category)}<br>Location: ${escapeHtml(report.location || 'Not provided')}<br>Date: ${escapeHtml(reportDate(report))}<br>Status: ${escapeHtml(report.status || report.type)}${report.storageLocation ? `<br>Storage location: ${escapeHtml(report.storageLocation)}` : ''}</div></article>`);
    $('#detailsBack').onclick = () => render('browse');
  } catch (error) {
    toast('Unable to load this item. Please try again.');
  }
}
function bindDetails() { document.querySelectorAll('.view-report').forEach((button) => { button.onclick = () => showReportDetails(button.dataset.reportId); }); }
function myReports() {
  const currentUser = window.NexusFind.currentUser?.();
  const mine = persistedReports.filter((report) => report.userId === currentUser?.uid);
  root.innerHTML = shell(`<h1 class="page-title">My Reports</h1><p class="subtitle">Reports you have submitted</p><div class="items-grid browse-grid">${mine.map(persistedItemCard).join('') || '<p class="subtitle">You have not submitted any reports yet.</p>'}</div>`);
  bindDetails();
}
let lostDraft = {};

function renderLostStep(step) {
  const form = $('#lostForm');
  const fields = step === 1
    ? `<div class="form-grid"><div class="field wide"><label>Item Name</label><input class="input" id="lostItemName" value="${lostDraft.itemName || ''}" placeholder="e.g. Earphones, Keys, Wallet..." required></div><div class="field wide"><label>Category</label><select id="lostCategory" required><option value="">Select category</option><option>Electronics</option><option>Keys</option><option>Bags & Backpacks</option><option>ID Cards</option><option>Personal Items</option></select></div><div class="field wide"><label>Description</label><textarea id="lostDescription" placeholder="Describe distinguishing features..." required>${lostDraft.description || ''}</textarea></div><div class="field wide"><label>Reward (Optional)</label><input class="input" id="lostReward" value="${lostDraft.reward || ''}" placeholder="e.g. ₹500"></div></div>`
    : step === 2
      ? `<div class="form-grid"><div class="field wide"><label>Last Seen Location</label><select id="lostLocation" required><option value="">Select location</option><option>Library</option><option>Canteen</option><option>Classroom</option><option>Parking Area</option><option>Computer Lab</option></select></div><div class="field wide"><label>Specific Landmark / Area</label><input class="input" id="lostLandmark" value="${lostDraft.landmark || ''}" placeholder="e.g. Near window seat, 2nd floor..."></div><div class="field wide"><label>Date Lost</label><input type="date" class="input" id="lostDate" value="${lostDraft.dateLost || ''}" required></div><div class="hint">💡 &nbsp; The more precise your location, the higher the chance of a match.</div></div>`
      : `<div class="form-grid"><div class="field wide"><label>Your Name</label><input class="input" id="lostName" value="${lostDraft.name || ''}" placeholder="Full name" required></div><div class="field wide"><label>College Email</label><input type="email" class="input" id="lostEmail" value="${lostDraft.email || ''}" placeholder="you@college.edu" required></div><div class="field wide"><label>Phone Number</label><input class="input" id="lostPhone" value="${lostDraft.phone || ''}" placeholder="+91 98765 43210" required></div><div class="summary"><strong>REPORT SUMMARY</strong>Item: ${lostDraft.itemName || '—'}<br>Category: ${lostDraft.category || '—'}<br>Location: ${lostDraft.location || '—'}<br>Date: ${lostDraft.dateLost || '—'}</div></div>`;
  form.innerHTML = `${fields}<div class="form-actions">${step > 1 ? '<button type="button" class="back" id="prev">← Back</button>' : '<span></span>'}<button class="button" type="submit">${step === 3 ? 'Submit Report' : 'Continue →'}</button></div>`;
  if (step === 1) $('#lostCategory').value = lostDraft.category || '';
  if (step === 2) $('#lostLocation').value = lostDraft.location || '';
  [...document.querySelectorAll('.progress-step')].forEach((el, i) => { el.classList.toggle('active', i === step - 1); el.classList.toggle('done', i < step - 1); el.querySelector('.progress-dot').textContent = i < step - 1 ? '✓' : i + 1; });
  [...document.querySelectorAll('.progress-line')].forEach((el, i) => el.classList.toggle('done', i < step - 1));
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (step === 1) Object.assign(lostDraft, { itemName: $('#lostItemName').value, category: $('#lostCategory').value, description: $('#lostDescription').value, reward: $('#lostReward').value });
    if (step === 2) Object.assign(lostDraft, { location: $('#lostLocation').value, landmark: $('#lostLandmark').value, dateLost: $('#lostDate').value });
    if (step === 3) Object.assign(lostDraft, { name: $('#lostName').value, email: $('#lostEmail').value, phone: $('#lostPhone').value });
    if (!form.checkValidity()) { form.reportValidity(); return; }
    if (step < 3) { renderLostStep(step + 1); return; }
    const submitButton = $('button[type="submit"]', form); submitButton.disabled = true; submitButton.textContent = 'Submitting...';
    try {
      await window.NexusFind.createItemReport({ ...lostDraft, type: 'lost' });
      toast('Your lost item report was submitted!'); lostDraft = {}; home(); setActive('home'); bindGo();
    } catch (error) { console.error('Unable to submit lost report:', error); toast('Unable to submit your lost item. Please try again.'); submitButton.disabled = false; submitButton.textContent = 'Submit Report'; }
  };
  const previous = $('#prev'); if (previous) previous.onclick = () => renderLostStep(step - 1);
}

function found() {
  root.innerHTML = shell(`${reportHeader('found')}<form class="form-card" id="foundForm"><div class="form-grid"><div class="field"><label>Item Name</label><input class="input" id="foundItemName" placeholder="e.g. Silver water bottle" required></div><div class="field"><label>Category</label><select id="foundCategory" required><option value="">Select category</option><option>Electronics</option><option>Keys</option><option>Bags & Backpacks</option><option>ID Cards</option><option>Personal Items</option></select></div><div class="field wide"><label>Description</label><textarea id="foundDescription" placeholder="Describe distinguishing features..." required></textarea></div><div class="field wide"><label>Upload Image</label><label class="upload"><span><span class="upload-icon">⇧</span><b>Click to upload · PNG, JPG up to 5MB</b></span><input id="foundImage" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" hidden></label><p class="upload-status" id="foundImageStatus" role="status" aria-live="polite"></p><img class="upload-preview" id="foundImagePreview" alt="Uploaded image preview" hidden></div><div class="field"><label>Location Found</label><input class="input" id="foundLocation" placeholder="e.g. Cafeteria" required></div><div class="field"><label>Date Found</label><input type="date" class="input" id="foundDate" required></div><div class="field wide"><label>Current Storage Location</label><input class="input" id="foundStorage" placeholder="e.g. Security desk, Block A" required></div></div><div class="form-actions"><span></span><button class="button" type="submit">Submit found item</button></div></form>`, 'form-page');
  const form = $('#foundForm'); const imageInput = $('#foundImage');
  const imageStatus = $('#foundImageStatus'); const preview = $('#foundImagePreview');
  let selectedImage = null; let uploadedImageUrl = null; let uploadPromise = null; let uploadVersion = 0;
  imageInput.onchange = () => {
    const file = imageInput.files[0];
    const version = ++uploadVersion;
    selectedImage = file || null; uploadedImageUrl = null; preview.hidden = true; preview.removeAttribute('src');
    if (!file) { imageStatus.textContent = ''; return; }
    imageStatus.textContent = `Uploading ${file.name}… 0%`;
    uploadPromise = window.NexusFind.uploadItemImage(file, (progress) => { if (version === uploadVersion) imageStatus.textContent = `Uploading ${file.name}… ${progress}%`; })
      .then((url) => { if (version === uploadVersion) { uploadedImageUrl = url; preview.src = url; preview.hidden = false; imageStatus.textContent = `Upload successful: ${file.name}`; } })
      .catch((error) => { if (version === uploadVersion) { console.error('Unable to upload found item image:', error); imageStatus.textContent = `Upload failed: ${error.message}`; } });
  };
  form.onsubmit = async (event) => {
    event.preventDefault(); if (!form.checkValidity()) { form.reportValidity(); return; }
    if (uploadPromise) await uploadPromise;
    if (selectedImage && !uploadedImageUrl) return;
    const submitButton = $('button[type="submit"]', form); submitButton.disabled = true; submitButton.textContent = 'Submitting...';
    try {
      await window.NexusFind.createItemReport({ type: 'found', itemName: $('#foundItemName').value, category: $('#foundCategory').value, description: $('#foundDescription').value, location: $('#foundLocation').value, dateFound: $('#foundDate').value, storageLocation: $('#foundStorage').value }, null, uploadedImageUrl);
      toast('Thank you for reporting this found item!'); render('browse');
    } catch (error) { console.error('Unable to submit found report:', error); toast(`Unable to submit your found item: ${error.message}`); submitButton.disabled = false; submitButton.textContent = 'Submit found item'; }
  };
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
document.querySelector('.sidebar-bottom a')?.addEventListener('click', (event) => { event.preventDefault(); render('my-reports'); });
document.querySelectorAll('.nav-link').forEach(b=>b.onclick=()=>render(b.dataset.page));function applyLogoTheme(){const light=document.body.dataset.theme==='light';const logo=light?'images/logo_nexusfind_light.png':'images/logo_nexusfind.png';document.querySelectorAll('.brand-logo,.mobile-logo,.auth-logo').forEach(img=>{img.src=logo})}function toggleTheme(){const light=document.body.dataset.theme==='light';document.body.dataset.theme=light?'':'light';localStorage.nexusTheme=light?'dark':'light';document.querySelectorAll('#themeToggle span').forEach(s=>s.textContent=light?'Light mode':'Dark mode');applyLogoTheme()}$('#themeToggle').onclick=toggleTheme;$('#mobileTheme').onclick=toggleTheme;$('#mobileMenu').onclick=()=>$('#sidebar').classList.toggle('open');if(localStorage.nexusTheme==='light')document.body.dataset.theme='light';applyLogoTheme();home();bindGo();
