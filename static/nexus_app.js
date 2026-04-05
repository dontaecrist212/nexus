// ===== NEXUS APP =====
let currentUser = null;
let currentPage = 'feed';
let selectedMood = '';
let selectedWorldColor = '#6366f1';
let selectedProfileColor = '#6366f1';
let activeCommentPostId = null;

// ===== UTILS =====
function show(id) { const el = document.getElementById(id); if (el) { el.classList.remove('hidden'); } }
function hide(id) { const el = document.getElementById(id); if (el) { el.classList.add('hidden'); } }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function timeAgo(dateStr) {
  const d = new Date(dateStr), now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}
function showToast(msg, type='success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type}`;
  show('toast'); setTimeout(() => hide('toast'), 3000);
}

// ===== THEME =====
let isDark = localStorage.getItem('nexus-theme') !== 'light';
function applyTheme() {
  document.body.className = isDark ? 'dark' : 'light';
  document.querySelectorAll('.theme-toggle').forEach(btn => btn.textContent = isDark ? '☀️' : '🌙');
  localStorage.setItem('nexus-theme', isDark ? 'dark' : 'light');
}
function toggleTheme() { isDark = !isDark; applyTheme(); }
applyTheme();

// ===== SESSION =====
async function checkSession() {
  const res = await fetch('/api/me');
  const data = await res.json();
  if (data.logged_in) {
    currentUser = data;
    showApp();
  } else {
    showLanding();
  }
}

function showLanding() {
  show('landing-screen');
  hide('auth-screen');
  hide('app-screen');
}

function showAuth(tab = 'login') {
  hide('landing-screen');
  show('auth-screen');
  hide('app-screen');
  switchAuthTab(tab);
}

function showApp() {
  hide('landing-screen');
  hide('auth-screen');
  const appEl = document.getElementById('app-screen');
  appEl.classList.remove('hidden');
  appEl.style.display = 'grid';
  updateComposerAvatar();
  loadPage('feed');
  loadSuggested();
  loadSidebarWorlds();
}

function updateComposerAvatar() {
  if (currentUser) {
    const el = document.getElementById('composer-avatar');
    if (el) {
      el.textContent = currentUser.avatar_emoji || '👤';
      el.style.background = currentUser.theme_color || '#6366f1';
    }
  }
}

// ===== AUTH =====
function switchAuthTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('login-fields').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-fields').classList.toggle('hidden', tab !== 'register');
  hide('auth-error'); hide('auth-success');
}

function showAuthError(msg) { const el = document.getElementById('auth-error'); el.textContent = msg; show('auth-error'); }
function showAuthSuccess(msg) { const el = document.getElementById('auth-success'); el.textContent = msg; show('auth-success'); }

async function doLogin() {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!username || !password) { showAuthError('All fields required'); return; }
  const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  const data = await res.json();
  if (!res.ok) { showAuthError(data.error); return; }
  const me = await (await fetch('/api/me')).json();
  currentUser = me;
  showApp();
}

async function doRegister() {
  const display_name = document.getElementById('reg-display').value.trim();
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  if (!username || !password) { showAuthError('All fields required'); return; }
  const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, display_name }) });
  const data = await res.json();
  if (!res.ok) { showAuthError(data.error); return; }
  const me = await (await fetch('/api/me')).json();
  currentUser = me;
  showApp();
}

async function doLogout() {
  await fetch('/api/logout', { method: 'POST' });
  currentUser = null;
  showLanding();
}

// ===== NAVIGATION =====
function loadPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.classList.add('hidden'); });
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) { pageEl.classList.remove('hidden'); pageEl.classList.add('active'); }
  const navEl = document.getElementById(`nav-${page}`);
  if (navEl) navEl.classList.add('active');
  if (page === 'feed') loadFeed();
  else if (page === 'explore') loadExplore();
  else if (page === 'worlds') loadWorlds();
  else if (page === 'events') loadEvents();
  else if (page === 'profile') loadMyProfile();
}

