// Explicit opt-in; ordinary configured installations keep the established entry.
if(process.env.FRONTBASE_BOOTSTRAP!=='1')await import('./node.js');
else {
 const [{serve},{createConfiguredNode},{createDockerBootstrapHost},{default:assets}]=await Promise.all([
  import('@hono/node-server'),import('./node-runtime.js'),import('../../../scripts/deployment-setup/docker-bootstrap-host.mjs'),import('virtual:bootstrap-assets')
 ]);
 const host=await createDockerBootstrapHost({env:process.env,boot:createConfiguredNode,assets});
 const origin=new URL(process.env.FRONTBASE_PUBLIC_ORIGIN!);
 const port=Number(process.env.PORT??8787);if(!Number.isInteger(port)||port<1||port>65535)throw Error('invalid_port');
 const server=serve({port,hostname:process.env.HOST??'0.0.0.0',fetch:request=>{
  const url=new URL(request.url);if(url.pathname==='/health'&&!url.search&&request.method==='GET'&&['127.0.0.1','localhost'].includes(url.hostname)){url.host=origin.host;}
  if(url.host!==origin.host)return new Response('Invalid host',{status:403});
  // TLS terminates at the operator's reverse proxy. No forwarded host is trusted.
  url.protocol=origin.protocol;return host.fetch(new Request(url,request));
 }});
 console.log('[frontbase] Explicit hosted setup listener started');
 const close=()=>server.close(()=>void Promise.resolve(host.close()).finally(()=>process.exit(0)));
 process.on('SIGTERM',close);process.on('SIGINT',close);
}
