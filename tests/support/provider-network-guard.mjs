import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

const marker = Symbol.for('hitlink.coaching.proof.network.guard');
export function installProviderNetworkGuard() {
  if (globalThis[marker]) return globalThis[marker];
  const original = { httpRequest:http.request, httpsRequest:https.request,
    socketConnect:net.Socket.prototype.connect, tlsConnect:tls.connect, fetch:globalThis.fetch };
  const report = { blocked:[], allowedSocketAttempts:0, openedLoopbackSockets:0, openedExternalSockets:0 };
  const local = host => ['127.0.0.1','localhost','::1','[::1]'].includes(String(host).toLowerCase());
  const deny = (channel,host) => {
    report.blocked.push({channel,host:String(host)});
    throw new Error(`PROOF_NETWORK_BLOCKED:${channel}:${host}`);
  };
  const requestHost = first => {
    if (first instanceof URL) return first.hostname;
    if (typeof first === 'string') return new URL(first).hostname;
    return first?.hostname ?? first?.host ?? 'localhost';
  };
  const connectHost = args => {
    let first=args[0];
    if (Array.isArray(first)) return connectHost(first);
    if (first && typeof first==='object') {
      if (first.path && !first.port && !first.host) return null; // local Unix pipe
      return first.hostname ?? first.host ?? 'localhost';
    }
    if (typeof first==='number' || (typeof first==='string' && /^\d+$/.test(first)))
      return typeof args[1]==='string' ? args[1] : 'localhost';
    if (typeof first==='string') return null; // local Unix pipe
    return 'localhost';
  };
  http.request=function(...args){const host=requestHost(args[0]);if(!local(host))return deny('http.request',host);return Reflect.apply(original.httpRequest,this,args);};
  https.request=function(...args){const host=requestHost(args[0]);if(!local(host))return deny('https.request',host);return Reflect.apply(original.httpsRequest,this,args);};
  tls.connect=function(...args){const host=connectHost(args);if(host!==null&&!local(host))return deny('tls.connect',host);return Reflect.apply(original.tlsConnect,this,args);};
  net.Socket.prototype.connect=function(...args){
    const host=connectHost(args);
    if(host!==null&&!local(host))return deny('Socket.connect',host);
    report.allowedSocketAttempts++;
    this.once('connect',()=>{if(this.remoteAddress && !local(this.remoteAddress))report.openedExternalSockets++;else report.openedLoopbackSockets++;});
    return Reflect.apply(original.socketConnect,this,args);
  };
  globalThis.fetch=async function(input,...args){const host=requestHost(typeof input==='string'||input instanceof URL?input:input.url);if(!local(host))return deny('fetch',host);return Reflect.apply(original.fetch,this,[input,...args]);};
  const guard={report,originalFetch:original.fetch,restore(){
    if(globalThis[marker]!==guard)return;
    http.request=original.httpRequest;https.request=original.httpsRequest;
    net.Socket.prototype.connect=original.socketConnect;tls.connect=original.tlsConnect;
    globalThis.fetch=original.fetch;delete globalThis[marker];
  }};
  globalThis[marker]=guard;
  return guard;
}
