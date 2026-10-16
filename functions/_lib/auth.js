const encoder = new TextEncoder();
function hex(buffer){return [...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function hmac(keyBytes, data) {
 const key = await crypto.subtle.importKey('raw', keyBytes, {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
 return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));
}
export async function authenticate(request, env) {
 if (!env.BOT_TOKEN) throw new Error('Server setup incomplete: BOT_TOKEN secret is missing.');
 const raw = request.headers.get('x-telegram-init-data') || '';
 if (!raw || raw.length > 8192) throw new Error('Open this Mini App from the Telegram bot to sign in.');
 const params = new URLSearchParams(raw);
 const receivedHash = params.get('hash');
 const authDate = Number(params.get('auth_date') || 0);
 if (!receivedHash || !authDate) throw new Error('Invalid Telegram sign-in data.');
 if (Math.abs(Date.now()/1000 - authDate) > 86400) throw new Error('Telegram sign-in expired. Close and reopen the Mini App.');
 params.delete('hash');
 const dataCheckString = [...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
 const secret = await hmac(encoder.encode('WebAppData'), env.BOT_TOKEN);
 const calculated = hex(await hmac(secret, dataCheckString));
 if (calculated.length !== receivedHash.length) throw new Error('Telegram signature verification failed.');
 let diff=0; for(let i=0;i<calculated.length;i++) diff |= calculated.charCodeAt(i)^receivedHash.charCodeAt(i);
 if(diff !== 0) throw new Error('Telegram signature verification failed.');
 let user;
 try { user = JSON.parse(params.get('user') || 'null'); } catch { user = null; }
 if (!user || !user.id) throw new Error('Telegram user information is missing.');
 const admins = (env.ADMIN_TELEGRAM_IDS || '').split(',').map(s=>s.trim()).filter(Boolean);
 return { user, isAdmin: admins.includes(String(user.id)), startParam: params.get('start_param') || '' };
}
export async function json(data,status=200){
 return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
export async function getUser(request,env){
 const auth=await authenticate(request,env);
 if(!env.DB) throw new Error('Database is not configured. Bind a Cloudflare D1 database as DB.');
 const u=auth.user;
 const existing=await env.DB.prepare('SELECT telegram_id FROM users WHERE telegram_id=?').bind(String(u.id)).first();
 let referrer=null;
 if(!existing && auth.startParam.startsWith('ref_')) {
   const candidate=auth.startParam.slice(4);
   if(/^\d{1,20}$/.test(candidate) && candidate!==String(u.id)) {
     const ref=await env.DB.prepare('SELECT telegram_id FROM users WHERE telegram_id=? AND status=?').bind(candidate,'active').first();
     if(ref) referrer=candidate;
   }
 }
 await env.DB.prepare(`INSERT INTO users(telegram_id,username,first_name,last_name,referred_by)
 VALUES(?,?,?,?,?) ON CONFLICT(telegram_id) DO UPDATE SET
 username=excluded.username, first_name=excluded.first_name, last_name=excluded.last_name,
 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
 .bind(String(u.id),u.username||null,u.first_name||'',u.last_name||'',referrer).run();
 if(referrer) await env.DB.prepare('UPDATE users SET referral_count=referral_count+1 WHERE telegram_id=?').bind(referrer).run();
 const dbUser=await env.DB.prepare('SELECT * FROM users WHERE telegram_id=?').bind(String(u.id)).first();
 if(dbUser?.status==='blocked') throw new Error('This account has been restricted. Contact the bot administrator.');
 return {...auth, dbUser};
}
export function fail(error){
 const message=String(error?.message||error||'Unexpected server error');
 const status=/expired|signature|sign in|Telegram user|Open this Mini App|Invalid Telegram/i.test(message)?401:
 /restricted/i.test(message)?403:
 /not configured|secret is missing/i.test(message)?503:400;
 return json({error:message},status);
}
