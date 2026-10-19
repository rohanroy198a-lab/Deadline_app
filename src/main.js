import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { formatDuration, getUrgency, getUrgencyLabel } from './domain.js';
import './style.css';

const STORAGE_KEY = 'deadline.records.v1';
const ALERTS_KEY = 'deadline.alerts-enabled.v1';
const native = Capacitor.isNativePlatform();
const app = document.querySelector('#app');
let deadlines = readDeadlines();
let alertsEnabled = localStorage.getItem(ALERTS_KEY) === 'true';
let editingId = null;
let lastShownIds = new Set();

function readDeadlines() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter(d => d && typeof d.id === 'string' && typeof d.title === 'string' && Number.isFinite(Number(d.deadlineAt)))
      .map(d => ({ id: d.id, title: d.title.slice(0, 120), deadlineAt: Number(d.deadlineAt), createdAt: Number(d.createdAt) || Date.now() }));
  } catch {
    return [];
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(deadlines));
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function localDateTimeValue(date) {
  const pad = number => String(number).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function prettyDate(timestamp) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp));
}

function sortedDeadlines() {
  const now = Date.now();
  return [...deadlines].sort((a, b) => {
    const aEnded = a.deadlineAt <= now;
    const bEnded = b.deadlineAt <= now;
    if (aEnded !== bEnded) return aEnded ? 1 : -1;
    return aEnded ? b.deadlineAt - a.deadlineAt : a.deadlineAt - b.deadlineAt;
  });
}

function renderShell() {
  app.innerHTML = [
    '<div class="app-shell">',
      '<header class="topbar">',
        '<a class="brand" href="./" aria-label="DEADLINE home"><span class="brand-mark">D</span><span class="brand-name">DEADLINE</span></a>',
        '<button class="quiet-button alerts-button" id="alerts-button" type="button"><span class="status-dot"></span><span id="alerts-label">Enable alerts</span></button>',
      '</header>',
      '<main>',
        '<section class="intro">',
          '<div class="eyebrow"><span class="eyebrow-line"></span> YOUR TIME, IN FOCUS</div>',
          '<h1>Make time<br><span>count.</span></h1>',
          '<p class="intro-copy">Keep the dates that matter in sight.<br>One clear countdown at a time.</p>',
          '<button class="primary-button" id="add-button" type="button"><span class="plus">+</span> Add a deadline</button>',
        '</section>',
        '<section class="deadline-section" aria-labelledby="deadlines-heading">',
          '<div class="section-heading"><div><p class="section-kicker">YOUR TIMELINE</p><h2 id="deadlines-heading">Deadlines <span id="deadline-count" class="count-badge">0</span></h2></div><div class="summary" id="summary"></div></div>',
          '<div id="deadline-list" class="deadline-list" aria-live="polite"></div>',
        '</section>',
      '</main>',
      '<footer class="footer"><span><span class="footer-dot"></span> LOCAL BY DESIGN</span><span>Your deadlines stay on this device.</span></footer>',
    '</div>',
    '<dialog id="deadline-dialog" class="deadline-dialog">',
      '<form id="deadline-form" method="dialog">',
        '<div class="dialog-top"><div><p class="section-kicker" id="dialog-kicker">NEW COUNTDOWN</p><h2 id="dialog-title">Add a deadline</h2></div><button type="button" id="close-dialog" class="icon-button" aria-label="Close dialog">×</button></div>',
        '<label for="deadline-name">What are you counting down to?</label>',
        '<input id="deadline-name" name="title" type="text" maxlength="120" autocomplete="off" placeholder="e.g. Entrance exam" required />',
        '<label for="deadline-date">Date and time</label>',
        '<input id="deadline-date" name="deadline" type="datetime-local" required />',
        '<p class="form-note">The countdown uses your device&#39;s local time.</p>',
        '<div class="dialog-actions"><button type="button" id="cancel-dialog" class="secondary-button">Cancel</button><button type="submit" class="primary-button" id="save-button">Save deadline <span aria-hidden="true">↗</span></button></div>',
      '</form>',
    '</dialog>',
    '<div id="toast" class="toast" role="status" aria-live="polite"></div>'
  ].join('');

  document.querySelector('#add-button').addEventListener('click', () => openEditor());
  document.querySelector('#close-dialog').addEventListener('click', closeEditor);
  document.querySelector('#cancel-dialog').addEventListener('click', closeEditor);
  document.querySelector('#deadline-form').addEventListener('submit', saveDeadline);
  document.querySelector('#deadline-list').addEventListener('click', onListAction);
  document.querySelector('#alerts-button').addEventListener('click', toggleAlerts);
  document.querySelector('#deadline-dialog').addEventListener('click', event => {
    if (event.target === event.currentTarget) closeEditor();
  });
  updateAlertLabel();
  renderDeadlines();
}

