import {getUser,json,fail} from '../_lib/auth.js';
export async function onRequestGet({request,env}) {
 try {
  const {user}=await getUser(request,env);
  const {results=[]}=await env.DB.prepare(`SELECT t.id,t.title,t.description,t.reward_points,t.task_type,
   (SELECT c.status FROM claims c WHERE c.task_id=t.id AND c.telegram_id=? ORDER BY c.id DESC LIMIT 1) my_status
   FROM tasks t WHERE t.status='active' ORDER BY t.id DESC LIMIT 100`).bind(String(user.id)).all();
  return json({tasks:results});
 } catch(e){return fail(e);}
}