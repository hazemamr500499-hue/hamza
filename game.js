const Pusher = require('pusher');
const crypto = require('crypto');
const KEY = process.env.PUSHER_KEY || '07c556d525cea47a91e5';
const CLUSTER = process.env.PUSHER_CLUSTER || 'eu';
const validRoom = s => typeof s === 'string' && /^\d{4}$/.test(s);
const channel = room => `private-drift-${room}`;
let pusher;
function getPusher(){
  if (!process.env.PUSHER_APP_ID || !process.env.PUSHER_SECRET) throw Error('Pusher environment variables are missing');
  return pusher ||= new Pusher({appId:process.env.PUSHER_APP_ID,key:KEY,secret:process.env.PUSHER_SECRET,cluster:CLUSTER,useTLS:true});
}
function sign(v){return crypto.createHmac('sha256',process.env.PUSHER_SECRET).update(v).digest('base64url')}
function issue(room,id){const v=Buffer.from(JSON.stringify({room,id,exp:Date.now()+6*3600000})).toString('base64url');return `${v}.${sign(v)}`}
function verify(token){if(typeof token!=='string'||token.length>800)return null;const [v,s]=token.split('.');if(!v||!s||sign(v).length!==s.length||!crypto.timingSafeEqual(Buffer.from(sign(v)),Buffer.from(s)))return null;try{const data=JSON.parse(Buffer.from(v,'base64url').toString());return validRoom(data.room)&&typeof data.id==='string'&&data.id.length<90&&data.exp>Date.now()?data:null}catch{return null}}
async function count(room){try{const response=await getPusher().get({path:`/channels/${channel(room)}`,params:{info:'subscription_count'}});const obj=await response.json();return Number(obj.subscription_count)||0}catch(e){if(e.status===404||e.statusCode===404)return 0;throw e}}
const error=(res,status,message)=>res.status(status).json({error:message});
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return error(res,405,'POST only');
  try{
    const {action,room,token,socket_id:socketId,channel_name:channelName,payload}=req.body||{};
    const p=getPusher();
    if(action==='create'){
      for(let i=0;i<18;i++){
        const code=String(crypto.randomInt(0,10000)).padStart(4,'0');
        if(await count(code)===0){const id=crypto.randomUUID();return res.json({room:code,id,token:issue(code,id),key:KEY,cluster:CLUSTER});}
      }
      return error(res,503,'تعذّر تخصيص غرفة جديدة، حاول مجددًا');
    }
    if(action==='join'){
      if(!validRoom(room))return error(res,400,'الكود لازم يكون 4 أرقام');
      if(await count(room)<1)return error(res,404,'الغرفة مش موجودة أو صاحبها خرج');
      const id=crypto.randomUUID();return res.json({room,id,token:issue(room,id),key:KEY,cluster:CLUSTER});
    }
    const session=verify(token);
    if(!session)return error(res,401,'جلسة الغرفة غير صالحة');
    if(action==='auth'){
      if(channelName!==channel(session.room)||!/^\d+\.\d+$/.test(String(socketId)))return error(res,403,'Channel mismatch');
      return res.json(p.authorizeChannel(socketId,channelName));
    }
    if(action==='publish'){
      if(!payload||typeof payload!=='object'||Array.isArray(payload))return error(res,400,'Invalid payload');
      if(!['state','bye'].includes(payload.kind))return error(res,400,'Unsupported event');
      const data={kind:payload.kind,id:session.id};
      if(data.kind==='state'){
        const x=Number(payload.x),z=Number(payload.z),yaw=Number(payload.yaw);
        if(![x,z,yaw].every(Number.isFinite)||Math.max(Math.abs(x),Math.abs(z))>100000||Math.abs(yaw)>10000)return error(res,400,'Invalid coordinates');
        data.x=x;data.z=z;data.yaw=yaw;data.car=typeof payload.car==='string'?payload.car.slice(0,30):'junk';
      }
      await p.trigger(channel(session.room),'player-update',data,{socket_id:typeof socketId==='string'?socketId:undefined});
      return res.json({ok:true});
    }
    return error(res,400,'Unknown action');
  }catch(e){console.error('game api:',e);return error(res,500,'تأكد من إعداد PUSHER_APP_ID و PUSHER_SECRET في Vercel، أو حالة خدمة Pusher')}
};
