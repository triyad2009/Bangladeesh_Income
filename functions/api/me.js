import {getUser,json,fail} from '../_lib/auth.js';
export async function onRequestGet({request,env}) {
 try {
  const {dbUser,isAdmin,user}=await getUser(request,env);
  const counts=await env.DB.prepare(`SELECT
   SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) completed,
   SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending
   FROM claims WHERE telegram_id=?`).bind(String(user.id)).first();
  return json({user:{telegram_id:dbUser.telegram_id,username:dbUser.username,display_name:[dbUser.first_name,dbUser.last_name].filter(Boolean).join(' '),balance_points:dbUser.balance_points,referral_count:dbUser.referral_count,status:dbUser.status,created_at:dbUser.created_at,completed_tasks:counts?.completed||0,pending_claims:counts?.pending||0,bot_username:env.BOT_USERNAME||'bangladeesh_income_bot'},is_admin:isAdmin});
 } catch(e){return fail(e);}
}