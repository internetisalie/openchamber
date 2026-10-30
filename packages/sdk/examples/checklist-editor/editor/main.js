(()=>{var S="openchamber.sdk",g=1;var Ke=`
:root {
  /* Quiet at rest like the app's own thumbs; hover gives a clear grab target. */
  --oc-scrollbar-thumb: color-mix(in srgb, var(--oc-muted, currentColor) 18%, transparent);
  --oc-scrollbar-thumb-hover: color-mix(in srgb, var(--oc-muted, currentColor) 36%, transparent);
  scrollbar-gutter: stable;
}
* {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
:hover, [data-oc-scrolling] {
  scrollbar-color: var(--oc-scrollbar-thumb) transparent;
}
/* Chromium's standard scrollbar properties otherwise override its pseudo-elements. */
@supports selector(::-webkit-scrollbar) {
  *, :hover, [data-oc-scrolling] { scrollbar-width: auto; scrollbar-color: auto; }
  ::-webkit-scrollbar { width: 6px; height: 6px; background: transparent; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 999px;
    min-width: 24px;
    min-height: 24px;
  }
  :hover::-webkit-scrollbar-thumb, [data-oc-scrolling]::-webkit-scrollbar-thumb { background: var(--oc-scrollbar-thumb); }
  ::-webkit-scrollbar-thumb:hover { background: var(--oc-scrollbar-thumb-hover); }
  ::-webkit-scrollbar-corner { background: transparent; }
  ::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
}
@media (forced-colors: active) {
  *, :hover, [data-oc-scrolling] { scrollbar-color: auto; }
  ::-webkit-scrollbar-thumb, ::-webkit-scrollbar-thumb:hover { background: CanvasText; }
}
`;function Je(e){let r=e.documentElement;if(r.hasAttribute("data-oc-scrollbar-activity"))return;r.setAttribute("data-oc-scrollbar-activity","");let s=new WeakMap;e.addEventListener("scroll",(l)=>{let c=l.target===e?r:l.target;if(!(c instanceof Element))return;if(!c.hasAttribute("data-oc-scrolling"))c.setAttribute("data-oc-scrolling","");let E=s.get(c);if(E!==void 0)clearTimeout(E);s.set(c,setTimeout(()=>{s.delete(c),c.removeAttribute("data-oc-scrolling")},1000))},{capture:!0,passive:!0})}var Vo=`(${Je.toString()})(document);`;var Ye=128,Qe=65536;var be=128;var xe=65536;var eo=/^[a-z][a-z0-9-]{0,39}$/;var Yt=(e)=>Object(e)===e&&!Array.isArray(e),Ze=(e,r)=>Object.keys(e).every((s)=>r.includes(s)),Qt=(e)=>String(e)===e&&e.length>=1&&e.length<=60,Zt=(e)=>String(e)===e&&e.length>=1&&e.length<=80,to=(e)=>{if(!Array.isArray(e)||e.length>4)return!1;let r=new Set;for(let s of e){if(!Yt(s)||!eo.test(s.id)||!Qt(s.label))return!1;if(s.disabled!==void 0&&s.disabled!==!0&&s.disabled!==!1)return!1;if(r.has(s.id))return!1;if(r.add(s.id),s.kind==="button"){if(!Ze(s,["kind","id","label","disabled"]))return!1;continue}if(s.kind!=="select"||!Ze(s,["kind","id","label","value","options","disabled"]))return!1;if(!Zt(s.value)||!Array.isArray(s.options)||s.options.length<1||s.options.length>16)return!1;let l=new Set;for(let c of s.options){if(!Yt(c)||!Ze(c,["value","label"])||!Zt(c.value)||!Qt(c.label)||l.has(c.value))return!1;l.add(c.value)}if(!l.has(s.value))return!1}return!0};var oo=["turn-finished","turn-failed","permission-asked","question-asked"];var hr=new Set(oo);var Re=20000000,ve=256;var et=(e)=>("bytes"in e)?e.bytes.byteLength:e.content.length,ro=(e,r)=>{if(e.path!==r.path||e.readOnly!==r.readOnly)return!1;if(e.encoding==="text"||r.encoding==="text")return e.encoding==="text"&&r.encoding==="text"&&e.content===r.content;if(e.bytes.byteLength!==r.bytes.byteLength)return!1;for(let s=0;s<e.bytes.byteLength;s+=1)if(e.bytes[s]!==r.bytes[s])return!1;return!0},Oe=(e)=>{let r=e,s=e;return{observe:(l)=>{let c=l!==s;return s=l,{edited:c,dirty:l!==r}},markSaved:(l)=>(r=l,s!==l)}};var so=/^[A-Za-z0-9_-]{1,80}$/;var no=["left","right","top","bottom"];var io=(e,r=0,s={remaining:16000})=>{if(--s.remaining<0||r>=32)return!1;if(e===null)return!0;let l=Array.isArray(e)?e:Object(e)===e?Object.values(e):[];for(let c of l)if(!io(c,r+1,s))return!1;return!0},tt=(e)=>{if(e===null||e===!0||e===!1)return!0;if(Array.isArray(e))return Object.keys(e).every((r)=>/^(0|[1-9]\d*)$/.test(r)&&Number(r)<e.length)&&e.every(tt);if(Object(e)===e){let r=Object.getPrototypeOf(e);return(r===null||r===Object.prototype)&&Object.values(e).every(tt)}return String(e)===e||Number.isFinite(e)},ot=(e)=>{try{if(String(e.id)!==e.id||!so.test(e.id)||!Number.isFinite(e.anchor.x)||Math.abs(e.anchor.x)>1e5||!Number.isFinite(e.anchor.y)||Math.abs(e.anchor.y)>1e5||!Number.isFinite(e.anchor.width)||!Number.isFinite(e.anchor.height)||e.anchor.width<=0||e.anchor.height<=0||e.anchor.width>1e5||e.anchor.height>1e5||!Number.isInteger(e.width)||e.width<160||e.width>640||!Number.isInteger(e.height)||e.height<48||e.height>480||e.side!==void 0&&!no.includes(e.side)||e.focus!==void 0&&e.focus!==!0&&e.focus!==!1||!io(e.data)||!tt(e.data))return!1;return JSON.stringify(e.data).length<=16000}catch{return!1}};var lo=["file","directory","other","missing"],st=(e)=>Boolean(e&&"sessionId"in e),nt=(e)=>Boolean(e&&"sent"in e&&!("sessionId"in e));var uo=/^[0-9a-f]{7,64}$/i,it=(e)=>uo.test(e),Ce=500,Ae=32000,co=16000,po=128,So=200,go=2000,Eo=16000,mo=80,fo=200,_o=16000;var To=2000;var ke=8000000,at=4194304,lt=20000,Ge=1024,Pe=2000000;var Ie=64000,Me=8000,ut=4000;var ct=960000;var ho=999,yo=1e4,de=500,bo=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","REQUEST_FAILED","RESPONSE_TOO_LARGE","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED","UNSUPPORTED"],xo=["stopped","starting","ready","failed"],qo=new Set(bo),Ro=(e)=>qo.has(e),vo=(e)=>e&&Ro(e)?e:"HOST_REJECTED",ee=(e)=>{if(e===void 0)return!1;if(e===null||e===!0||e===!1)return!0;if(String(e)===e)return!0;if(Number(e)===e)return Number.isFinite(e);if(Array.isArray(e))return e.every(ee);if(Object(e)===e)return Object.values(e).every(ee);return!1},Oo=(e)=>ee(e)&&JSON.stringify(e).length<=_o,ao=(e)=>e?.trim().slice(0,fo)??"",te=(e)=>{let r=e.id.trim().slice(0,po),s=e.title.trim().slice(0,So),l=e.url.trim().slice(0,go),c=e.text?.trim().slice(0,Eo),E=e.author?.trim().slice(0,mo),_=e.kind==="pull"?"pull":"issue",m={providerId:e.providerId.trim(),id:r,title:s||r,url:l,kind:_};if(c)m.text=c;if(E)m.author=E;if(_==="pull"){let A=ao(e.branches?.head),M=ao(e.branches?.base);if(A&&M)m.branches={head:A,base:M}}if(Oo(e.data))m.data=e.data;return m},pt=(e)=>{let r=te(e);if(e.projectId)r.projectId=e.projectId;if(e.navigation)r.navigation=e.navigation;if(e.worktree)r.worktree=e.worktree;return r},dt=(e)=>{let r={text:e.text.trim().slice(0,co)};if(e.send)r.send=!0;return r},St=(e)=>{if(e===null||!Number.isFinite(e))return null;return Math.min(ho,Math.max(0,Math.round(e)))},gt=(e)=>{if(!Number.isFinite(e))return 0;return Math.min(yo,Math.max(0,Math.ceil(e)))};var oe=(e)=>e.length>0&&e.length<=Ge&&!e.includes("\x00")&&!e.includes("\\");var Se=(e)=>{if(!e.startsWith("/")||e.includes("\x00")||e.includes("\\")||e.includes("://"))return!1;if(e.length>To)return!1;return!e.split("/").some((s)=>s==="."||s==="..")},$o=new Set(xo),Et=(e)=>Boolean(e&&"status"in e&&$o.has(String(e.status))&&!("body"in e)),ge=(e)=>Boolean(e&&"status"in e&&"body"in e&&Number.isInteger(e.status)),mt=(e)=>Boolean(e&&"content"in e&&String(e.content)===e.content),ft=(e)=>Boolean(e&&"written"in e&&e.written===!0),_t=(e)=>Boolean(e&&"entries"in e&&Array.isArray(e.entries)),Wo=new Set(lo),Tt=(e)=>Boolean(e&&"kind"in e&&"size"in e&&Wo.has(String(e.kind))&&Number.isFinite(e.size)),ht=(e)=>Boolean(e&&"text"in e&&String(e.text)===e.text&&!("status"in e)),jo=new Set(["workspace","shells","ready","directory","session","connection","settings","session-lifecycle","item","resolve","action","status-control-event","popover-closed","file-open","file-snapshot","file-saved","generate-late"]),zo=(e)=>Object(e)===e?e:null,rt=(e)=>String(e)===e&&e.length>0,Ko=(e)=>{if(!rt(e.id))return null;if(e.ok===!0){let r={channel:S,v:g,type:"result",id:e.id,ok:!0};if(Object(e.payload)===e.payload)r.payload=e.payload;return r}if(e.ok===!1&&rt(e.error))return{channel:S,v:g,type:"result",id:e.id,ok:!1,error:e.error,code:vo(rt(e.code)?e.code:void 0)};return null},yt=(e)=>{let r=zo(e);if(!r||r.channel!==S||r.v!==g)return null;if(r.type==="result")return Ko(r);if(!jo.has(String(r.type))||Object(r.payload)!==r.payload)return null;return r};var Co=(e)=>("key"in e)&&("metaKey"in e)&&("ctrlKey"in e),Jo=(e)=>(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="s";class a extends Error{code;constructor(e,r){super(r);this.name="HostRequestError",this.code=e}}var bt=()=>Promise.reject(new a("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),we=()=>Promise.reject(new a("BAD_PATH",`File path must be 1 to ${Ge} characters without NUL or backslash.`)),Ue=(e)=>{if(e===void 0)return;if(Object(e)!==e||Array.isArray(e)||e.scope!==void 0&&e.scope!=="instance"&&e.scope!=="device")throw new a("HOST_REJECTED",'Storage scope must be "instance" or "device".');return e.scope==="device"?"device":void 0},d=(e)=>(e.value+=1,`oc-${e.value}`),xt=(e={})=>{let r=e.target??("window"in globalThis?window:null);if(!r)throw new a("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let s=e.acceptSource??((t)=>t===r.parent),l=e.requestTimeoutMs??lt,c=new Set,E=new Set,_=new Set,m=new Set,A=new Set,M=new Set,ne=new Set,Ee=new Set,me=new Set,J=new Set,qe=[],ie=null,ae=null,fe=new Set,_e=new Set,le=null,ue=null,$e=!1,Y=new Map,Q=new Map,Z=new Map,H=!1,p={value:0},u=null,D=null,ce=!1,pe=!1,Dt=null,Ft=(t)=>{if(!t)return null;return{sessionId:t.id,phase:t.busy?"started":"completed"}},w=(t)=>{r.parent.postMessage(t,"*")},Bt=()=>{if(H||r.parent===r||J.size===0||u?.features?.lateGenerateResults!==!0)return;w({channel:S,v:g,type:"generate-late-listen"})},b=(t,o)=>{for(let i of t)try{i(o)}catch(n){console.error(n)}},Vt=(t)=>{if(!(t instanceof MessageEvent))return;if(!s(t.source))return;let o=yt(t.data);if(!o)return;if(o.type==="workspace"){let n=Q.get(o.payload.subscriptionId);if(n)b([n],o.payload.snapshot);return}if(o.type==="shells"){let n=Z.get(o.payload.subscriptionId);if(n)b([n],o.payload.snapshot);return}if(o.type==="ready"){let n=o.payload;if(u=n,D=Ft(n.session),b(c,n),b(E,n.directory),b(_,n.session),D)b(m,D);b(A,n.connection),b(M,n.settings),b(ne,n.item),Bt();return}if(o.type==="generate-late"){if(J.size===0)qe.push(o.payload);else b(J,o.payload);return}if(o.type==="directory"){if(u)u={...u,directory:o.payload.directory};b(E,o.payload.directory);return}if(o.type==="session"){if(u)u={...u,session:o.payload.session};if(!o.payload.session)D=null;else if(D?.sessionId!==o.payload.session.id)D=Ft(o.payload.session);b(_,o.payload.session);return}if(o.type==="session-lifecycle"){D=o.payload,b(m,o.payload);return}if(o.type==="connection"){if(u)u={...u,connection:o.payload.connection};b(A,o.payload.connection);return}if(o.type==="settings"){if(u)u={...u,settings:o.payload.settings};b(M,o.payload.settings);return}if(o.type==="item"){if(u)u={...u,item:o.payload.item};b(ne,o.payload.item);return}if(o.type==="status-control-event"){b(Ee,o.payload);return}if(o.type==="popover-closed"){b(me,o.payload);return}if(o.type==="action"){let n=(f)=>{if(!H)w({channel:S,v:g,type:"action-result",id:o.id,payload:f})},T=ae;if(!T){n({ok:!1,error:"This extension does not handle background actions."});return}Promise.resolve().then(()=>T(o.payload)).then(()=>n({ok:!0}),(f)=>{let v=(f instanceof Error?f.message:String(f)).trim();n({ok:!1,error:(v||"Action failed.").slice(0,de)})});return}if(o.type==="file-open"){let n=o.payload;if(ue&&ro(ue,n))return;ue=n,b(fe,o.payload);return}if(o.type==="file-saved"){b(_e,o.payload.version);return}if(o.type==="file-snapshot"){let n=(v)=>{if(!H)w({channel:S,v:g,type:"file-snapshot-result",id:o.id,payload:v})},T=(v)=>n({error:(v.trim()||"Could not read the edited file.").slice(0,de)}),f=le;if(!f){T("This extension does not edit files.");return}Promise.resolve().then(()=>f(o.payload.purpose)).then((v)=>{if(et(v)>Re){T(`The file is over ${Re} ${"bytes"in v?"bytes":"characters"}.`);return}if(v.version.length>ve){T(`The snapshot version is over ${ve} characters.`);return}n({snapshot:"bytes"in v?{bytes:v.bytes,version:v.version}:{content:v.content,version:v.version}})},(v)=>T(v instanceof Error?v.message:String(v)));return}if(o.type==="resolve"){let n=(f)=>{w({channel:S,v:g,type:"resolve-result",id:o.id,payload:f})},T=ie;if(!T){n({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>T(o.payload)).then((f)=>n({item:f?te(f):null}),(f)=>{let v=(f instanceof Error?f.message:String(f)).trim();n({error:(v||"Command failed.").slice(0,de)})});return}let i=Y.get(o.id);if(!i)return;if(clearTimeout(i.timer),Y.delete(o.id),o.ok){i.resolve(o.payload);return}i.reject(new a(o.code,o.error))};r.addEventListener("message",Vt),w({channel:S,v:g,type:"hello"});let P=(t,o=l)=>{if(H||r.parent===r)return Promise.reject(new a("HOST_UNAVAILABLE","No host frame. This page is not in an iframe."));return new Promise((i,n)=>{let T=setTimeout(()=>{Y.delete(t.id),n(new a("HOST_TIMEOUT","Host did not answer in time."))},o);Y.set(t.id,{resolve:i,reject:n,timer:T}),w(t)})},x=(t)=>P(t).then(()=>{return}),R={channel:S,v:g},We=(t)=>{if(!H&&r.parent!==r)w(t)},Xt=()=>We({...R,type:"file-save"}),qt=(t)=>{if(!Co(t)||!Jo(t))return;t.preventDefault(),Xt()},$t=(t)=>{if(!Co(t)||t.key!=="Escape"||u?.surface!=="popover"||!u.popover)return;t.preventDefault(),Kt(u.popover.id,"escape").catch(()=>{return})},Te=()=>{let t=u?.surface==="popover"?u.popover:void 0;if(!t)return;let o=ce||pe;if(Dt===o)return;Dt=o,Jt(t.id,o).catch(()=>{return})},he=()=>{if(u?.surface!=="popover"||ce)return;ce=!0,Te()},Wt=(t)=>{if(u?.surface!=="popover"||t.relatedTarget!==null||!ce)return;ce=!1,Te()},jt=()=>{if(u?.surface!=="popover"||pe)return;pe=!0,Te()},zt=()=>{if(u?.surface!=="popover"||!pe)return;pe=!1,Te()},N=(t,o=1024)=>{if(!t.trim()||t.length>o)throw new a("HOST_REJECTED",`Identity must contain 1 to ${o} characters.`)},je=async(t)=>{if(t.kind!=="projects")N(t.projectId);let o=await P({...R,type:"workspace-read",id:d(p),payload:t});if(!o||!("kind"in o)||!("state"in o)||o.kind!==t.kind)throw new a("HOST_REJECTED","Host did not return workspace data.");return o},ze=async(t,o)=>{if(t.kind!=="projects")N(t.projectId);let i=d(p);Q.set(i,o);try{await x({...R,type:"workspace-subscribe",id:d(p),payload:{subscriptionId:i,query:t}})}catch(n){if(Q.delete(i),!H)w({...R,type:"workspace-unsubscribe",id:d(p),payload:{subscriptionId:i}});throw n}return()=>{if(!Q.delete(i)||H)return;w({...R,type:"workspace-unsubscribe",id:d(p),payload:{subscriptionId:i}})}},Bo=async(t,o)=>{if(t.kind==="session")N(t.sessionId);if(t.kind==="project")N(t.projectId);let i=d(p);Z.set(i,o);try{await x({...R,type:"shells-subscribe",id:d(p),payload:{subscriptionId:i,scope:t}})}catch(n){if(Z.delete(i),!H)w({...R,type:"shells-unsubscribe",id:d(p),payload:{subscriptionId:i}});throw n}return()=>{if(!Z.delete(i)||H)return;w({...R,type:"shells-unsubscribe",id:d(p),payload:{subscriptionId:i}})}},ye=async(t)=>{if("key"in t&&(t.key.length===0||t.key.length>Ye))throw new a("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(t.op==="set"&&!ee(t.value))throw new a("HOST_REJECTED","Storage values must be JSON.");if(t.op==="set"&&new TextEncoder().encode(JSON.stringify(t.value)).length>Qe)throw new a("HOST_REJECTED","Storage value exceeds 64 KiB.");if(t.scope==="device"&&u?.features?.deviceStorage!==!0)throw new a("UNSUPPORTED","This host does not support device storage.");let o=await P({...R,type:"storage",id:d(p),payload:t});if(!o||!("storage"in o)||o.op!==t.op)throw new a("HOST_REJECTED","Host did not return storage data.");return o},Kt=(t,o)=>u?.features?.popovers!==!0&&!(u?.surface==="popover"&&u.popover?.id===t)?Promise.reject(new a("UNSUPPORTED","This host does not support popovers.")):x({...R,type:"popover-close",id:d(p),payload:o?{id:t,reason:o}:{id:t}}),Jt=(t,o)=>u?.features?.popovers!==!0&&!(u?.surface==="popover"&&u.popover?.id===t)?Promise.reject(new a("UNSUPPORTED","This host does not support popovers.")):x({...R,type:"popover-anchor",id:d(p),payload:{id:t,active:o}});return r.addEventListener("keydown",$t,!0),r.addEventListener("pointerover",he),r.addEventListener("pointermove",he),r.addEventListener("pointerout",Wt),r.addEventListener("focus",jt),r.addEventListener("blur",zt),{onAction:(t)=>(ae=t,()=>{if(ae===t)ae=null}),listProjects:async()=>{let t=await je({kind:"projects"});if(t.kind!=="projects")throw new a("HOST_REJECTED","Expected projects.");return t},listWorktrees:async(t)=>{let o=await je({kind:"worktrees",projectId:t});if(o.kind!=="worktrees")throw new a("HOST_REJECTED","Expected worktrees.");return o},listSessions:async(t)=>{let o=await je({kind:"sessions",projectId:t});if(o.kind!=="sessions")throw new a("HOST_REJECTED","Expected sessions.");return o},onProjects:(t)=>ze({kind:"projects"},(o)=>{if(o.kind==="projects")t(o)}),onWorktrees:(t,o)=>ze({kind:"worktrees",projectId:t},(i)=>{if(i.kind==="worktrees")o(i)}),onSessions:(t,o)=>ze({kind:"sessions",projectId:t},(i)=>{if(i.kind==="sessions")o(i)}),onRunningShells:(t,o)=>Bo(t,o),readShellOutput:async(t,o)=>{N(t,be);let i=o?.cursor;if(i!==void 0&&(!Number.isInteger(i)||i<0))throw new a("HOST_REJECTED","Shell output cursor must be a non-negative integer.");let n=o?.tailBytes;if(n!==void 0&&(!Number.isInteger(n)||n<1||n>xe))throw new a("HOST_REJECTED",`Shell output tailBytes must be an integer between 1 and ${xe}.`);let f=await P({...R,type:"shell-output",id:d(p),payload:{shellId:t,cursor:i,tailBytes:n}});if(!f||typeof f.output!=="string"||!Number.isFinite(f.cursor))throw new a("HOST_REJECTED","Host did not return shell output.");return f},stopShell:async(t)=>{if(N(t,be),(await P({...R,type:"shell-stop",id:d(p),payload:{shellId:t}}))?.stopped!==!0)throw new a("HOST_REJECTED","Host did not stop the shell.");return{stopped:!0}},openSession:async(t)=>{N(t),await x({...R,type:"open-session",id:d(p),payload:{sessionId:t}})},storage:{get:async(t,o)=>{let i=Ue(o),n={op:"get",key:t};if(i)n.scope=i;let T=await ye(n);return T.op==="get"&&T.found?T.value:void 0},set:async(t,o,i)=>{let n=Ue(i),T={op:"set",key:t,value:o};if(n)T.scope=n;await ye(T)},delete:async(t,o)=>{let i=Ue(o),n={op:"delete",key:t};if(i)n.scope=i;await ye(n)},keys:async(t)=>{let o=Ue(t),i={op:"keys"};if(o)i.scope=o;let n=await ye(i);if(n.op!=="keys")throw new a("HOST_REJECTED","Expected storage keys.");return n.keys}},onReady:(t)=>{if(c.add(t),u)t(u);return()=>{c.delete(t)}},onDirectory:(t)=>{if(E.add(t),u)t(u.directory);return()=>{E.delete(t)}},onSession:(t)=>{if(_.add(t),u)t(u.session);return()=>{_.delete(t)}},onSessionLifecycle:(t)=>{if(m.add(t),D)t(D);return()=>{m.delete(t)}},onConnection:(t)=>{if(A.add(t),u)t(u.connection);return()=>{A.delete(t)}},onSettings:(t)=>{if(M.add(t),u)t(u.settings);return()=>{M.delete(t)}},onItem:(t)=>{if(ne.add(t),u)t(u.item);return()=>{ne.delete(t)}},onStatusControl:(t)=>(Ee.add(t),()=>{Ee.delete(t)}),onPopoverClosed:(t)=>(me.add(t),()=>{me.delete(t)}),setStatusControls:(t)=>{if(u?.features?.statusControls!==!0)return Promise.reject(new a("UNSUPPORTED","This host does not support status controls."));if(!to(t))return Promise.reject(new a("HOST_REJECTED","Status controls must have unique bounded ids and valid selected options."));return x({...R,type:"status-controls",id:d(p),payload:{controls:t}})},openPopover:(t)=>{if(u?.features?.popovers!==!0)return Promise.reject(new a("UNSUPPORTED","This host does not support popovers."));if(!ot(t))return Promise.reject(new a("HOST_REJECTED","Popover requests need bounded geometry and JSON data."));return x({...R,type:"popover-open",id:d(p),payload:t})},closePopover:Kt,setPopoverAnchorActive:Jt,onResolve:(t)=>(ie=t,()=>{if(ie===t)ie=null}),toast:(t)=>{let o=t.message.trim();if(!o||o.length>Ce)return Promise.reject(new a("HOST_REJECTED",`Toast message must contain 1 to ${Ce} characters.`));if(t.copy&&t.copy!==!0&&(!t.copy.text.length||t.copy.text.length>Ae))return Promise.reject(new a("HOST_REJECTED",`Toast copy text must contain 1 to ${Ae} characters.`));return x({channel:S,v:g,type:"toast",id:d(p),payload:{...t,message:o}})},openUrl:(t)=>x({channel:S,v:g,type:"open-url",id:d(p),payload:{url:t}}),openCommit:(t)=>it(t)?x({channel:S,v:g,type:"open-commit",id:d(p),payload:{sha:t}}):Promise.reject(new a("HOST_REJECTED","Commit id must be 7 to 64 hex characters.")),openSurface:(t)=>x({channel:S,v:g,type:"open-surface",id:d(p),payload:{surfaceId:t}}),writeClipboard:(t)=>x({channel:S,v:g,type:"clipboard-write",id:d(p),payload:{text:t}}),compose:(t)=>x({channel:S,v:g,type:"compose",id:d(p),payload:t}),attach:(t)=>x({channel:S,v:g,type:"attach",id:d(p),payload:te(t)}),startSession:async(t)=>{if(t.projectId!==void 0)N(t.projectId);let o=t.worktree;if(o&&o!==!0)if(o.kind==="existing")N(o.directory);else{if(o.name!==void 0)N(o.name,200);if(o.baseBranch!==void 0)N(o.baseBranch,200)}let i=await P({channel:S,v:g,type:"start-session",id:d(p),payload:pt(t)},e.requestTimeoutMs??180000);if(!st(i))throw new a("HOST_REJECTED","Host did not return a session.");return i},prompt:(t)=>P({channel:S,v:g,type:"prompt",id:d(p),payload:dt(t)}).then((o)=>{if(!nt(o))throw new a("HOST_REJECTED","Host did not return a prompt result.");return o}),sessionLink:(t)=>x({channel:S,v:g,type:"session-link",id:d(p),payload:te(t)}),close:()=>x({channel:S,v:g,type:"close",id:d(p)}),oauthStart:()=>x({channel:S,v:g,type:"oauth-start",id:d(p)}),oauthDisconnect:()=>x({channel:S,v:g,type:"oauth-disconnect",id:d(p)}),request:(t)=>(Se(t.path)?P({channel:S,v:g,type:"request",id:d(p),payload:t}):bt()).then((o)=>{if(!ge(o))throw new a("HOST_REJECTED","Host request result was empty.");if(o.body.length>ke)throw new a("HOST_REJECTED","Host request result was too large.");return o}),openCodeRequest:(t)=>(Se(t.path)?P({channel:S,v:g,type:"opencode-request",id:d(p),payload:t}):bt()).then((o)=>{if(!ge(o))throw new a("HOST_REJECTED","Host OpenCode request result was empty.");if(o.body.length>at)throw new a("HOST_REJECTED","Host OpenCode request result was too large.");return o}),serviceRequest:(t)=>(Se(t.path)?P({channel:S,v:g,type:"service-request",id:d(p),payload:t}):bt()).then((o)=>{if(!ge(o))throw new a("HOST_REJECTED","Host service request result was empty.");if(o.body.length>ke)throw new a("HOST_REJECTED","Host service request result was too large.");return o}),serviceStatus:()=>P({channel:S,v:g,type:"service-status",id:d(p)}).then((t)=>{if(!Et(t))throw new a("HOST_REJECTED","Host did not return service status.");return t}),readFile:(t)=>(oe(t)?P({channel:S,v:g,type:"file-read",id:d(p),payload:{path:t}}):we()).then((o)=>{if(!mt(o))throw new a("HOST_REJECTED","Host did not return file content.");return o}),writeFile:(t,o)=>{if(!oe(t))return we();if(o.length>Pe)return Promise.reject(new a("FILE_TOO_LARGE",`Content is over ${Pe} characters.`));return P({channel:S,v:g,type:"file-write",id:d(p),payload:{path:t,content:o}}).then((i)=>{if(!ft(i))throw new a("HOST_REJECTED","Host did not confirm the write.");return i})},listDir:(t)=>(oe(t)?P({channel:S,v:g,type:"file-list",id:d(p),payload:{path:t}}):we()).then((o)=>{if(!_t(o))throw new a("HOST_REJECTED","Host did not return directory entries.");return o}),stat:(t)=>(oe(t)?P({channel:S,v:g,type:"file-stat",id:d(p),payload:{path:t}}):we()).then((o)=>{if(!Tt(o))throw new a("HOST_REJECTED","Host did not return file status.");return o}),generate:(t)=>{let o=t.prompt.trim(),i=t.system?.trim();if(o.length===0||o.length>Ie)return Promise.reject(new a("HOST_REJECTED",`Prompt must be 1 to ${Ie} characters.`));if(i!==void 0&&(i.length===0||i.length>Me))return Promise.reject(new a("HOST_REJECTED",`System prompt must be 1 to ${Me} characters.`));let n=t.maxOutputTokens===void 0?void 0:Math.min(ut,Math.max(1,Math.floor(t.maxOutputTokens)));if(n!==void 0&&!Number.isFinite(n))return Promise.reject(new a("HOST_REJECTED","maxOutputTokens must be a number."));let T={prompt:o};if(i!==void 0)T.system=i;if(n!==void 0)T.maxOutputTokens=n;return P({channel:S,v:g,type:"generate",id:d(p),payload:T},e.requestTimeoutMs??ct).then((f)=>{if(!ht(f))throw new a("HOST_REJECTED","Host did not return generated text.");return f})},onLateGenerateResult:(t)=>{J.add(t);for(let o of qe.splice(0))b([t],o);return Bt(),()=>{J.delete(t)}},setBadge:(t)=>x({channel:S,v:g,type:"badge",id:d(p),payload:{count:St(t)}}),setHeight:(t)=>x({channel:S,v:g,type:"resize",id:d(p),payload:{height:gt(t)}}),onFileOpen:(t)=>{if(fe.add(t),!$e)$e=!0,r.addEventListener("keydown",qt,!0);if(ue)t(ue);return()=>{fe.delete(t)}},onFileSnapshot:(t)=>(le=t,()=>{if(le===t)le=null}),onFileSaved:(t)=>(_e.add(t),()=>{_e.delete(t)}),reportFileChange:(t)=>We({...R,type:"file-change",payload:{dirty:t.dirty,edited:t.edited}}),requestFileSave:Xt,reportFileUnsupported:()=>We({...R,type:"file-unsupported"}),dispose:()=>{for(let t of Q.keys())w({...R,type:"workspace-unsubscribe",id:d(p),payload:{subscriptionId:t}});Q.clear();for(let t of Z.keys())w({...R,type:"shells-unsubscribe",id:d(p),payload:{subscriptionId:t}});if(Z.clear(),H=!0,ie=null,ae=null,le=null,fe.clear(),_e.clear(),$e)r.removeEventListener("keydown",qt,!0);r.removeEventListener("message",Vt),r.removeEventListener("keydown",$t,!0),r.removeEventListener("pointerover",he),r.removeEventListener("pointermove",he),r.removeEventListener("pointerout",Wt),r.removeEventListener("focus",jt),r.removeEventListener("blur",zt);for(let t of Y.values())clearTimeout(t.timer),t.reject(new a("HOST_UNAVAILABLE","Host client was disposed."));Y.clear(),c.clear(),E.clear(),_.clear(),m.clear(),A.clear(),M.clear(),ne.clear(),Ee.clear(),me.clear(),J.clear(),qe.length=0}}};var Ao=["browser.open","browser.snapshot","browser.click","browser.type","browser.select","browser.scroll","browser.back","browser.forward","browser.inspect","browser.capture","browser.resize","browser.close"];var wr=new Set(Ao);var ko=["none","agent","user"];var Nr=new Set(ko);var Yo=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],Qo=[["--oc-syntax-keyword","--syntax-keyword","syntaxKeyword"],["--oc-syntax-string","--syntax-string","syntaxString"],["--oc-syntax-number","--syntax-number","syntaxNumber"],["--oc-syntax-function","--syntax-function","syntaxFunction"],["--oc-syntax-type","--syntax-type","syntaxType"],["--oc-syntax-comment","--syntax-comment","syntaxComment"],["--oc-syntax-variable","--syntax-variable","syntaxVariable"],["--oc-syntax-operator","--syntax-operator","syntaxOperator"]],Go=(e,r)=>{r.style.colorScheme=e.mode;for(let[s,l]of Yo)r.style.setProperty(s,e.tokens[l]);for(let[s,l,c]of Qo){let E=e.tokens[c]??"";r.style.setProperty(s,E),r.style.setProperty(l,E)}r.style.setProperty("font-family",e.tokens.font),r.style.setProperty("font-size","0.875rem"),r.style.setProperty("line-height","1.45"),r.style.setProperty("color",e.tokens.foreground)},Rt=(e,r)=>{if(Go(e.theme,r),r.dataset)r.dataset.ocSurface=e.surface,r.dataset.ocTheme=e.theme.mode};var Zo={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},y=(e,r)=>`var(--${e}, var(--oc-${Zo[e]}, ${r}))`,B=y("surface-background","transparent"),Le=y("surface-elevated","transparent"),re=y("surface-elevated-foreground","inherit"),L=y("surface-foreground","inherit"),h=y("surface-muted-foreground","gray"),er=y("surface-muted","transparent"),V=y("interactive-border","currentColor"),I=y("interactive-hover","transparent"),j=y("interactive-active","transparent"),vt=y("interactive-selection","transparent"),Ot=y("interactive-selection-foreground","inherit"),F=y("primary","currentColor"),Ct=y("primary-text","inherit"),At=y("error-text","inherit"),tr=y("font-sans","inherit"),kt=y("font-mono","monospace"),wo=y("radius","9px"),Gt=`calc(${wo} - 2px)`,Po=`calc(${wo} - 4px)`,O=(e,r,s="transparent")=>`color-mix(in srgb, ${e} ${r}%, ${s})`,Io=`background-image: linear-gradient(${I}, ${I});`,Pt=(e,r="0.5px")=>`box-shadow: inset 0 0 0 ${r} ${e}, var(--oc-sdk-field-lift);`,It="border-color: var(--oc-sdk-edge); box-shadow: var(--oc-sdk-raised-lift);",Mo="box-shadow: var(--oc-sdk-lit);",Mt=`inset 0 0.5px 0 0 ${O(L,8)}, 0 1px 2px 0 rgb(0 0 0 / 0.4)`,or=`
:root {
  --oc-sdk-edge: ${O(L,16)};
  --oc-sdk-field-bg: ${Le};
  --oc-sdk-raised-bg: ${B};
  --oc-sdk-field-lift: inset 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --oc-sdk-raised-lift: 0 1px 1.5px 0 rgb(0 0 0 / 0.08);
  --oc-sdk-lit: inset 0 1px 0 0 rgb(255 255 255 / 0.2), 0 1px 1.5px 0 rgb(0 0 0 / 0.1);
  --oc-sdk-float-edge: rgb(0 0 0 / 0.14);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.7), 0 1px 2px -0.5px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 12px 20px -4px rgb(0 0 0 / 0.06);
}
:root[data-oc-theme="dark"] {
  --oc-sdk-edge: ${O(L,14)};
  --oc-sdk-field-bg: ${O(B,50,Le)};
  --oc-sdk-raised-bg: ${Le};
  --oc-sdk-field-lift: ${Mt};
  --oc-sdk-raised-lift: ${Mt};
  --oc-sdk-lit: ${Mt};
  --oc-sdk-float-edge: rgb(0 0 0 / 0.55);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.04), inset 0 0 0 0.5px rgb(255 255 255 / 0.08), 0 8px 16px 0 rgb(0 0 0 / 0.25), 0 4px 8px 0 rgb(0 0 0 / 0.25);
}`,Ne=(e)=>{let r=y(`status-${e}`,"currentColor");return`
.oc-sdk[data-tone="${e}"], .oc-sdk [data-tone="${e}"] { --oc-sdk-tone: ${r}; --oc-sdk-tone-text: ${y(`${e}-text`,"inherit")}; }`},rr=`
.oc-sdk { box-sizing: border-box; font-size: 0.875rem; line-height: 1.45; }
.oc-sdk *, .oc-sdk *::before, .oc-sdk *::after { box-sizing: border-box; }
/* :where() keeps the reset at zero specificity so every primitive class below overrides it. */
:where(.oc-sdk) :where(button, input, textarea), :where(button.oc-sdk, input.oc-sdk, textarea.oc-sdk) { font: inherit; color: inherit; margin: 0; }
:where(.oc-sdk) :where(button), :where(button.oc-sdk) { cursor: pointer; background: none; border: 0; padding: 0; }
.oc-sdk button:disabled, button.oc-sdk:disabled, .oc-sdk[aria-disabled="true"], .oc-sdk [aria-disabled="true"] { opacity: .5; pointer-events: none; }

