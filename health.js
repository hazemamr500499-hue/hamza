module.exports = function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const missing=['PUSHER_APP_ID','PUSHER_SECRET'].filter(k=>!process.env[k]);
 res.status(missing.length?503:200).json({api:'online',configured:missing.length===0,missing,cluster:process.env.PUSHER_CLUSTER||'eu',message:missing.length?'أضف المتغيرات الناقصة في Vercel ثم اعمل Redeploy':'الإعدادات موجودة؛ جرّب إنشاء غرفة للتحقق من صحة بيانات Pusher'});
};