// ===== FEED =====
async function loadFeed() {
  const container = document.getElementById('feed-posts');
  container.innerHTML = '<div class="empty-feed"><div class="empty-icon">⚡</div><p>Loading feed...</p></div>';
  const res = await fetch('/api/feed');
  if (res.status === 401) { showAuth(); return; }
  const posts = await res.json();
  if (!posts.length) {
    container.innerHTML = `<div class="empty-feed"><div class="empty-icon">🌍</div><h3>Your feed is empty</h3><p>Follow some people or post something to get started!</p></div>`;
    return;
  }
  container.innerHTML = posts.map(p => renderPost(p)).join('');
  attachPostListeners(container);
}

function renderPost(p, showDelete = null) {
  const canDelete = showDelete !== null ? showDelete : (currentUser && p.user_id === currentUser.id);
  return `<div class="post" id="post-${p.id}" data-id="${p.id}">
    <div class="post-header">
      <div class="post-avatar" style="background:${p.theme_color||'#6366f1'}" data-username="${esc(p.username)}">${esc(p.avatar_emoji||'👤')}</div>
      <div class="post-meta">
        <div class="post-name" data-username="${esc(p.username)}">${esc(p.display_name||p.username)}</div>
        <div class="post-username">@${esc(p.username)} · <span class="post-time">${timeAgo(p.created_at)}</span></div>
      </div>
      ${p.mood ? `<div class="post-mood">${esc(p.mood)}</div>` : ''}
    </div>
    <div class="post-content">${esc(p.content)}</div>
    <div class="post-actions">
      <button class="post-action like-btn ${p.liked?'liked':''}" data-id="${p.id}">
        ${p.liked?'❤️':'🤍'} <span class="like-count">${p.like_count||0}</span>
      </button>
      <button class="post-action comment-btn" data-id="${p.id}">
        💬 <span>${p.comment_count||0}</span>
      </button>
      ${canDelete ? `<button class="post-action post-delete delete-btn" data-id="${p.id}">🗑</button>` : ''}
    </div>
  </div>`;
}

function attachPostListeners(container) {
  container.querySelectorAll('.like-btn').forEach(btn => btn.addEventListener('click', () => likePost(btn.dataset.id, btn)));
  container.querySelectorAll('.comment-btn').forEach(btn => btn.addEventListener('click', () => openComments(btn.dataset.id)));
  container.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', () => deletePost(btn.dataset.id)));
  container.querySelectorAll('.post-avatar, .post-name').forEach(el => el.addEventListener('click', () => loadUserProfile(el.dataset.username)));
}

async function likePost(postId, btn) {
  const res = await fetch(`/api/posts/${postId}/like`, { method: 'POST' });
  const data = await res.json();
  btn.classList.toggle('liked', data.liked);
  btn.innerHTML = `${data.liked?'❤️':'🤍'} <span class="like-count">${data.count}</span>`;
}

async function deletePost(postId) {
  if (!confirm('Delete this post?')) return;
  await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
  const el = document.getElementById(`post-${postId}`);
  if (el) el.remove();
  showToast('Post deleted');
}