function openEditor(id = null) {
  editingId = id;
  const form = document.querySelector('#deadline-form');
  form.reset();
  const record = id ? deadlines.find(item => item.id === id) : null;
  document.querySelector('#dialog-kicker').textContent = record ? 'EDIT COUNTDOWN' : 'NEW COUNTDOWN';
  document.querySelector('#dialog-title').textContent = record ? 'Edit deadline' : 'Add a deadline';
  document.querySelector('#save-button').innerHTML = record ? 'Save changes <span aria-hidden="true">↗</span>' : 'Save deadline <span aria-hidden="true">↗</span>';
  document.querySelector('#deadline-name').value = record ? record.title : '';
  document.querySelector('#deadline-date').value = record ? localDateTimeValue(new Date(record.deadlineAt)) : localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000));
  document.querySelector('#deadline-dialog').showModal();
  setTimeout(() => document.querySelector('#deadline-name').focus(), 30);
}

function closeEditor() {
  document.querySelector('#deadline-dialog').close();
  editingId = null;
}

async function saveDeadline(event) {
  event.preventDefault();
  const wasEditing = Boolean(editingId);
  const title = document.querySelector('#deadline-name').value.trim();
  const dateValue = document.querySelector('#deadline-date').value;
  const deadlineAt = new Date(dateValue).getTime();
  if (!title) {
    showToast('Give this deadline a name.');
    return;
  }
  if (!dateValue || !Number.isFinite(deadlineAt)) {
    showToast('Choose a valid date and time.');
    return;
  }

  let record;
  if (editingId) {
    const index = deadlines.findIndex(item => item.id === editingId);
    if (index < 0) return;
    record = { ...deadlines[index], title, deadlineAt };
    deadlines[index] = record;
    await cancelNativeNotification(record.id);
  } else {
    record = { id: makeId(), title, deadlineAt, createdAt: Date.now() };
    deadlines.push(record);
  }
  persist();
  closeEditor();
  renderDeadlines();
  if (alertsEnabled && record.deadlineAt > Date.now()) await scheduleNativeNotification(record);
  showToast(wasEditing ? 'Deadline updated.' : 'Deadline saved.');
  editingId = null;
}

function makeId() {
  return (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
}

async function onListAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const id = button.dataset.id;
  if (button.dataset.action === 'edit') openEditor(id);
  if (button.dataset.action === 'delete') {
    const record = deadlines.find(item => item.id === id);
    if (!record) return;
    if (!window.confirm('Delete “' + record.title + '”? This cannot be undone.')) return;
    deadlines = deadlines.filter(item => item.id !== id);
    persist();
    await cancelNativeNotification(id);
    renderDeadlines();
    showToast('Deadline deleted.');
  }
}

function renderDeadlines() {
  const list = document.querySelector('#deadline-list');
  if (!list) return;
  const now = Date.now();
  const records = sortedDeadlines();
  const activeCount = records.filter(item => item.deadlineAt > now).length;
  const endedCount = records.length - activeCount;
  document.querySelector('#deadline-count').textContent = String(records.length);
  document.querySelector('#summary').innerHTML = '<span><b>' + activeCount + '</b> active</span><span class="summary-divider"></span><span><b>' + endedCount + '</b> ended</span>';

  if (!records.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-orbit"><span class="empty-clock">◷</span></div><h3>Your time starts here.</h3><p>No deadlines yet. Add the first one and keep it in sight.</p><button class="secondary-button empty-add" type="button" id="empty-add">＋ Add your first deadline</button></div>';
    document.querySelector('#empty-add').addEventListener('click', () => openEditor());
    return;
  }

  list.innerHTML = records.map(record => {
    const remaining = Math.max(0, record.deadlineAt - now);
    const level = getUrgency(record.deadlineAt, now);
    const ended = level === 'ended';
    return '<article class="deadline-card ' + level + (ended ? ' is-ended' : '') + '" data-record="' + esc(record.id) + '">' +
      '<div class="card-accent"></div>' +
      '<div class="card-main">' +
        '<div class="card-top"><span class="urgency"><span class="urgency-dot"></span>' + getUrgencyLabel(level) + '</span>' +
        '<div class="card-actions"><button type="button" class="icon-button" data-action="edit" data-id="' + esc(record.id) + '" aria-label="Edit ' + esc(record.title) + '" title="Edit deadline">✎</button><button type="button" class="icon-button delete-button" data-action="delete" data-id="' + esc(record.id) + '" aria-label="Delete ' + esc(record.title) + '" title="Delete deadline">×</button></div></div>' +
        '<h3 class="deadline-title">' + esc(record.title) + '</h3>' +
        '<p class="deadline-date"><span aria-hidden="true">◷</span> ' + esc(prettyDate(record.deadlineAt)) + '</p>' +
        '<div class="countdown" aria-label="' + (ended ? 'Deadline ended' : 'Time remaining') + '"><span class="digits" data-countdown="' + esc(record.id) + '">' + formatDuration(remaining) + '</span></div>' +
        '<div class="card-bottom"><span>' + (ended ? 'THE MOMENT HAS PASSED' : 'TIME REMAINING') + '</span><span class="tiny-rule"></span><span>' + (ended ? '0h 0m 0s' : formatRemainingMeta(remaining)) + '</span></div>' +
      '</div>' +
    '</article>';
  }).join('');
}