.oc-sdk-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 32px; padding: 0 12px; border: 1px solid transparent; font-size: 0.875rem; font-weight: 500; line-height: 1; white-space: nowrap; }
.oc-sdk-btn[data-size="sm"] { gap: 6px; height: 28px; padding: 0 10px; font-size: 0.8125rem; }
.oc-sdk-btn[data-size="xs"] { gap: 4px; height: 24px; padding: 0 8px; font-size: 0.75rem; }
.oc-sdk-btn[data-loading="true"] { opacity: .5; pointer-events: none; }
.oc-sdk-btn > .oc-sdk-spinner-ring { width: 14px; height: 14px; }

.oc-sdk-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-field-label { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-field-note { font-size: 0.75rem; }
.oc-sdk-input { display: block; width: 100%; min-width: 0; height: 32px; padding: 0 10px; border: 0; font-size: 0.875rem; line-height: 1.45; appearance: none; }
textarea.oc-sdk-input { height: auto; padding: 8px 10px; resize: vertical; }

.oc-sdk-search { position: relative; min-width: 0; }
.oc-sdk-search .oc-sdk-input { padding-left: 34px; padding-right: 34px; }
.oc-sdk-search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); pointer-events: none; }
.oc-sdk-search-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); display: none; align-items: center; justify-content: center; width: 24px; height: 24px; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-clear { display: inline-flex; }