async function submitPost() {
  const content = document.getElementById('post-content').value.trim();
  if (!content) { showToast('Write something first!', 'error'); return; }
  const res = await fetch('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, mood: selectedMood }) });
  if (!res.ok) { const d = await res.json(); showToast(d.error, 'error'); return; }
  document.getElementById('post-content').value = '';
  document.getElementById('char-count').textContent = '500';
  selectedMood = '';
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.mood-btn[data-mood=""]').classList.add('active');
  showToast('Posted! ✨');
  if (currentPage === 'feed') loadFeed();
}

// ===== COMMENTS =====
async function openComments(postId) {
  activeCommentPostId = postId;
  show('comments-modal');
  const res = await fetch(`/api/posts/${postId}/comments`);
  const comments = await res.json();
  const list = document.getElementById('comments-list');
  if (!comments.length) {
    list.innerHTML = '<p style="text-align:center;color:var(--text3);padding:1rem;font-size:13px;">No comments yet. Be the first!</p>';
  } else {
    list.innerHTML = comments.map(c => `
      <div class="comment">
        <div class="comment-avatar" style="background:${c.theme_color||'#6366f1'}">${esc(c.avatar_emoji||'👤')}</div>
        <div class="comment-body">
          <div class="comment-name">${esc(c.display_name||c.username)} <span class="comment-time" style="font-weight:normal;color:var(--text3)">· ${timeAgo(c.created_at)}</span></div>
          <div class="comment-text">${esc(c.content)}</div>
        </div>
      </div>`).join('');
  }
}

async function submitComment() {
  if (!activeCommentPostId) return;
  const input = document.getElementById('comment-input');
  const content = input.value.trim();
  if (!content) return;
  const res = await fetch(`/api/posts/${activeCommentPostId}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
  if (!res.ok) { const d = await res.json(); showToast(d.error, 'error'); return; }
  input.value = '';
  await openComments(activeCommentPostId);
  showToast('Comment added!');
}

// ===== EXPLORE =====
async function loadExplore() {
  const container = document.getElementById('explore-posts');
  container.innerHTML = '<div class="empty-feed"><p>Loading...</p></div>';
  const posts = await (await fetch('/api/explore')).json();
  container.innerHTML = posts.map(p => renderPost(p)).join('') || '<div class="empty-feed"><div class="empty-icon">🔍</div><h3>Nothing here yet</h3></div>';
  attachPostListeners(container);
}

async function searchUsers() {
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;
  const users = await (await fetch(`/api/search?q=${encodeURIComponent(q)}`)).json();
  const container = document.getElementById('search-results');
  show('search-results');
  if (!users.length) { container.innerHTML = '<p style="color:var(--text3);font-size:13px;padding:1rem;">No users found</p>'; return; }
  container.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:1.5rem;">${users.map(u => `
    <div style="display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:12px;cursor:pointer;" class="search-user-row" data-username="${esc(u.username)}">
      <div style="width:40px;height:40px;border-radius:50%;background:${u.theme_color||'#6366f1'};display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">${esc(u.avatar_emoji||'👤')}</div>
      <div>
        <div style="font-weight:600;">${esc(u.display_name||u.username)}</div>
        <div style="font-size:13px;color:var(--text3);">@${esc(u.username)}</div>
        ${u.bio ? `<div style="font-size:12px;color:var(--text2);margin-top:2px;">${esc(u.bio)}</div>` : ''}
      </div>
    </div>`).join('')}</div>`;
  container.querySelectorAll('.search-user-row').forEach(row => row.addEventListener('click', () => loadUserProfile(row.dataset.username)));
}

// ===== WORLDS =====
async function loadWorlds() {
  const container = document.getElementById('worlds-list');
  const worlds = await (await fetch('/api/worlds')).json();
  if (!worlds.length) {
    container.innerHTML = '<div class="empty-feed"><div class="empty-icon">🌍</div><h3>No worlds yet</h3><p>Be the first to create one!</p></div>';
    return;
  }
  container.innerHTML = `<div class="worlds-grid">${worlds.map(w => `
    <div class="world-card">
      <div class="world-header">
        <div class="world-emoji">${esc(w.emoji||'🌍')}</div>
        <div>
          <div class="world-name" style="color:${w.theme_color||'var(--accent)'}">${esc(w.name)}</div>
          <div style="font-size:12px;color:var(--text3);">by @${esc(w.creator_name)}</div>
        </div>
      </div>
      <div class="world-desc">${esc(w.description||'No description')}</div>
      <div class="world-footer">
        <span class="world-members">👥 ${w.member_count} members</span>
        <button class="btn ${w.is_member?'btn-ghost':'btn-primary'} btn-sm join-world-btn" data-id="${w.id}" data-joined="${w.is_member}">
          ${w.is_member ? 'Leave' : 'Join'}
        </button>
      </div>
    </div>`).join('')}</div>`;
  container.querySelectorAll('.join-world-btn').forEach(btn => btn.addEventListener('click', async () => {
    const res = await fetch(`/api/worlds/${btn.dataset.id}/join`, { method: 'POST' });
    const data = await res.json();
    showToast(data.joined ? 'Joined world! 🌍' : 'Left world');
    loadWorlds();
  }));
}

async function createWorld() {
  const name = document.getElementById('world-name').value.trim();
  const description = document.getElementById('world-desc').value.trim();
  const emoji = document.getElementById('world-emoji').value.trim() || '🌍';
  if (!name) { showToast('World name required', 'error'); return; }
  const res = await fetch('/api/worlds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description, emoji, theme_color: selectedWorldColor }) });
  if (!res.ok) { const d = await res.json(); showToast(d.error, 'error'); return; }
  hide('world-modal');
  showToast('World created! 🌍');
  loadWorlds();
  loadSidebarWorlds();
}

// ===== EVENTS =====
async function loadEvents() {
  const container = document.getElementById('events-list');
  const events = await (await fetch('/api/events')).json();
  if (!events.length) {
    container.innerHTML = '<div class="empty-feed"><div class="empty-icon">📅</div><h3>No events yet</h3><p>Create the first one!</p></div>';
    return;
  }
  container.innerHTML = `<div class="events-list">${events.map(ev => {
    const d = ev.event_date ? new Date(ev.event_date) : null;
    return `<div class="event-card">
      <div class="event-emoji">${esc(ev.emoji||'📅')}</div>
      ${d ? `<div class="event-date-block"><div class="event-date-day">${d.getDate()}</div><div class="event-date-month">${d.toLocaleString('default',{month:'short'})}</div></div>` : ''}
      <div class="event-body">
        <div class="event-title">${esc(ev.title)}</div>
        ${ev.description ? `<div class="event-desc">${esc(ev.description)}</div>` : ''}
        <div class="event-meta">
          ${ev.location ? `<span>📍 ${esc(ev.location)}</span>` : ''}
          ${d ? `<span>🕐 ${d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>` : ''}
          <span>👥 ${ev.going_count} going</span>
          <span>by @${esc(ev.creator_name)}</span>
        </div>
      </div>
      <div class="event-actions">
        <button class="btn ${ev.is_going?'btn-ghost':'btn-primary'} btn-sm rsvp-btn" data-id="${ev.id}">
          ${ev.is_going ? '✓ Going' : 'RSVP'}
        </button>
      </div>
    </div>`;
  }).join('')}</div>`;
  container.querySelectorAll('.rsvp-btn').forEach(btn => btn.addEventListener('click', async () => {
    const res = await fetch(`/api/events/${btn.dataset.id}/rsvp`, { method: 'POST' });
    const data = await res.json();
    showToast(data.going ? "You're going! 🎉" : 'RSVP cancelled');
    loadEvents();
  }));
}

async function createEvent() {
  const title = document.getElementById('event-title').value.trim();
  const description = document.getElementById('event-desc').value.trim();
  const location = document.getElementById('event-location').value.trim();
  const event_date = document.getElementById('event-date').value;
  const emoji = document.getElementById('event-emoji').value.trim() || '📅';
  if (!title) { showToast('Event title required', 'error'); return; }
  const res = await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, description, location, event_date, emoji }) });
  if (!res.ok) { const d = await res.json(); showToast(d.error, 'error'); return; }
  hide('event-modal');
  showToast('Event created! 📅');
  loadEvents();
}

