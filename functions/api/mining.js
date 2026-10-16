import {getUser,json,fail} from '../_lib/auth.js';

const HOUR=3600;
const MAX_OFFLINE=24*HOUR;
const nowISO=()=>new Date().toISOString();
async function ensureState(db,id){
 await db.prepare("INSERT OR IGNORE INTO mining_state(telegram_id,last_collected_at) VALUES(?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").bind(id).run();
 return await db.prepare('SELECT * FROM mining_state WHERE telegram_id=?').bind(id).first();
}
async function snapshot(db,id){
 const state=await ensureState(db,id);
 const machines=await db.prepare(`SELECT m.id,m.name,m.description,m.cost_points,m.rate_per_hour,COALESCE(um.quantity,0) quantity
 FROM mining_machines m LEFT JOIN user_machines um ON um.machine_id=m.id AND um.telegram_id=?
 WHERE m.active=1 ORDER BY m.sort_order,m.id`).bind(id).all();
 const rate=(machines.results||[]).reduce((n,m)=>n+Number(m.rate_per_hour)*Number(m.quantity),0);
 const elapsed=Math.max(0,Math.min(MAX_OFFLINE,Math.floor((Date.now()-Date.parse(state.last_collected_at))/1000)));
 const pending=Math.floor(rate*elapsed/HOUR);
 const last=state.last_hourly_claim_at?Date.parse(state.last_hourly_claim_at):0;
 const wait=Math.max(0,HOUR-Math.floor((Date.now()-last)/1000));
 return {state,machines:machines.results||[],rate,pending,wait};
}
export async function onRequestGet({request,env}){
 try{
  const {user,dbUser}=await getUser(request,env);
  const s=await snapshot(env.DB,String(user.id));
  return json({balance_points:dbUser.balance_points,token_symbol:'TR',rate_per_hour:s.rate,pending_machine_points:s.pending,max_offline_hours:24,hourly_reward:100,hourly_wait_seconds:s.wait,machines:s.machines.map(m=>({id:m.id,name:m.name,description:m.description,cost_points:m.cost_points,rate_per_hour:m.rate_per_hour,quantity:m.quantity})),last_collected_at:s.state.last_collected_at});
 }catch(e){return fail(e);}
}
export async function onRequestPost({request,env}){
 try{
  const {user}=await getUser(request,env),id=String(user.id),body=await request.json(),action=String(body.action||'');
  const s=await snapshot(env.DB,id),now=nowISO();
  if(action==='claim_hourly'){
   if(s.wait>0)return json({error:'Your 100 TR hourly reward is not ready yet.',wait_seconds:s.wait},429);
   const result=await env.DB.prepare("UPDATE mining_state SET last_hourly_claim_at=? WHERE telegram_id=? AND (last_hourly_claim_at IS NULL OR last_hourly_claim_at<=?)").bind(now,id,new Date(Date.now()-HOUR*1000).toISOString()).run();
   if(!result.meta?.changes)return json({error:'Hourly reward already claimed. Try again later.'},409);
   await env.DB.batch([
    env.DB.prepare('UPDATE users SET balance_points=balance_points+100,updated_at=? WHERE telegram_id=?').bind(now,id),
    env.DB.prepare("INSERT INTO ledger(telegram_id,delta_points,reason,reference_type) VALUES(?,100,'Hourly mining login reward','mining')").bind(id)
   ]);
   return json({ok:true,credited:100});
  }
  if(action==='collect'){
   const amount=s.pending;
   if(amount<1)return json({error:'No machine earnings are ready to collect yet.'},400);
   await env.DB.batch([
    env.DB.prepare('UPDATE mining_state SET last_collected_at=? WHERE telegram_id=?').bind(now,id),
    env.DB.prepare('UPDATE users SET balance_points=balance_points+?,updated_at=? WHERE telegram_id=?').bind(amount,now,id),
    env.DB.prepare("INSERT INTO ledger(telegram_id,delta_points,reason,reference_type) VALUES(?,?,'Mining machine earnings','mining')").bind(id,amount)
   ]);
   return json({ok:true,credited:amount});
  }
  if(action==='buy'){
   const machineId=Number(body.machine_id);
   if(!Number.isSafeInteger(machineId)||machineId<1)return json({error:'Choose a valid mining machine.'},400);
   const machine=await env.DB.prepare('SELECT * FROM mining_machines WHERE id=? AND active=1').bind(machineId).first();
   if(!machine)return json({error:'This mining machine is not available.'},404);
   // Settle production at the old rate before a purchase so the new rate is not applied retroactively.
   await env.DB.prepare('UPDATE mining_state SET last_collected_at=? WHERE telegram_id=?').bind(now,id).run();
   if(s.pending>0){
    await env.DB.batch([
     env.DB.prepare('UPDATE users SET balance_points=balance_points+?,updated_at=? WHERE telegram_id=?').bind(s.pending,now,id),
     env.DB.prepare("INSERT INTO ledger(telegram_id,delta_points,reason,reference_type) VALUES(?,?,'Mining machine earnings','mining')").bind(id,s.pending)
    ]);
   }
   const balance=await env.DB.prepare('SELECT balance_points FROM users WHERE telegram_id=?').bind(id).first();
   if(Number(balance?.balance_points||0)<machine.cost_points)return json({error:'Not enough TR to buy this machine.'},400);
   const owned=await env.DB.prepare('SELECT quantity FROM user_machines WHERE telegram_id=? AND machine_id=?').bind(id,machineId).first();
   await env.DB.batch([
    env.DB.prepare('UPDATE users SET balance_points=balance_points-?,updated_at=? WHERE telegram_id=? AND balance_points>=?').bind(machine.cost_points,now,id,machine.cost_points),
    env.DB.prepare("INSERT INTO ledger(telegram_id,delta_points,reason,reference_type,reference_id) VALUES(?,?,'Bought mining machine','machine',?)").bind(id,-machine.cost_points,machineId),
    owned
      ? env.DB.prepare('UPDATE user_machines SET quantity=quantity+1 WHERE telegram_id=? AND machine_id=?').bind(id,machineId)
      : env.DB.prepare('INSERT INTO user_machines(telegram_id,machine_id,quantity) VALUES(?,?,1)').bind(id,machineId)
   ]);
   return json({ok:true,bought:machine.name,cost:machine.cost_points});
  }
  return json({error:'Unknown mining action.'},400);
 }catch(e){return fail(e);}
}