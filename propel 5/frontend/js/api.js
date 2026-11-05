const API_BASE='/api';
class ApiClient {
  constructor(){this.token=localStorage.getItem('propel_token');try{this.user=JSON.parse(localStorage.getItem('propel_user')||'null');}catch{this.user=null;}}
  async request(method,path,body=null){
    const headers={};if(this.token)headers.Authorization=`Token ${this.token}`;
    if(body && !(body instanceof FormData))headers['Content-Type']='application/json';
    let res;try{res=await fetch(API_BASE+path,{method,headers,body:body?(body instanceof FormData?body:JSON.stringify(body)):undefined});}
    catch{throw new Error('Could not connect. Start the Propel backend and try again.');}
    let data;try{data=await res.json();}catch{throw new Error('The server returned an unreadable response.');}
    if(!res.ok){if(res.status===401){this.logout();}const msg=data.error||data.detail||Object.values(data).flat().join(' ');throw new Error(msg||'Request failed.');}
    return data;
  }
  saveAuth(data){this.token=data.token;this.user=data.user;localStorage.setItem('propel_token',data.token);localStorage.setItem('propel_user',JSON.stringify(data.user));window.dispatchEvent(new Event('propel-auth'));return data;}
  async login(username,password){return this.saveAuth(await this.request('POST','/auth/login/',{username,password}));}
  async register(username,email,password,career_goal){return this.saveAuth(await this.request('POST','/auth/register/',{username,email,password,career_goal}));}
  logout(){this.token=null;this.user=null;localStorage.removeItem('propel_token');localStorage.removeItem('propel_user');window.dispatchEvent(new Event('propel-auth'));}
  isLoggedIn(){return !!this.token;}
  getJobs(params={}){return this.request('GET',`/jobs/?${new URLSearchParams(params)}`);}
  scrapeJobs(search_term,location){return this.request('POST','/jobs/scrape/',{search_term,location});}
  getNotifications(){return this.request('GET','/notifications/');}
  getTracker(){return this.request('GET','/tracker/');}
  completeTask(task_id){return this.request('POST','/tracker/complete/',{task_id});}
  sendContact(name,email,subject,message){return this.request('POST','/contact/',{name,email,subject,message});}
}
export const api=new ApiClient();
export const escapeHTML=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const safeURL=(v)=>{try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