// ===== PROFILE =====
async function loadMyProfile() {
  if (!currentUser) return;
  await loadUserProfile(currentUser.username);
}

async function loadUserProfile(username) {
  if (currentPage !== 'profile') {
    loadPage('profile');
    currentPage = 'profile';
  }
  const container = document.getElementById('profile-content');
  container.innerHTML = '<div class="empty-feed"><p>Loading profile...</p></div>';
  const user = await (await fetch(`/api/users/${username}`)).json();
  if (user.error) { container.innerHTML = '<div class="empty-feed"><p>User not found</p></div>'; return; }
  const isMe = currentUser && user.id === currentUser.id;
  container.innerHTML = `
    <div class="profile-header">
      <div class="profile-banner" style="background:linear-gradient(135deg,${user.theme_color||'#6366f1'},${user.theme_color||'#6366f1'}88)">
        ${user.header_song ? `<div class="profile-banner-song">🎵 ${esc(user.header_song)}</div>` : ''}
      </div>
      <div class="profile-info">
        <div class="profile-avatar-wrap">
          <div class="profile-avatar" style="background:${user.theme_color||'#6366f1'}">${esc(user.avatar_emoji||'👤')}</div>
          <div class="profile-actions">
            ${isMe ? `<button class="btn btn-ghost btn-sm" id="edit-profile-btn">Edit Profile</button>` :
              `<button class="btn ${user.is_following?'btn-ghost':'btn-primary'} btn-sm follow-btn" data-id="${user.id}">
                ${user.is_following ? 'Following' : 'Follow'}
              </button>`}
          </div>
        </div>
        <div class="profile-name">${esc(user.display_name||user.username)}</div>
        <div class="profile-handle">@${esc(user.username)}</div>
        ${user.bio ? `<div class="profile-bio">${esc(user.bio)}</div>` : ''}
        <div class="profile-meta">
          ${user.location ? `<span>📍 ${esc(user.location)}</span>` : ''}
          ${user.website ? `<span>🔗 <a href="${esc(user.website)}" target="_blank" style="color:var(--accent)">${esc(user.website)}</a></span>` : ''}
          <span>📅 Joined ${new Date(user.created_at).toLocaleDateString('default',{month:'long',year:'numeric'})}</span>
        </div>
        <div class="profile-stats">
          <div class="profile-stat"><strong>${user.post_count||0}</strong><span>Posts</span></div>
          <div class="profile-stat"><strong>${user.followers||0}</strong><span>Followers</span></div>
          <div class="profile-stat"><strong>${user.following||0}</strong><span>Following</span></div>
        </div>
      </div>
    </div>
    <div class="top8-section">
      <div class="top8-title">👑 Top 8</div>
      <div class="top8-grid" id="top8-grid">
        ${[1,2,3,4,5,6,7,8].map(pos => {
          const friend = user.top8 && user.top8.find(f => f.position === pos);
          return `<div class="top8-slot">
            <div class="top8-avatar ${friend?'':'empty'}" style="${friend?`background:${friend.theme_color||'#6366f1'}`:''}">
              ${friend ? esc(friend.avatar_emoji||'👤') : '+'}
            </div>
            <div class="top8-name">${friend ? esc(friend.display_name||friend.username) : ''}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
    <div class="profile-tabs">
      <button class="profile-tab active" id="posts-tab">Posts</button>
    </div>
    <div id="profile-posts"></div>`;

  // Attach follow button
  const followBtn = container.querySelector('.follow-btn');
  if (followBtn) {
    followBtn.addEventListener('click', async () => {
      const res = await fetch(`/api/follow/${followBtn.dataset.id}`, { method: 'POST' });
      const data = await res.json();
      followBtn.textContent = data.following ? 'Following' : 'Follow';
      followBtn.className = `btn ${data.following?'btn-ghost':'btn-primary'} btn-sm follow-btn`;
      showToast(data.following ? `Following @${username}!` : `Unfollowed @${username}`);
    });
  }

  // Edit profile button
  const editBtn = container.querySelector('#edit-profile-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => openEditProfile());
  }

  // Load posts
  const posts = await (await fetch(`/api/users/${username}/posts`)).json();
  const postsContainer = document.getElementById('profile-posts');
  postsContainer.innerHTML = posts.map(p => renderPost(p, isMe)).join('') ||
    '<div class="empty-feed"><div class="empty-icon">✍️</div><h3>No posts yet</h3></div>';
  attachPostListeners(postsContainer);
}

// ===== EDIT PROFILE =====
function openEditProfile() {
  if (!currentUser) return;
  document.getElementById('edit-display-name').value = currentUser.display_name || '';
  document.getElementById('edit-avatar').value = currentUser.avatar_emoji || '👤';
  document.getElementById('edit-bio').value = currentUser.bio || '';
  document.getElementById('edit-location').value = currentUser.location || '';
  document.getElementById('edit-website').value = currentUser.website || '';
  document.getElementById('edit-song').value = currentUser.header_song || '';
  selectedProfileColor = currentUser.theme_color || '#6366f1';
  document.querySelectorAll('#profile-color-options .color-dot').forEach(d => {
    d.classList.toggle('active', d.dataset.color === selectedProfileColor);
  });
  show('edit-profile-modal');
}

async function saveProfile() {
  const display_name = document.getElementById('edit-display-name').value.trim();
  const avatar_emoji = document.getElementById('edit-avatar').value.trim() || '👤';
  const bio = document.getElementById('edit-bio').value.trim();
  const location = document.getElementById('edit-location').value.trim();
  const website = document.getElementById('edit-website').value.trim();
  const header_song = document.getElementById('edit-song').value.trim();
  const res = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ display_name, avatar_emoji, bio, location, website, header_song, theme_color: selectedProfileColor }) });
  if (!res.ok) { showToast('Failed to save', 'error'); return; }
  const me = await (await fetch('/api/me')).json();
  currentUser = me;
  hide('edit-profile-modal');
  showToast('Profile updated! ✨');
  updateComposerAvatar();
  loadMyProfile();
}

// ===== SIDEBAR WIDGETS =====
async function loadSuggested() {
  const res = await fetch('/api/explore');
  if (!res.ok) return;
  const posts = await res.json();
  const seen = new Set();
  const users = [];
  for (const p of posts) {
    if (!seen.has(p.user_id) && (!currentUser || p.user_id !== currentUser.id)) {
      seen.add(p.user_id);
      users.push(p);
      if (users.length >= 5) break;
    }
  }
  const container = document.getElementById('suggested-users');
  container.innerHTML = users.map(u => `
    <div class="suggest-user">
      <div class="suggest-avatar" style="background:${u.theme_color||'#6366f1'}">${esc(u.avatar_emoji||'👤')}</div>
      <div class="suggest-info">
        <div class="suggest-name suggest-link" data-username="${esc(u.username)}">${esc(u.display_name||u.username)}</div>
        <div class="suggest-handle">@${esc(u.username)}</div>
      </div>
      <button class="btn btn-primary btn-xs follow-suggest-btn" data-id="${u.user_id}">Follow</button>
    </div>`).join('') || '<p style="font-size:13px;color:var(--text3);">No suggestions yet</p>';
  container.querySelectorAll('.suggest-link').forEach(el => el.addEventListener('click', () => loadUserProfile(el.dataset.username)));
  container.querySelectorAll('.follow-suggest-btn').forEach(btn => btn.addEventListener('click', async () => {
    await fetch(`/api/follow/${btn.dataset.id}`, { method: 'POST' });
    showToast('Followed!');
    btn.textContent = '✓'; btn.disabled = true;
  }));
}

async function loadSidebarWorlds() {
  const worlds = await (await fetch('/api/worlds')).json();
  const container = document.getElementById('sidebar-worlds');
  container.innerHTML = worlds.slice(0,5).map(w => `
    <div class="sidebar-world">
      <div class="sidebar-world-emoji">${esc(w.emoji||'🌍')}</div>
      <div class="sidebar-world-name">${esc(w.name)}</div>
      <div class="sidebar-world-members">${w.member_count}</div>
    </div>`).join('') || '<p style="font-size:13px;color:var(--text3);">No worlds yet</p>';
  container.querySelectorAll('.sidebar-world').forEach((el, i) => el.addEventListener('click', () => loadPage('worlds')));
}

// ===== EVENT LISTENERS =====
document.addEventListener('DOMContentLoaded', () => {
  // Theme toggles
  document.querySelectorAll('.theme-toggle').forEach(btn => btn.addEventListener('click', toggleTheme));

  // Landing
  document.getElementById('land-login-btn').addEventListener('click', () => showAuth('login'));
  document.getElementById('land-register-btn').addEventListener('click', () => showAuth('register'));
  document.getElementById('hero-login-btn').addEventListener('click', () => showAuth('login'));
  document.getElementById('hero-register-btn').addEventListener('click', () => showAuth('register'));

  // Auth
  document.getElementById('tab-login').addEventListener('click', () => switchAuthTab('login'));
  document.getElementById('tab-register').addEventListener('click', () => switchAuthTab('register'));
  document.getElementById('auth-btn').addEventListener('click', doLogin);
  document.getElementById('reg-btn').addEventListener('click', doRegister);
  document.getElementById('back-to-land').addEventListener('click', showLanding);
  document.getElementById('auth-username').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('auth-password').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

  // Nav
  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => loadPage(btn.dataset.page)));
  document.getElementById('logout-btn').addEventListener('click', doLogout);

  // Post composer
  document.getElementById('post-btn').addEventListener('click', submitPost);
  document.getElementById('post-content').addEventListener('input', () => {
    const len = document.getElementById('post-content').value.length;
    document.getElementById('char-count').textContent = 500 - len;
  });
  document.getElementById('post-content').addEventListener('keydown', e => { if (e.key === 'Enter' && e.ctrlKey) submitPost(); });

  // Mood picker
  document.querySelectorAll('.mood-btn').forEach(btn => btn.addEventListener('click', () => {
    selectedMood = btn.dataset.mood;
    document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }));

  // Search
  document.getElementById('search-btn').addEventListener('click', searchUsers);
  document.getElementById('search-input').addEventListener('keydown', e => { if (e.key === 'Enter') searchUsers(); });

  // Worlds modal
  document.getElementById('create-world-btn').addEventListener('click', () => show('world-modal'));
  document.getElementById('close-world-modal').addEventListener('click', () => hide('world-modal'));
  document.getElementById('cancel-world-btn').addEventListener('click', () => hide('world-modal'));
  document.getElementById('save-world-btn').addEventListener('click', createWorld);
  document.querySelectorAll('#world-color-options .color-dot').forEach(dot => dot.addEventListener('click', () => {
    selectedWorldColor = dot.dataset.color;
    document.querySelectorAll('#world-color-options .color-dot').forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
  }));

  // Events modal
  document.getElementById('create-event-btn').addEventListener('click', () => show('event-modal'));
  document.getElementById('close-event-modal').addEventListener('click', () => hide('event-modal'));
  document.getElementById('cancel-event-btn').addEventListener('click', () => hide('event-modal'));
  document.getElementById('save-event-btn').addEventListener('click', createEvent);

  // Edit profile modal
  document.getElementById('close-edit-profile').addEventListener('click', () => hide('edit-profile-modal'));
  document.getElementById('cancel-edit-profile').addEventListener('click', () => hide('edit-profile-modal'));
  document.getElementById('save-edit-profile').addEventListener('click', saveProfile);
  document.querySelectorAll('#profile-color-options .color-dot').forEach(dot => dot.addEventListener('click', () => {
    selectedProfileColor = dot.dataset.color;
    document.querySelectorAll('#profile-color-options .color-dot').forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
  }));

  // Comments modal
  document.getElementById('close-comments').addEventListener('click', () => hide('comments-modal'));
  document.getElementById('submit-comment').addEventListener('click', submitComment);
  document.getElementById('comment-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitComment(); });

  // Close modals on backdrop
  document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); }));

  checkSession();
});