.oc-sdk-select { position: relative; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-trigger { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; width: auto; max-width: 100%; min-width: 0; height: 28px; padding: 0 10px; border: 1px solid transparent; font-size: 0.8125rem; text-align: left; }
.oc-sdk-trigger-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-trigger-chevron { flex: 0 0 auto; }
.oc-sdk-popup { position: fixed; z-index: 50; display: flex; flex-direction: column; gap: 2px; min-width: 160px; max-width: calc(100vw - 16px); max-height: min(320px, calc(100vh - 16px)); overflow: auto; padding: 4px; border: 1px solid transparent; }
.oc-sdk-popup-search { flex: 0 0 auto; padding: 2px 2px 4px; }
.oc-sdk-popup-search .oc-sdk-input { height: 28px; font-size: 0.8125rem; }
.oc-sdk-option { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; font-size: 0.8125rem; text-align: left; }
.oc-sdk-option-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-option-hint { flex: 0 0 auto; font-size: 0.75rem; }
.oc-sdk-option-check { flex: 0 0 auto; display: inline-flex; width: 14px; visibility: hidden; }
.oc-sdk-option[aria-selected="true"] > .oc-sdk-option-check { visibility: visible; }
.oc-sdk-popup-empty { padding: 8px; font-size: 0.8125rem; }

.oc-sdk-check { display: inline-flex; align-items: flex-start; gap: 8px; width: 100%; text-align: left; }
.oc-sdk-check-box { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; margin-top: 3px; border: 1px solid transparent; }
.oc-sdk-check-box > svg { display: none; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box > svg { display: block; }
.oc-sdk-check-thumb { flex: 0 0 auto; position: relative; width: 36px; height: 20px; }
.oc-sdk-check-thumb::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; }
.oc-sdk-check-text { display: flex; flex-direction: column; min-width: 0; }
.oc-sdk-check-label { font-size: 0.875rem; }
.oc-sdk-check-desc { font-size: 0.75rem; }

.oc-sdk-tabs { display: inline-flex; gap: 2px; padding: 2px; max-width: 100%; overflow: auto; }
.oc-sdk-tab { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid transparent; font-size: 0.8125rem; font-weight: 500; white-space: nowrap; }
.oc-sdk-tab-count { font-size: 0.75rem; font-variant-numeric: tabular-nums; }

.oc-sdk-badge { display: inline-flex; align-items: center; padding: 1px 6px; font-size: 11px; font-weight: 500; line-height: 16px; white-space: nowrap; }

.oc-sdk-list { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.oc-sdk-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; text-align: left; }
.oc-sdk-row-lead { flex: 0 0 auto; width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.oc-sdk-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-row-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-meta { flex: 0 0 auto; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-list-empty { padding: 16px 8px; text-align: center; font-size: 0.8125rem; }

.oc-sdk-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 40px 16px; text-align: center; }
.oc-sdk-empty-title { margin: 0; font-size: 0.8125rem; font-weight: 600; }
.oc-sdk-empty-body { margin: 0; max-width: 32rem; font-size: 0.8125rem; }
.oc-sdk-empty-action { margin-top: 12px; }

@keyframes oc-sdk-spin { to { transform: rotate(360deg); } }
.oc-sdk-spinner { display: inline-flex; align-items: center; gap: 8px; font-size: 0.8125rem; }
.oc-sdk-spinner-ring { width: 16px; height: 16px; border: 2px solid transparent; animation: oc-sdk-spin .8s linear infinite; }
.oc-sdk-spinner[data-size="sm"] .oc-sdk-spinner-ring { width: 12px; height: 12px; }

.oc-sdk-banner { display: flex; align-items: flex-start; gap: 12px; padding: 8px 12px; border: 1px solid transparent; }
.oc-sdk-banner-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.oc-sdk-banner-title { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-banner-body { font-size: 0.8125rem; }
.oc-sdk-banner-action { flex: 0 0 auto; }

.oc-sdk-separator { display: flex; align-items: center; gap: 8px; width: 100%; margin: 8px 0; font-size: 0.75rem; }
.oc-sdk-separator::before, .oc-sdk-separator::after { content: ""; flex: 1 1 auto; height: 1px; }
.oc-sdk-separator[data-labeled="false"]::after { display: none; }
.oc-sdk-popup > .oc-sdk-separator { margin: 4px 0; }

.oc-sdk-progress { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-progress-label { display: flex; justify-content: space-between; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-progress-track { height: 6px; overflow: hidden; }
.oc-sdk-progress-fill { height: 100%; transform-origin: left; transition: transform 200ms ease-out; }

.oc-sdk-menu { position: relative; display: inline-flex; }

.oc-sdk-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.oc-sdk-text img { display: block; max-width: 100%; margin: 8px 0; }
`,Uo=`${or}
.oc-sdk { color: ${L}; font-family: ${tr}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${Io} }
.oc-sdk-mono { font-family: ${kt}; }
.oc-sdk-muted { color: ${h}; }
${Ne("success")}${Ne("warning")}${Ne("error")}${Ne("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${F}; --oc-sdk-tone-text: ${Ct}; }

.oc-sdk-btn { border-radius: ${Gt}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${Po}; }
.oc-sdk-btn[data-variant="default"] { color: ${Ct}; background: ${O(F,10,B)}; border-color: ${O(F,12)}; ${Mo} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${O(F,16,B)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${O(F,22,B)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${er}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${I}, ${I}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${j}, ${j}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${re}; ${It} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${I}, ${I}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${j}, ${j}); box-shadow: none; }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${I}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${j}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${y("status-error","red")}; color: ${At}; background: ${O("var(--oc-sdk-tone)",7,B)}; border-color: ${O("var(--oc-sdk-tone)",12)}; ${Mo} }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${O("var(--oc-sdk-tone)",9,B)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${O("var(--oc-sdk-tone)",11,B)}; box-shadow: none; }

.oc-sdk-field-note { color: ${h}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${At}; }
.oc-sdk-input { border-radius: ${Gt}; background: var(--oc-sdk-field-bg); color: ${re}; ${Pt("var(--oc-sdk-edge)")} transition: background 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${h}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${I}, ${I}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { ${Pt(O(L,26),"1px")} }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input, .oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { ${Pt(y("status-error","red"),"1px")} }
.oc-sdk-input[data-mono="true"] { font-family: ${kt}; }

.oc-sdk-search-icon { color: ${h}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${F}; }
.oc-sdk-search-clear { border-radius: ${Po}; color: ${h}; }
.oc-sdk-search-clear:hover { background: ${I}; color: ${L}; }

.oc-sdk-trigger { border-radius: ${Gt}; background: var(--oc-sdk-raised-bg); color: ${re}; ${It} transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${I}, ${I}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${j}, ${j}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${h}; }
.oc-sdk-trigger-chevron { color: ${h}; }
/* The app's floating level: the glass edge (a hairline ring and a lit top line, dark outside and light inside in dark themes) over soft shadows. The outer ring is the border, over the page like the app's. */
.oc-sdk-popup { --surface-foreground: ${re}; border-color: var(--oc-sdk-float-edge); border-radius: 12px; background: ${Le}; background-clip: padding-box; color: ${re}; box-shadow: var(--oc-sdk-float); }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${I}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${vt}; color: ${Ot}; }
.oc-sdk-option-check { color: ${L}; }
.oc-sdk-option[data-destructive="true"] { color: ${At}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${O(y("status-error","red"),10)}; }
.oc-sdk-option-hint { color: ${h}; }
.oc-sdk-popup-empty { color: ${h}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${V}; border-radius: 4px; color: ${L}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${O(L,60,V)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${V}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${B}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${F}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(16px); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${Io} }
.oc-sdk-check-desc { color: ${h}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${O(L,4)}; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.16); }
.oc-sdk-tab { border-radius: 8px; color: ${h}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${L}; }
.oc-sdk-tab[aria-selected="true"] { color: ${Ot}; background: ${vt}; border-color: ${V}; }
.oc-sdk-tabs[data-track="true"] .oc-sdk-tab[aria-selected="true"] { color: ${re}; background: var(--oc-sdk-raised-bg); ${It} }
.oc-sdk-tab-count { color: ${h}; }

.oc-sdk-badge { border-radius: 9999px; background: ${I}; color: ${h}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${O("var(--oc-sdk-tone)",15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${I}; }
.oc-sdk-row[aria-selected="true"] { background: ${vt}; color: ${Ot}; }
.oc-sdk-row-lead { font-family: ${kt}; color: ${h}; }
.oc-sdk-row-sub { color: ${h}; }
.oc-sdk-row-meta { color: ${h}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${h}; }

.oc-sdk-empty-body { color: ${h}; }

.oc-sdk-spinner { color: ${h}; }
.oc-sdk-spinner-ring { border-color: ${V}; border-top-color: ${F}; border-radius: 9999px; }

/* Set apart by its tint alone, like the app's banners. */
.oc-sdk-banner { border-color: transparent; border-radius: 8px; background: ${O("var(--oc-sdk-tone)",10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${h}; }

.oc-sdk-separator { color: ${h}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${O(V,40)}; }

.oc-sdk-progress-label { color: ${h}; }
.oc-sdk-progress-track { border-radius: 9999px; background: ${V}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${F}); }

.oc-sdk-text a { color: ${Ct}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${O(V,60)}; }
`,k=`
${Ke}
${rr}
${Uo}`;var No="oc-sdk-ui-style";var G=(e)=>{let r=document.getElementById(No);if(r instanceof HTMLStyleElement){if(r.textContent!==e)r.textContent=e;return}Je(document);let s=document.createElement("style");s.id=No,s.textContent=e,document.head.appendChild(s)},C=(e,r)=>{let s=document.createElement(e);if(r)s.className=r;return s},X=(e)=>{let r=C("button",e);return r.type="button",r},U=(e,r)=>{let s=r??"";if(e.textContent!==s)e.textContent=s};var sr=()=>{let e=document.createElement("span");return e.className="oc-sdk-spinner-ring",e.setAttribute("aria-hidden","true"),e},q=(e,r)=>{G(k);let s=r,l=X("oc-sdk oc-sdk-btn"),c=sr(),E=document.createElement("span");l.append(E),e.append(l);let _=()=>{if(l.dataset.variant=s.variant??"default",l.dataset.size=s.size??"default",l.disabled=Boolean(s.disabled)||Boolean(s.loading),l.dataset.loading=s.loading?"true":"false",l.setAttribute("aria-busy",s.loading?"true":"false"),s.loading&&c.parentNode!==l)l.prepend(c);else if(!s.loading&&c.parentNode===l)c.remove();U(E,s.label)},m=()=>{if(s.disabled||s.loading)return;s.onClick()};return l.addEventListener("click",m),_(),{update:(A)=>{s={...s,...A},_()},dispose:()=>{l.removeEventListener("click",m),l.remove()}}};var Ut=(e,r)=>{G(k);let s=r,l=C("div","oc-sdk oc-sdk-empty"),c=C("h2","oc-sdk-empty-title"),E=C("p","oc-sdk-empty-body"),_=C("div","oc-sdk-empty-action");l.append(c,E,_),e.append(l);let m=null,A=()=>{if(U(c,s.title),U(E,s.body),E.hidden=!s.body,_.hidden=!s.action,!s.action){m?.dispose(),m=null;return}let M={label:s.action.label,onClick:s.action.onClick};if(m)m.update(M);else m=q(_,{...M,variant:"outline",size:"sm"})};return A(),{update:(M)=>{s={...s,...M},A()},dispose:()=>{m?.dispose(),m=null,l.remove()}}};var ur=/^(\s*[-*+] )\[( |x|X)\] ?(.*)$/,Lo=(e)=>e.split(`
`).map((r)=>{let s=ur.exec(r);return s?{kind:"item",prefix:s[1]??"- ",done:s[2]!==" ",text:s[3]??""}:{kind:"text",text:r}}),Ho=(e)=>e.map((r)=>r.kind==="text"?r.text:`${r.prefix}[${r.done?"x":" "}] ${r.text}`).join(`
`),Ve=(e)=>{let r=2166136261;for(let s=0;s<e.length;s+=1)r^=e.charCodeAt(s),r=Math.imul(r,16777619);return`${e.length}:${(r>>>0).toString(16)}`},Do=(e,r)=>{let s=-1,l="- ";e.forEach((m,A)=>{if(m.kind!=="item")return;s=A,l=m.prefix});let c={kind:"item",prefix:l,done:!1,text:r};if(s>=0)return[...e.slice(0,s+1),c,...e.slice(s+1)];return[...e.at(-1)?.kind==="text"&&e.at(-1)?.text===""?e.slice(0,-1):[...e],c,{kind:"text",text:""}]};var K=xt(),z=document.querySelector("#root");if(!z)throw Error("Missing root");var Fo=document.createElement("style");Fo.textContent=`
  html, body { margin: 0; height: 100%; background: var(--oc-bg); color: var(--oc-fg); font-family: var(--oc-font); font-size: 13px; }
  #root { box-sizing: border-box; height: 100%; overflow: auto; padding: 16px 20px; }
  .note { margin: 2px 0; color: var(--oc-muted); white-space: pre-wrap; min-height: 1em; }
  .item { display: flex; align-items: center; gap: 8px; margin: 2px 0; }
  .item input[type="checkbox"] { width: 16px; height: 16px; margin: 0; accent-color: var(--oc-primary); }
  .item input[type="text"] { flex: 1; min-width: 0; border: 1px solid transparent; border-radius: var(--oc-radius); padding: 4px 6px;
    background: transparent; color: inherit; font: inherit; }
  .item input[type="text"]:hover { border-color: var(--oc-border); }
  .item input[type="text"]:focus { outline: none; border-color: var(--oc-focus); background: var(--oc-elevated); }
  .item.done input[type="text"] { color: var(--oc-muted); text-decoration: line-through; }
  .item .remove { visibility: hidden; }
  .item:hover .remove, .item:focus-within .remove { visibility: visible; }
  .actions { margin-top: 12px; }
`;document.head.append(Fo);K.onReady((e)=>Rt(e,document.documentElement));var W=[],se=!1,Lt=Oe(null),Ht=()=>Ho(W),Xe=()=>{K.reportFileChange(Lt.observe(Ve(Ht())))},Nt=()=>{if(z.replaceChildren(),!W.some((r)=>r.kind==="item")&&se){Ut(z,{title:"No items",body:"This checklist is empty."});return}if(W.forEach((r,s)=>{if(r.kind==="text"){let _=document.createElement("p");_.className="note",_.textContent=r.text,z.append(_);return}let l=document.createElement("div");l.className=r.done?"item done":"item";let c=document.createElement("input");c.type="checkbox",c.checked=r.done,c.disabled=se,c.addEventListener("change",()=>{r.done=c.checked,l.className=r.done?"item done":"item",Xe()});let E=document.createElement("input");if(E.type="text",E.value=r.text,E.readOnly=se,E.setAttribute("aria-label","Item"),E.addEventListener("input",()=>{r.text=E.value,Xe()}),l.append(c,E),!se){let _=document.createElement("span");_.className="remove",q(_,{label:"Remove",variant:"ghost",size:"xs",onClick:()=>{W=W.filter((m,A)=>A!==s),Xe(),Nt()}}),l.append(_)}z.append(l)}),se)return;let e=document.createElement("div");e.className="actions",q(e,{label:"Add item",variant:"secondary",size:"sm",onClick:()=>{W=Do(W,""),Xe(),Nt();let r=z.querySelectorAll('.item input[type="text"]');r.item(r.length-1)?.focus()}}),z.append(e)};K.onFileOpen((e)=>{if(e.encoding!=="text"){K.reportFileUnsupported();return}W=Lo(e.content),se=e.readOnly,Lt=Oe(Ve(Ht())),Nt()});K.onFileSnapshot(()=>{let e=Ht();return{content:e,version:Ve(e)}});K.onFileSaved((e)=>{K.reportFileChange({dirty:Lt.markSaved(e),edited:!1})});})();
