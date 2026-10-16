import {getUser,json,fail} from '../_lib/auth.js';
export async function onRequestPost({request,env}) {
 try {
  const {user}=await getUser(request,env);
  const body=await request.json();
  const id=Number(body.task_id),proof=String(body.proof||'').trim();
  if(!Number.isSafeInteger(id)||id<1) return json({error:'Invalid task.'},400);
  if(proof.length<3||proof.length>1500) return json({error:'Proof must be between 3 and 1500 characters.'},400);
  const task=await env.DB.prepare("SELECT id FROM tasks WHERE id=? AND status='active'").bind(id).first();
  if(!task) return json({error:'Task not found or unavailable.'},404);
  const prior=await env.DB.prepare("SELECT status FROM claims WHERE task_id=? AND telegram_id=? ORDER BY id DESC LIMIT 1").bind(id,String(user.id)).first();
  if(prior && prior.status!=='rejected') return json({error:'You already submitted this task.'},409);
  await env.DB.prepare("INSERT INTO claims(task_id,telegram_id,proof,status) VALUES(?,?,?,'pending')").bind(id,String(user.id),proof).run();
  return json({ok:true,status:'pending'});
 } catch(e){return fail(e);}
}