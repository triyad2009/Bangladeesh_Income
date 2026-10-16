import {getUser,json,fail} from '../_lib/auth.js';
import {encryptAccount} from '../_lib/encryption.js';
export async function onRequestGet({request,env}) {
 try {
  const {user}=await getUser(request,env);
  const {results=[]}=await env.DB.prepare("SELECT id,amount_points,method,status,created_at FROM withdrawals WHERE telegram_id=? ORDER BY id DESC LIMIT 50").bind(String(user.id)).all();
  const pending=results.filter(x=>x.status==='pending').reduce((n,x)=>n+x.amount_points,0);
  return json({items:results,pending_points:pending});
 } catch(e){return fail(e);}
}
export async function onRequestPost({request,env}) {
 try {
  const {user}=await getUser(request,env);
  const body=await request.json();
  const amount=Number(body.amount),method=String(body.method||''),account=String(body.account||'').replace(/[\s-]/g,'');
  if(!Number.isSafeInteger(amount)||amount<1||amount>100000000) return json({error:'Enter a valid points amount.'},400);
  if(!['bkash','nagad','rocket'].includes(method)) return json({error:'Unsupported payment method.'},400);
  if(!/^01[3-9]\d{8}$/.test(account)) return json({error:'Enter a valid Bangladesh mobile number (11 digits).'},400);
  const userRow=await env.DB.prepare('SELECT balance_points FROM users WHERE telegram_id=?').bind(String(user.id)).first();
  const pending=await env.DB.prepare("SELECT COALESCE(SUM(amount_points),0) n FROM withdrawals WHERE telegram_id=? AND status='pending'").bind(String(user.id)).first();
  if((userRow?.balance_points||0)-(pending?.n||0)<amount) return json({error:'Insufficient available points.'},400);
  const encrypted=await encryptAccount(account,env);
  await env.DB.prepare("INSERT INTO withdrawals(telegram_id,amount_points,method,account_last4,account_encrypted,status) VALUES(?,?,?,?,?, 'pending')").bind(String(user.id),amount,method,account.slice(-4),encrypted).run();
  return json({ok:true,status:'pending',message:'Request queued for review. Payment details are encrypted at rest.'});
 } catch(e){return fail(e);}
}