import {getUser,json,fail} from '../_lib/auth.js';
export async function onRequestGet({request,env}) {
 try {
  const {isAdmin}=await getUser(request,env);
  if(!isAdmin) return json({error:'Admin access required.'},403);
  const kind=new URL(request.url).searchParams.get('kind');
  let results;
  if(kind==='claims') {
   results=await env.DB.prepare(`SELECT c.id,c.telegram_id,c.proof,c.status,c.created_at,t.title,t.reward_points,u.first_name,u.username
    FROM claims c JOIN tasks t ON t.id=c.task_id JOIN users u ON u.telegram_id=c.telegram_id
    WHERE c.status='pending' ORDER BY c.id ASC LIMIT 100`).all();
  } else if(kind==='withdrawals') {
   results=await env.DB.prepare(`SELECT w.id,w.telegram_id,w.amount_points,w.method,w.account_last4,w.status,w.created_at,u.first_name,u.username
    FROM withdrawals w JOIN users u ON u.telegram_id=w.telegram_id
    WHERE w.status='pending' ORDER BY w.id ASC LIMIT 100`).all();
  } else return json({error:'Unknown admin view.'},400);
  return json({items:results.results||[]});
 } catch(e){return fail(e);}
}
export async function onRequestPost({request,env}) {
 try {
  const {isAdmin,user}=await getUser(request,env);
  if(!isAdmin) return json({error:'Admin access required.'},403);
  const b=await request.json(),kind=String(b.kind||''),action=String(b.action||'');
  if(kind==='tasks' && action==='create') {
   const title=String(b.title||'').trim(),description=String(b.description||'').trim(),reward=Number(b.reward_points),type=String(b.task_type||'custom');
   if(title.length<3||title.length>100||description.length>1000) return json({error:'Title must be 3–100 characters; description max 1000.'},400);
   if(!Number.isSafeInteger(reward)||reward<1||reward>1000000||!['visit','custom'].includes(type)) return json({error:'Invalid task reward or type.'},400);
   const result=await env.DB.prepare("INSERT INTO tasks(title,description,reward_points,task_type,status,created_by) VALUES(?,?,?,?,'active',?)").bind(title,description,reward,type,String(user.id)).run();
   return json({ok:true,id:result.meta?.last_row_id});
  }
  if(!['claims','withdrawals'].includes(kind)||!['approve','reject'].includes(action)||!Number.isSafeInteger(Number(b.id))||Number(b.id)<1) return json({error:'Invalid admin action.'},400);
  const id=Number(b.id),status=action==='approve'?'approved':'rejected';
  if(kind==='claims') {
   const claim=await env.DB.prepare("SELECT c.id,c.task_id,c.telegram_id,c.status,t.reward_points FROM claims c JOIN tasks t ON t.id=c.task_id WHERE c.id=?").bind(id).first();
   if(!claim||claim.status!=='pending') return json({error:'Claim not found or already reviewed.'},409);
   if(action==='approve') {
    const batch=await env.DB.batch([
     env.DB.prepare("UPDATE claims SET status='approved',reviewed_by=?,reviewed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='pending'").bind(String(user.id),id),
     env.DB.prepare('UPDATE users SET balance_points=balance_points+? WHERE telegram_id=?').bind(claim.reward_points,claim.telegram_id),
     env.DB.prepare("INSERT INTO ledger(telegram_id,delta_points,reason,reference_type,reference_id) VALUES(?,?,'Task approved','claim',?)").bind(claim.telegram_id,claim.reward_points,id)
    ]);
   } else await env.DB.prepare("UPDATE claims SET status='rejected',reviewed_by=?,reviewed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='pending'").bind(String(user.id),id).run();
  } else {
   const w=await env.DB.prepare("SELECT * FROM withdrawals WHERE id=?").bind(id).first();
   if(!w||w.status!=='pending') return json({error:'Withdrawal not found or already reviewed.'},409);
   if(action==='approve') {
    const balance=await env.DB.prepare('SELECT balance_points FROM users WHERE telegram_id=?').bind(w.telegram_id).first();
    if((balance?.balance_points||0)<w.amount_points) return json({error:'User balance is no longer sufficient.'},409);
    await env.DB.batch([
     env.DB.prepare("UPDATE withdrawals SET status='approved',reviewed_by=?,reviewed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='pending'").bind(String(user.id),id),
     env.DB.prepare('UPDATE users SET balance_points=balance_points-? WHERE telegram_id=? AND balance_points>=?').bind(w.amount_points,w.telegram_id,w.amount_points),
     env.DB.prepare("INSERT INTO ledger(telegram_id,delta_points,reason,reference_type,reference_id) VALUES(?,?,'Withdrawal approved','withdrawal',?)").bind(w.telegram_id,-w.amount_points,id)
    ]);
   } else await env.DB.prepare("UPDATE withdrawals SET status='rejected',reviewed_by=?,reviewed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='pending'").bind(String(user.id),id).run();
  }
  return json({ok:true,status});
 } catch(e){return fail(e);}
}