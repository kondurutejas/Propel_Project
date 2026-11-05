import {api,escapeHTML as esc,safeURL} from './api.js';
export function showToast({title='Notification',message='',type='info',icon='🔔',duration=5000,onClick=null}={}){
 const container=document.getElementById('toast-container');if(!container)return()=>{};const toast=document.createElement('div');toast.className='toast';toast.innerHTML=`<div class="toast-icon ${esc(type)}">${esc(icon)}</div><div class="toast-body"><strong>${esc(title)}</strong><p>${esc(message)}</p></div><button class="toast-close" aria-label="Dismiss notification">×</button>`;const close=()=>toast.remove();toast.querySelector('button').onclick=e=>{e.stopPropagation();close();};if(onClick)toast.onclick=()=>{onClick();close();};container.append(toast);if(duration>0)setTimeout(close,duration);return close;
}
export function showJobAlert(job){showToast({title:job.title,message:job.company,onClick:()=>{const u=safeURL(job.url);if(u)window.open(u,'_blank','noopener');}});}
export function showLevelUp(name){showToast({title:'Progress updated',message:name});}
export class NotificationPanel{
 constructor(){this.panel=document.getElementById('notification-panel');this.list=document.getElementById('notif-list');this.badge=document.getElementById('notification-badge');this.btn=document.getElementById('btn-notifications');this.notifications=[];this.btn.onclick=()=>{this.panel.classList.toggle('hidden');if(!this.panel.classList.contains('hidden'))this.load();};document.getElementById('notif-clear').onclick=()=>this.clearAll();window.addEventListener('propel-auth',()=>this.load());this.load();}
 async load(){if(!api.isLoggedIn()){this.notifications=[];this.render();return;}try{this.notifications=await api.getNotifications();this.render();}catch{this.list.textContent='Could not load notifications.';}}
 async clearAll(){if(api.isLoggedIn())try{await api.request('POST','/notifications/clear/');}catch(e){showToast({title:'Could not clear notifications',message:e.message});return;}this.notifications=[];this.render();}
 addNotification(n){this.notifications.unshift(n);this.render();}
 render(){const unread=this.notifications.filter(n=>!n.is_read).length;this.badge.textContent=unread;this.badge.classList.toggle('hidden',!unread);this.list.innerHTML=this.notifications.map(n=>`<div class="notif-item"><div class="notif-icon">${esc(n.icon||'🔔')}</div><div class="notif-content"><p>${esc(n.message)}</p><span>${new Date(n.created_at).toLocaleString()}</span></div></div>`).join('')||'<p class="notif-empty">No notifications</p>';}
}
