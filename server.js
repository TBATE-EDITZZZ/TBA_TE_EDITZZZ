// Run with Node.js 20+. Set API keys as server environment variables, never in the browser.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const port = Number(process.env.PORT || 3000);
const hits = new Map();
function send(res, status, data) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(data)); }
http.createServer(async (req,res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff'});return fs.createReadStream(path.join(__dirname,'index.html')).pipe(res)}
  if (req.method === 'GET' && req.url === '/profile.jpg') {res.writeHead(200,{'Content-Type':'image/jpeg','X-Content-Type-Options':'nosniff'});return fs.createReadStream(path.join(__dirname,'profile.jpg')).pipe(res)}
  if (req.method !== 'POST' || req.url !== '/api/chat') return send(res,404,{error:'Not found'});
  const ip=req.socket.remoteAddress || 'unknown', now=Date.now();
  if (hits.size > 10000) for (const [k,v] of hits) if(now-v.start>60000) hits.delete(k);
  const hit=hits.get(ip) || {start:now,count:0}; if(now-hit.start>60000){hit.start=now;hit.count=0} hit.count++; hits.set(ip,hit);
  if(hit.count>10) return send(res,429,{error:'Please try again later.'});
  let raw=''; try { for await (const chunk of req) {raw+=chunk; if(raw.length>20000) return send(res,413,{error:'Message too large'});} const {provider,message,history}=JSON.parse(raw);
    if(!['openai','anthropic'].includes(provider)||typeof message!=='string'||!message.trim()||message.length>2000) return send(res,400,{error:'Invalid message'});
    const key=provider==='openai'?process.env.OPENAI_API_KEY:process.env.ANTHROPIC_API_KEY; if(!key) return send(res,503,{error:'Assistant not configured'});
    const messages=(Array.isArray(history)?history:[]).slice(-8).filter(m=>m && ['user','assistant'].includes(m.role)&&typeof m.content==='string'&&m.content.length<=4000).map(m=>({role:m.role,content:m.content}));messages.push({role:'user',content:message});
    const system='You are a helpful website assistant for TBA_TE_EDITZZZ. Be concise and friendly. Do not invent personal details about the creator.';
    let response;
    if(provider==='openai') response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4o-mini',messages:[{role:'system',content:system},...messages],max_tokens:400})});
    else response=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:process.env.ANTHROPIC_MODEL||'claude-sonnet-4-5',system,messages,max_tokens:400})});
    if(!response.ok) return send(res,502,{error:'AI service unavailable'});const result=await response.json();const reply=provider==='openai'?result.choices?.[0]?.message?.content:result.content?.filter(x=>x.type==='text').map(x=>x.text).join('\n');if(!reply) return send(res,502,{error:'Empty response'});send(res,200,{reply});
  } catch(err) {send(res,500,{error:'Chat unavailable'});}
}).listen(port,()=>console.log('Website listening on port '+port));