function formatRemainingMeta(milliseconds) {
  const totalMinutes = Math.floor(milliseconds / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return days + 'd ' + hours + 'h left';
  if (hours) return hours + 'h ' + minutes + 'm left';
  return minutes + 'm left';
}

function tick() {
  const now = Date.now();
  document.querySelectorAll('[data-countdown]').forEach(element => {
    const record = deadlines.find(item => item.id === element.dataset.countdown);
    if (!record) return;
    const nextLevel = getUrgency(record.deadlineAt, now);
    const card = element.closest('.deadline-card');
    if (!card) return;
    const previousLevel = Array.from(card.classList).find(cls => ['normal', 'soon', 'critical', 'ended'].includes(cls));
    if (previousLevel !== nextLevel) renderDeadlines();
    else {
      element.textContent = formatDuration(Math.max(0, record.deadlineAt - now));
      const remaining = Math.max(0, record.deadlineAt - now);
      const meta = card.querySelector('.card-bottom span:last-child');
      if (meta) meta.textContent = nextLevel === 'ended' ? '0h 0m 0s' : formatRemainingMeta(remaining);
    }
    if (record.deadlineAt <= now && !lastShownIds.has(record.id)) {
      lastShownIds.add(record.id);
      if (!native && alertsEnabled && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('DEADLINE ENDED', { body: record.title });
      }
    }
  });
}

function updateAlertLabel() {
  const button = document.querySelector('#alerts-button');
  const label = document.querySelector('#alerts-label');
  if (!button || !label) return;
  label.textContent = alertsEnabled ? 'Alerts enabled' : 'Enable alerts';
  button.classList.toggle('is-enabled', alertsEnabled);
  button.setAttribute('aria-pressed', String(alertsEnabled));
}

async function toggleAlerts() {
  if (alertsEnabled) {
    alertsEnabled = false;
    localStorage.setItem(ALERTS_KEY, 'false');
    if (native) {
      try { await LocalNotifications.cancel({ notifications: deadlines.map(item => ({ id: notificationId(item.id) })) }); } catch {}
    }
    updateAlertLabel();
    showToast('Deadline alerts disabled.');
    return;
  }

  try {
    if (native) {
      const current = await LocalNotifications.checkPermissions();
      const permission = current.display === 'granted' ? current : await LocalNotifications.requestPermissions();
      if (permission.display !== 'granted') {
        showToast('Allow notifications in Android settings to enable alerts.');
        return;
      }
      alertsEnabled = true;
      localStorage.setItem(ALERTS_KEY, 'true');
      await rescheduleNativeNotifications();
    } else if ('Notification' in window) {
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') {
        showToast('Notification permission was not granted.');
        return;
      }
      alertsEnabled = true;
      localStorage.setItem(ALERTS_KEY, 'true');
    } else {
      showToast('Notifications are not supported in this browser.');
      return;
    }
    updateAlertLabel();
    showToast(native ? 'Alerts scheduled for future deadlines.' : 'Alerts enabled while this app is open.');
  } catch (error) {
    console.error('Unable to enable alerts', error);
    showToast('Could not enable notifications on this device.');
  }
}

function notificationId(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash * 31) + id.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 2000000000) + 1;
}

async function cancelNativeNotification(id) {
  if (!native) return;
  try { await LocalNotifications.cancel({ notifications: [{ id: notificationId(id) }] }); } catch {}
}

async function scheduleNativeNotification(record) {
  if (!native || record.deadlineAt <= Date.now()) return;
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: notificationId(record.id),
        title: 'DEADLINE REACHED',
        body: record.title,
        schedule: { at: new Date(record.deadlineAt), allowWhileIdle: true },
        smallIcon: 'ic_stat_icon_config_sample',
        iconColor: '#b8f36b',
        ongoing: false
      }]
    });
  } catch (error) {
    console.warn('Could not schedule deadline notification', error);
    showToast('Deadline saved, but its notification could not be scheduled.');
  }
}

async function rescheduleNativeNotifications() {
  try {
    await LocalNotifications.cancel({ notifications: deadlines.map(item => ({ id: notificationId(item.id) })) });
  } catch {}
  for (const record of deadlines) {
    if (record.deadlineAt > Date.now()) await scheduleNativeNotification(record);
  }
}

let toastTimer;
function showToast(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

renderShell();
if (native && alertsEnabled) rescheduleNativeNotifications();
setInterval(tick, 250);
if (!native && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Offline cache unavailable', error));
}
