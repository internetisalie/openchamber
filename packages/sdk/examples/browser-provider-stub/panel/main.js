(()=>{var S="openchamber.sdk",g=1;var Ve=`
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
`;function Xe(e){let r=e.documentElement;if(r.hasAttribute("data-oc-scrollbar-activity"))return;r.setAttribute("data-oc-scrollbar-activity","");let s=new WeakMap;e.addEventListener("scroll",(p)=>{let d=p.target===e?r:p.target;if(!(d instanceof Element))return;if(!d.hasAttribute("data-oc-scrolling"))d.setAttribute("data-oc-scrolling","");let E=s.get(d);if(E!==void 0)clearTimeout(E);s.set(d,setTimeout(()=>{s.delete(d),d.removeAttribute("data-oc-scrolling")},1000))},{capture:!0,passive:!0})}var Po=`(${Xe.toString()})(document);`;var qe=128,$e=65536;var Te=128;var ye=65536;var $t=/^[a-z][a-z0-9-]{0,39}$/;var Vt=(e)=>Object(e)===e&&!Array.isArray(e),We=(e,r)=>Object.keys(e).every((s)=>r.includes(s)),Xt=(e)=>String(e)===e&&e.length>=1&&e.length<=60,qt=(e)=>String(e)===e&&e.length>=1&&e.length<=80,Wt=(e)=>{if(!Array.isArray(e)||e.length>4)return!1;let r=new Set;for(let s of e){if(!Vt(s)||!$t.test(s.id)||!Xt(s.label))return!1;if(s.disabled!==void 0&&s.disabled!==!0&&s.disabled!==!1)return!1;if(r.has(s.id))return!1;if(r.add(s.id),s.kind==="button"){if(!We(s,["kind","id","label","disabled"]))return!1;continue}if(s.kind!=="select"||!We(s,["kind","id","label","value","options","disabled"]))return!1;if(!qt(s.value)||!Array.isArray(s.options)||s.options.length<1||s.options.length>16)return!1;let p=new Set;for(let d of s.options){if(!Vt(d)||!We(d,["value","label"])||!qt(d.value)||!Xt(d.label)||p.has(d.value))return!1;p.add(d.value)}if(!p.has(s.value))return!1}return!0};var jt=["turn-finished","turn-failed","permission-asked","question-asked"];var lr=new Set(jt);var he=20000000,be=256;var je=(e)=>("bytes"in e)?e.bytes.byteLength:e.content.length,zt=(e,r)=>{if(e.path!==r.path||e.readOnly!==r.readOnly)return!1;if(e.encoding==="text"||r.encoding==="text")return e.encoding==="text"&&r.encoding==="text"&&e.content===r.content;if(e.bytes.byteLength!==r.bytes.byteLength)return!1;for(let s=0;s<e.bytes.byteLength;s+=1)if(e.bytes[s]!==r.bytes[s])return!1;return!0};var Kt=/^[A-Za-z0-9_-]{1,80}$/;var Jt=["left","right","top","bottom"];var Yt=(e,r=0,s={remaining:16000})=>{if(--s.remaining<0||r>=32)return!1;if(e===null)return!0;let p=Array.isArray(e)?e:Object(e)===e?Object.values(e):[];for(let d of p)if(!Yt(d,r+1,s))return!1;return!0},ze=(e)=>{if(e===null||e===!0||e===!1)return!0;if(Array.isArray(e))return Object.keys(e).every((r)=>/^(0|[1-9]\d*)$/.test(r)&&Number(r)<e.length)&&e.every(ze);if(Object(e)===e){let r=Object.getPrototypeOf(e);return(r===null||r===Object.prototype)&&Object.values(e).every(ze)}return String(e)===e||Number.isFinite(e)},Ke=(e)=>{try{if(String(e.id)!==e.id||!Kt.test(e.id)||!Number.isFinite(e.anchor.x)||Math.abs(e.anchor.x)>1e5||!Number.isFinite(e.anchor.y)||Math.abs(e.anchor.y)>1e5||!Number.isFinite(e.anchor.width)||!Number.isFinite(e.anchor.height)||e.anchor.width<=0||e.anchor.height<=0||e.anchor.width>1e5||e.anchor.height>1e5||!Number.isInteger(e.width)||e.width<160||e.width>640||!Number.isInteger(e.height)||e.height<48||e.height>480||e.side!==void 0&&!Jt.includes(e.side)||e.focus!==void 0&&e.focus!==!0&&e.focus!==!1||!Yt(e.data)||!ze(e.data))return!1;return JSON.stringify(e.data).length<=16000}catch{return!1}};var Zt=["file","directory","other","missing"],Ye=(e)=>Boolean(e&&"sessionId"in e),Qe=(e)=>Boolean(e&&"sent"in e&&!("sessionId"in e));var eo=/^[0-9a-f]{7,64}$/i,Ze=(e)=>eo.test(e),xe=500,Re=32000,to=16000,oo=128,ro=200,so=2000,no=16000,io=80,ao=200,lo=16000;var uo=2000;var ve=8000000,et=4194304,tt=20000,Oe=1024,Ce=2000000;var Ae=64000,ke=8000,ot=4000;var rt=960000;var co=999,po=1e4,ue=500,So=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","REQUEST_FAILED","RESPONSE_TOO_LARGE","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED","UNSUPPORTED"],go=["stopped","starting","ready","failed"],Mo=new Set(So),Eo=(e)=>Mo.has(e),mo=(e)=>e&&Eo(e)?e:"HOST_REJECTED",Y=(e)=>{if(e===void 0)return!1;if(e===null||e===!0||e===!1)return!0;if(String(e)===e)return!0;if(Number(e)===e)return Number.isFinite(e);if(Array.isArray(e))return e.every(Y);if(Object(e)===e)return Object.values(e).every(Y);return!1},fo=(e)=>Y(e)&&JSON.stringify(e).length<=lo,Qt=(e)=>e?.trim().slice(0,ao)??"",Q=(e)=>{let r=e.id.trim().slice(0,oo),s=e.title.trim().slice(0,ro),p=e.url.trim().slice(0,so),d=e.text?.trim().slice(0,no),E=e.author?.trim().slice(0,io),C=e.kind==="pull"?"pull":"issue",_={providerId:e.providerId.trim(),id:r,title:s||r,url:p,kind:C};if(d)_.text=d;if(E)_.author=E;if(C==="pull"){let A=Qt(e.branches?.head),M=Qt(e.branches?.base);if(A&&M)_.branches={head:A,base:M}}if(fo(e.data))_.data=e.data;return _},st=(e)=>{let r=Q(e);if(e.projectId)r.projectId=e.projectId;if(e.navigation)r.navigation=e.navigation;if(e.worktree)r.worktree=e.worktree;return r},nt=(e)=>{let r={text:e.text.trim().slice(0,to)};if(e.send)r.send=!0;return r},it=(e)=>{if(e===null||!Number.isFinite(e))return null;return Math.min(co,Math.max(0,Math.round(e)))},at=(e)=>{if(!Number.isFinite(e))return 0;return Math.min(po,Math.max(0,Math.ceil(e)))};var Z=(e)=>e.length>0&&e.length<=Oe&&!e.includes("\x00")&&!e.includes("\\");var ce=(e)=>{if(!e.startsWith("/")||e.includes("\x00")||e.includes("\\")||e.includes("://"))return!1;if(e.length>uo)return!1;return!e.split("/").some((s)=>s==="."||s==="..")},wo=new Set(go),lt=(e)=>Boolean(e&&"status"in e&&wo.has(String(e.status))&&!("body"in e)),pe=(e)=>Boolean(e&&"status"in e&&"body"in e&&Number.isInteger(e.status)),ut=(e)=>Boolean(e&&"content"in e&&String(e.content)===e.content),ct=(e)=>Boolean(e&&"written"in e&&e.written===!0),pt=(e)=>Boolean(e&&"entries"in e&&Array.isArray(e.entries)),Uo=new Set(Zt),dt=(e)=>Boolean(e&&"kind"in e&&"size"in e&&Uo.has(String(e.kind))&&Number.isFinite(e.size)),St=(e)=>Boolean(e&&"text"in e&&String(e.text)===e.text&&!("status"in e)),No=new Set(["workspace","shells","ready","directory","session","connection","settings","session-lifecycle","item","resolve","action","status-control-event","popover-closed","file-open","file-snapshot","file-saved","generate-late"]),Lo=(e)=>Object(e)===e?e:null,Je=(e)=>String(e)===e&&e.length>0,Ho=(e)=>{if(!Je(e.id))return null;if(e.ok===!0){let r={channel:S,v:g,type:"result",id:e.id,ok:!0};if(Object(e.payload)===e.payload)r.payload=e.payload;return r}if(e.ok===!1&&Je(e.error))return{channel:S,v:g,type:"result",id:e.id,ok:!1,error:e.error,code:mo(Je(e.code)?e.code:void 0)};return null},gt=(e)=>{let r=Lo(e);if(!r||r.channel!==S||r.v!==g)return null;if(r.type==="result")return Ho(r);if(!No.has(String(r.type))||Object(r.payload)!==r.payload)return null;return r};var _o=(e)=>("key"in e)&&("metaKey"in e)&&("ctrlKey"in e),Do=(e)=>(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="s";class a extends Error{code;constructor(e,r){super(r);this.name="HostRequestError",this.code=e}}var Et=()=>Promise.reject(new a("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),Ge=()=>Promise.reject(new a("BAD_PATH",`File path must be 1 to ${Oe} characters without NUL or backslash.`)),Pe=(e)=>{if(e===void 0)return;if(Object(e)!==e||Array.isArray(e)||e.scope!==void 0&&e.scope!=="instance"&&e.scope!=="device")throw new a("HOST_REJECTED",'Storage scope must be "instance" or "device".');return e.scope==="device"?"device":void 0},c=(e)=>(e.value+=1,`oc-${e.value}`),mt=(e={})=>{let r=e.target??("window"in globalThis?window:null);if(!r)throw new a("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let s=e.acceptSource??((t)=>t===r.parent),p=e.requestTimeoutMs??tt,d=new Set,E=new Set,C=new Set,_=new Set,A=new Set,M=new Set,V=new Set,de=new Set,Se=new Set,j=new Set,Le=[],re=null,se=null,ge=new Set,Ee=new Set,ne=null,ie=null,He=!1,z=new Map,K=new Map,J=new Map,H=!1,u={value:0},l=null,D=null,ae=!1,le=!1,Gt=null,Pt=(t)=>{if(!t)return null;return{sessionId:t.id,phase:t.busy?"started":"completed"}},w=(t)=>{r.parent.postMessage(t,"*")},It=()=>{if(H||r.parent===r||j.size===0||l?.features?.lateGenerateResults!==!0)return;w({channel:S,v:g,type:"generate-late-listen"})},h=(t,o)=>{for(let i of t)try{i(o)}catch(n){console.error(n)}},Mt=(t)=>{if(!(t instanceof MessageEvent))return;if(!s(t.source))return;let o=gt(t.data);if(!o)return;if(o.type==="workspace"){let n=K.get(o.payload.subscriptionId);if(n)h([n],o.payload.snapshot);return}if(o.type==="shells"){let n=J.get(o.payload.subscriptionId);if(n)h([n],o.payload.snapshot);return}if(o.type==="ready"){let n=o.payload;if(l=n,D=Pt(n.session),h(d,n),h(E,n.directory),h(C,n.session),D)h(_,D);h(A,n.connection),h(M,n.settings),h(V,n.item),It();return}if(o.type==="generate-late"){if(j.size===0)Le.push(o.payload);else h(j,o.payload);return}if(o.type==="directory"){if(l)l={...l,directory:o.payload.directory};h(E,o.payload.directory);return}if(o.type==="session"){if(l)l={...l,session:o.payload.session};if(!o.payload.session)D=null;else if(D?.sessionId!==o.payload.session.id)D=Pt(o.payload.session);h(C,o.payload.session);return}if(o.type==="session-lifecycle"){D=o.payload,h(_,o.payload);return}if(o.type==="connection"){if(l)l={...l,connection:o.payload.connection};h(A,o.payload.connection);return}if(o.type==="settings"){if(l)l={...l,settings:o.payload.settings};h(M,o.payload.settings);return}if(o.type==="item"){if(l)l={...l,item:o.payload.item};h(V,o.payload.item);return}if(o.type==="status-control-event"){h(de,o.payload);return}if(o.type==="popover-closed"){h(Se,o.payload);return}if(o.type==="action"){let n=(m)=>{if(!H)w({channel:S,v:g,type:"action-result",id:o.id,payload:m})},f=se;if(!f){n({ok:!1,error:"This extension does not handle background actions."});return}Promise.resolve().then(()=>f(o.payload)).then(()=>n({ok:!0}),(m)=>{let v=(m instanceof Error?m.message:String(m)).trim();n({ok:!1,error:(v||"Action failed.").slice(0,ue)})});return}if(o.type==="file-open"){let n=o.payload;if(ie&&zt(ie,n))return;ie=n,h(ge,o.payload);return}if(o.type==="file-saved"){h(Ee,o.payload.version);return}if(o.type==="file-snapshot"){let n=(v)=>{if(!H)w({channel:S,v:g,type:"file-snapshot-result",id:o.id,payload:v})},f=(v)=>n({error:(v.trim()||"Could not read the edited file.").slice(0,ue)}),m=ne;if(!m){f("This extension does not edit files.");return}Promise.resolve().then(()=>m(o.payload.purpose)).then((v)=>{if(je(v)>he){f(`The file is over ${he} ${"bytes"in v?"bytes":"characters"}.`);return}if(v.version.length>be){f(`The snapshot version is over ${be} characters.`);return}n({snapshot:"bytes"in v?{bytes:v.bytes,version:v.version}:{content:v.content,version:v.version}})},(v)=>f(v instanceof Error?v.message:String(v)));return}if(o.type==="resolve"){let n=(m)=>{w({channel:S,v:g,type:"resolve-result",id:o.id,payload:m})},f=re;if(!f){n({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>f(o.payload)).then((m)=>n({item:m?Q(m):null}),(m)=>{let v=(m instanceof Error?m.message:String(m)).trim();n({error:(v||"Command failed.").slice(0,ue)})});return}let i=z.get(o.id);if(!i)return;if(clearTimeout(i.timer),z.delete(o.id),o.ok){i.resolve(o.payload);return}i.reject(new a(o.code,o.error))};r.addEventListener("message",Mt),w({channel:S,v:g,type:"hello"});let P=(t,o=p)=>{if(H||r.parent===r)return Promise.reject(new a("HOST_UNAVAILABLE","No host frame. This page is not in an iframe."));return new Promise((i,n)=>{let f=setTimeout(()=>{z.delete(t.id),n(new a("HOST_TIMEOUT","Host did not answer in time."))},o);z.set(t.id,{resolve:i,reject:n,timer:f}),w(t)})},x=(t)=>P(t).then(()=>{return}),R={channel:S,v:g},De=(t)=>{if(!H&&r.parent!==r)w(t)},wt=()=>De({...R,type:"file-save"}),Ut=(t)=>{if(!_o(t)||!Do(t))return;t.preventDefault(),wt()},Nt=(t)=>{if(!_o(t)||t.key!=="Escape"||l?.surface!=="popover"||!l.popover)return;t.preventDefault(),Ft(l.popover.id,"escape").catch(()=>{return})},me=()=>{let t=l?.surface==="popover"?l.popover:void 0;if(!t)return;let o=ae||le;if(Gt===o)return;Gt=o,Bt(t.id,o).catch(()=>{return})},fe=()=>{if(l?.surface!=="popover"||ae)return;ae=!0,me()},Lt=(t)=>{if(l?.surface!=="popover"||t.relatedTarget!==null||!ae)return;ae=!1,me()},Ht=()=>{if(l?.surface!=="popover"||le)return;le=!0,me()},Dt=()=>{if(l?.surface!=="popover"||!le)return;le=!1,me()},N=(t,o=1024)=>{if(!t.trim()||t.length>o)throw new a("HOST_REJECTED",`Identity must contain 1 to ${o} characters.`)},Fe=async(t)=>{if(t.kind!=="projects")N(t.projectId);let o=await P({...R,type:"workspace-read",id:c(u),payload:t});if(!o||!("kind"in o)||!("state"in o)||o.kind!==t.kind)throw new a("HOST_REJECTED","Host did not return workspace data.");return o},Be=async(t,o)=>{if(t.kind!=="projects")N(t.projectId);let i=c(u);K.set(i,o);try{await x({...R,type:"workspace-subscribe",id:c(u),payload:{subscriptionId:i,query:t}})}catch(n){if(K.delete(i),!H)w({...R,type:"workspace-unsubscribe",id:c(u),payload:{subscriptionId:i}});throw n}return()=>{if(!K.delete(i)||H)return;w({...R,type:"workspace-unsubscribe",id:c(u),payload:{subscriptionId:i}})}},Go=async(t,o)=>{if(t.kind==="session")N(t.sessionId);if(t.kind==="project")N(t.projectId);let i=c(u);J.set(i,o);try{await x({...R,type:"shells-subscribe",id:c(u),payload:{subscriptionId:i,scope:t}})}catch(n){if(J.delete(i),!H)w({...R,type:"shells-unsubscribe",id:c(u),payload:{subscriptionId:i}});throw n}return()=>{if(!J.delete(i)||H)return;w({...R,type:"shells-unsubscribe",id:c(u),payload:{subscriptionId:i}})}},_e=async(t)=>{if("key"in t&&(t.key.length===0||t.key.length>qe))throw new a("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(t.op==="set"&&!Y(t.value))throw new a("HOST_REJECTED","Storage values must be JSON.");if(t.op==="set"&&new TextEncoder().encode(JSON.stringify(t.value)).length>$e)throw new a("HOST_REJECTED","Storage value exceeds 64 KiB.");if(t.scope==="device"&&l?.features?.deviceStorage!==!0)throw new a("UNSUPPORTED","This host does not support device storage.");let o=await P({...R,type:"storage",id:c(u),payload:t});if(!o||!("storage"in o)||o.op!==t.op)throw new a("HOST_REJECTED","Host did not return storage data.");return o},Ft=(t,o)=>l?.features?.popovers!==!0&&!(l?.surface==="popover"&&l.popover?.id===t)?Promise.reject(new a("UNSUPPORTED","This host does not support popovers.")):x({...R,type:"popover-close",id:c(u),payload:o?{id:t,reason:o}:{id:t}}),Bt=(t,o)=>l?.features?.popovers!==!0&&!(l?.surface==="popover"&&l.popover?.id===t)?Promise.reject(new a("UNSUPPORTED","This host does not support popovers.")):x({...R,type:"popover-anchor",id:c(u),payload:{id:t,active:o}});return r.addEventListener("keydown",Nt,!0),r.addEventListener("pointerover",fe),r.addEventListener("pointermove",fe),r.addEventListener("pointerout",Lt),r.addEventListener("focus",Ht),r.addEventListener("blur",Dt),{onAction:(t)=>(se=t,()=>{if(se===t)se=null}),listProjects:async()=>{let t=await Fe({kind:"projects"});if(t.kind!=="projects")throw new a("HOST_REJECTED","Expected projects.");return t},listWorktrees:async(t)=>{let o=await Fe({kind:"worktrees",projectId:t});if(o.kind!=="worktrees")throw new a("HOST_REJECTED","Expected worktrees.");return o},listSessions:async(t)=>{let o=await Fe({kind:"sessions",projectId:t});if(o.kind!=="sessions")throw new a("HOST_REJECTED","Expected sessions.");return o},onProjects:(t)=>Be({kind:"projects"},(o)=>{if(o.kind==="projects")t(o)}),onWorktrees:(t,o)=>Be({kind:"worktrees",projectId:t},(i)=>{if(i.kind==="worktrees")o(i)}),onSessions:(t,o)=>Be({kind:"sessions",projectId:t},(i)=>{if(i.kind==="sessions")o(i)}),onRunningShells:(t,o)=>Go(t,o),readShellOutput:async(t,o)=>{N(t,Te);let i=o?.cursor;if(i!==void 0&&(!Number.isInteger(i)||i<0))throw new a("HOST_REJECTED","Shell output cursor must be a non-negative integer.");let n=o?.tailBytes;if(n!==void 0&&(!Number.isInteger(n)||n<1||n>ye))throw new a("HOST_REJECTED",`Shell output tailBytes must be an integer between 1 and ${ye}.`);let m=await P({...R,type:"shell-output",id:c(u),payload:{shellId:t,cursor:i,tailBytes:n}});if(!m||typeof m.output!=="string"||!Number.isFinite(m.cursor))throw new a("HOST_REJECTED","Host did not return shell output.");return m},stopShell:async(t)=>{if(N(t,Te),(await P({...R,type:"shell-stop",id:c(u),payload:{shellId:t}}))?.stopped!==!0)throw new a("HOST_REJECTED","Host did not stop the shell.");return{stopped:!0}},openSession:async(t)=>{N(t),await x({...R,type:"open-session",id:c(u),payload:{sessionId:t}})},storage:{get:async(t,o)=>{let i=Pe(o),n={op:"get",key:t};if(i)n.scope=i;let f=await _e(n);return f.op==="get"&&f.found?f.value:void 0},set:async(t,o,i)=>{let n=Pe(i),f={op:"set",key:t,value:o};if(n)f.scope=n;await _e(f)},delete:async(t,o)=>{let i=Pe(o),n={op:"delete",key:t};if(i)n.scope=i;await _e(n)},keys:async(t)=>{let o=Pe(t),i={op:"keys"};if(o)i.scope=o;let n=await _e(i);if(n.op!=="keys")throw new a("HOST_REJECTED","Expected storage keys.");return n.keys}},onReady:(t)=>{if(d.add(t),l)t(l);return()=>{d.delete(t)}},onDirectory:(t)=>{if(E.add(t),l)t(l.directory);return()=>{E.delete(t)}},onSession:(t)=>{if(C.add(t),l)t(l.session);return()=>{C.delete(t)}},onSessionLifecycle:(t)=>{if(_.add(t),D)t(D);return()=>{_.delete(t)}},onConnection:(t)=>{if(A.add(t),l)t(l.connection);return()=>{A.delete(t)}},onSettings:(t)=>{if(M.add(t),l)t(l.settings);return()=>{M.delete(t)}},onItem:(t)=>{if(V.add(t),l)t(l.item);return()=>{V.delete(t)}},onStatusControl:(t)=>(de.add(t),()=>{de.delete(t)}),onPopoverClosed:(t)=>(Se.add(t),()=>{Se.delete(t)}),setStatusControls:(t)=>{if(l?.features?.statusControls!==!0)return Promise.reject(new a("UNSUPPORTED","This host does not support status controls."));if(!Wt(t))return Promise.reject(new a("HOST_REJECTED","Status controls must have unique bounded ids and valid selected options."));return x({...R,type:"status-controls",id:c(u),payload:{controls:t}})},openPopover:(t)=>{if(l?.features?.popovers!==!0)return Promise.reject(new a("UNSUPPORTED","This host does not support popovers."));if(!Ke(t))return Promise.reject(new a("HOST_REJECTED","Popover requests need bounded geometry and JSON data."));return x({...R,type:"popover-open",id:c(u),payload:t})},closePopover:Ft,setPopoverAnchorActive:Bt,onResolve:(t)=>(re=t,()=>{if(re===t)re=null}),toast:(t)=>{let o=t.message.trim();if(!o||o.length>xe)return Promise.reject(new a("HOST_REJECTED",`Toast message must contain 1 to ${xe} characters.`));if(t.copy&&t.copy!==!0&&(!t.copy.text.length||t.copy.text.length>Re))return Promise.reject(new a("HOST_REJECTED",`Toast copy text must contain 1 to ${Re} characters.`));return x({channel:S,v:g,type:"toast",id:c(u),payload:{...t,message:o}})},openUrl:(t)=>x({channel:S,v:g,type:"open-url",id:c(u),payload:{url:t}}),openCommit:(t)=>Ze(t)?x({channel:S,v:g,type:"open-commit",id:c(u),payload:{sha:t}}):Promise.reject(new a("HOST_REJECTED","Commit id must be 7 to 64 hex characters.")),openSurface:(t)=>x({channel:S,v:g,type:"open-surface",id:c(u),payload:{surfaceId:t}}),writeClipboard:(t)=>x({channel:S,v:g,type:"clipboard-write",id:c(u),payload:{text:t}}),compose:(t)=>x({channel:S,v:g,type:"compose",id:c(u),payload:t}),attach:(t)=>x({channel:S,v:g,type:"attach",id:c(u),payload:Q(t)}),startSession:async(t)=>{if(t.projectId!==void 0)N(t.projectId);let o=t.worktree;if(o&&o!==!0)if(o.kind==="existing")N(o.directory);else{if(o.name!==void 0)N(o.name,200);if(o.baseBranch!==void 0)N(o.baseBranch,200)}let i=await P({channel:S,v:g,type:"start-session",id:c(u),payload:st(t)},e.requestTimeoutMs??180000);if(!Ye(i))throw new a("HOST_REJECTED","Host did not return a session.");return i},prompt:(t)=>P({channel:S,v:g,type:"prompt",id:c(u),payload:nt(t)}).then((o)=>{if(!Qe(o))throw new a("HOST_REJECTED","Host did not return a prompt result.");return o}),sessionLink:(t)=>x({channel:S,v:g,type:"session-link",id:c(u),payload:Q(t)}),close:()=>x({channel:S,v:g,type:"close",id:c(u)}),oauthStart:()=>x({channel:S,v:g,type:"oauth-start",id:c(u)}),oauthDisconnect:()=>x({channel:S,v:g,type:"oauth-disconnect",id:c(u)}),request:(t)=>(ce(t.path)?P({channel:S,v:g,type:"request",id:c(u),payload:t}):Et()).then((o)=>{if(!pe(o))throw new a("HOST_REJECTED","Host request result was empty.");if(o.body.length>ve)throw new a("HOST_REJECTED","Host request result was too large.");return o}),openCodeRequest:(t)=>(ce(t.path)?P({channel:S,v:g,type:"opencode-request",id:c(u),payload:t}):Et()).then((o)=>{if(!pe(o))throw new a("HOST_REJECTED","Host OpenCode request result was empty.");if(o.body.length>et)throw new a("HOST_REJECTED","Host OpenCode request result was too large.");return o}),serviceRequest:(t)=>(ce(t.path)?P({channel:S,v:g,type:"service-request",id:c(u),payload:t}):Et()).then((o)=>{if(!pe(o))throw new a("HOST_REJECTED","Host service request result was empty.");if(o.body.length>ve)throw new a("HOST_REJECTED","Host service request result was too large.");return o}),serviceStatus:()=>P({channel:S,v:g,type:"service-status",id:c(u)}).then((t)=>{if(!lt(t))throw new a("HOST_REJECTED","Host did not return service status.");return t}),readFile:(t)=>(Z(t)?P({channel:S,v:g,type:"file-read",id:c(u),payload:{path:t}}):Ge()).then((o)=>{if(!ut(o))throw new a("HOST_REJECTED","Host did not return file content.");return o}),writeFile:(t,o)=>{if(!Z(t))return Ge();if(o.length>Ce)return Promise.reject(new a("FILE_TOO_LARGE",`Content is over ${Ce} characters.`));return P({channel:S,v:g,type:"file-write",id:c(u),payload:{path:t,content:o}}).then((i)=>{if(!ct(i))throw new a("HOST_REJECTED","Host did not confirm the write.");return i})},listDir:(t)=>(Z(t)?P({channel:S,v:g,type:"file-list",id:c(u),payload:{path:t}}):Ge()).then((o)=>{if(!pt(o))throw new a("HOST_REJECTED","Host did not return directory entries.");return o}),stat:(t)=>(Z(t)?P({channel:S,v:g,type:"file-stat",id:c(u),payload:{path:t}}):Ge()).then((o)=>{if(!dt(o))throw new a("HOST_REJECTED","Host did not return file status.");return o}),generate:(t)=>{let o=t.prompt.trim(),i=t.system?.trim();if(o.length===0||o.length>Ae)return Promise.reject(new a("HOST_REJECTED",`Prompt must be 1 to ${Ae} characters.`));if(i!==void 0&&(i.length===0||i.length>ke))return Promise.reject(new a("HOST_REJECTED",`System prompt must be 1 to ${ke} characters.`));let n=t.maxOutputTokens===void 0?void 0:Math.min(ot,Math.max(1,Math.floor(t.maxOutputTokens)));if(n!==void 0&&!Number.isFinite(n))return Promise.reject(new a("HOST_REJECTED","maxOutputTokens must be a number."));let f={prompt:o};if(i!==void 0)f.system=i;if(n!==void 0)f.maxOutputTokens=n;return P({channel:S,v:g,type:"generate",id:c(u),payload:f},e.requestTimeoutMs??rt).then((m)=>{if(!St(m))throw new a("HOST_REJECTED","Host did not return generated text.");return m})},onLateGenerateResult:(t)=>{j.add(t);for(let o of Le.splice(0))h([t],o);return It(),()=>{j.delete(t)}},setBadge:(t)=>x({channel:S,v:g,type:"badge",id:c(u),payload:{count:it(t)}}),setHeight:(t)=>x({channel:S,v:g,type:"resize",id:c(u),payload:{height:at(t)}}),onFileOpen:(t)=>{if(ge.add(t),!He)He=!0,r.addEventListener("keydown",Ut,!0);if(ie)t(ie);return()=>{ge.delete(t)}},onFileSnapshot:(t)=>(ne=t,()=>{if(ne===t)ne=null}),onFileSaved:(t)=>(Ee.add(t),()=>{Ee.delete(t)}),reportFileChange:(t)=>De({...R,type:"file-change",payload:{dirty:t.dirty,edited:t.edited}}),requestFileSave:wt,reportFileUnsupported:()=>De({...R,type:"file-unsupported"}),dispose:()=>{for(let t of K.keys())w({...R,type:"workspace-unsubscribe",id:c(u),payload:{subscriptionId:t}});K.clear();for(let t of J.keys())w({...R,type:"shells-unsubscribe",id:c(u),payload:{subscriptionId:t}});if(J.clear(),H=!0,re=null,se=null,ne=null,ge.clear(),Ee.clear(),He)r.removeEventListener("keydown",Ut,!0);r.removeEventListener("message",Mt),r.removeEventListener("keydown",Nt,!0),r.removeEventListener("pointerover",fe),r.removeEventListener("pointermove",fe),r.removeEventListener("pointerout",Lt),r.removeEventListener("focus",Ht),r.removeEventListener("blur",Dt);for(let t of z.values())clearTimeout(t.timer),t.reject(new a("HOST_UNAVAILABLE","Host client was disposed."));z.clear(),d.clear(),E.clear(),C.clear(),_.clear(),A.clear(),M.clear(),V.clear(),de.clear(),Se.clear(),j.clear(),Le.length=0}}};var To=["browser.open","browser.snapshot","browser.click","browser.type","browser.select","browser.scroll","browser.back","browser.forward","browser.inspect","browser.capture","browser.resize","browser.close"];var br=new Set(To);var yo=["none","agent","user"];var Rr=new Set(yo);var Fo=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],Bo=[["--oc-syntax-keyword","--syntax-keyword","syntaxKeyword"],["--oc-syntax-string","--syntax-string","syntaxString"],["--oc-syntax-number","--syntax-number","syntaxNumber"],["--oc-syntax-function","--syntax-function","syntaxFunction"],["--oc-syntax-type","--syntax-type","syntaxType"],["--oc-syntax-comment","--syntax-comment","syntaxComment"],["--oc-syntax-variable","--syntax-variable","syntaxVariable"],["--oc-syntax-operator","--syntax-operator","syntaxOperator"]],ho=(e,r)=>{r.style.colorScheme=e.mode;for(let[s,p]of Fo)r.style.setProperty(s,e.tokens[p]);for(let[s,p,d]of Bo){let E=e.tokens[d]??"";r.style.setProperty(s,E),r.style.setProperty(p,E)}r.style.setProperty("font-family",e.tokens.font),r.style.setProperty("font-size","0.875rem"),r.style.setProperty("line-height","1.45"),r.style.setProperty("color",e.tokens.foreground)},ft=(e,r)=>{if(ho(e.theme,r),r.dataset)r.dataset.ocSurface=e.surface,r.dataset.ocTheme=e.theme.mode};var Vo={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},y=(e,r)=>`var(--${e}, var(--oc-${Vo[e]}, ${r}))`,B=y("surface-background","transparent"),Me=y("surface-elevated","transparent"),ee=y("surface-elevated-foreground","inherit"),L=y("surface-foreground","inherit"),T=y("surface-muted-foreground","gray"),Xo=y("surface-muted","transparent"),X=y("interactive-border","currentColor"),I=y("interactive-hover","transparent"),W=y("interactive-active","transparent"),_t=y("interactive-selection","transparent"),Tt=y("interactive-selection-foreground","inherit"),F=y("primary","currentColor"),yt=y("primary-text","inherit"),ht=y("error-text","inherit"),qo=y("font-sans","inherit"),bt=y("font-mono","monospace"),vo=y("radius","9px"),xt=`calc(${vo} - 2px)`,bo=`calc(${vo} - 4px)`,O=(e,r,s="transparent")=>`color-mix(in srgb, ${e} ${r}%, ${s})`,xo=`background-image: linear-gradient(${I}, ${I});`,Rt=(e,r="0.5px")=>`box-shadow: inset 0 0 0 ${r} ${e}, var(--oc-sdk-field-lift);`,vt="border-color: var(--oc-sdk-edge); box-shadow: var(--oc-sdk-raised-lift);",Ro="box-shadow: var(--oc-sdk-lit);",Ot=`inset 0 0.5px 0 0 ${O(L,8)}, 0 1px 2px 0 rgb(0 0 0 / 0.4)`,$o=`
:root {
  --oc-sdk-edge: ${O(L,16)};
  --oc-sdk-field-bg: ${Me};
  --oc-sdk-raised-bg: ${B};
  --oc-sdk-field-lift: inset 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --oc-sdk-raised-lift: 0 1px 1.5px 0 rgb(0 0 0 / 0.08);
  --oc-sdk-lit: inset 0 1px 0 0 rgb(255 255 255 / 0.2), 0 1px 1.5px 0 rgb(0 0 0 / 0.1);
  --oc-sdk-float-edge: rgb(0 0 0 / 0.14);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.7), 0 1px 2px -0.5px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 12px 20px -4px rgb(0 0 0 / 0.06);
}
:root[data-oc-theme="dark"] {
  --oc-sdk-edge: ${O(L,14)};
  --oc-sdk-field-bg: ${O(B,50,Me)};
  --oc-sdk-raised-bg: ${Me};
  --oc-sdk-field-lift: ${Ot};
  --oc-sdk-raised-lift: ${Ot};
  --oc-sdk-lit: ${Ot};
  --oc-sdk-float-edge: rgb(0 0 0 / 0.55);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.04), inset 0 0 0 0.5px rgb(255 255 255 / 0.08), 0 8px 16px 0 rgb(0 0 0 / 0.25), 0 4px 8px 0 rgb(0 0 0 / 0.25);
}`,Ie=(e)=>{let r=y(`status-${e}`,"currentColor");return`
.oc-sdk[data-tone="${e}"], .oc-sdk [data-tone="${e}"] { --oc-sdk-tone: ${r}; --oc-sdk-tone-text: ${y(`${e}-text`,"inherit")}; }`},Wo=`
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
`,Oo=`${$o}
.oc-sdk { color: ${L}; font-family: ${qo}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${xo} }
.oc-sdk-mono { font-family: ${bt}; }
.oc-sdk-muted { color: ${T}; }
${Ie("success")}${Ie("warning")}${Ie("error")}${Ie("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${F}; --oc-sdk-tone-text: ${yt}; }

.oc-sdk-btn { border-radius: ${xt}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${bo}; }
.oc-sdk-btn[data-variant="default"] { color: ${yt}; background: ${O(F,10,B)}; border-color: ${O(F,12)}; ${Ro} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${O(F,16,B)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${O(F,22,B)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${Xo}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${I}, ${I}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${W}, ${W}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${ee}; ${vt} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${I}, ${I}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${W}, ${W}); box-shadow: none; }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${I}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${W}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${y("status-error","red")}; color: ${ht}; background: ${O("var(--oc-sdk-tone)",7,B)}; border-color: ${O("var(--oc-sdk-tone)",12)}; ${Ro} }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${O("var(--oc-sdk-tone)",9,B)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${O("var(--oc-sdk-tone)",11,B)}; box-shadow: none; }

.oc-sdk-field-note { color: ${T}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${ht}; }
.oc-sdk-input { border-radius: ${xt}; background: var(--oc-sdk-field-bg); color: ${ee}; ${Rt("var(--oc-sdk-edge)")} transition: background 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${T}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${I}, ${I}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { ${Rt(O(L,26),"1px")} }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input, .oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { ${Rt(y("status-error","red"),"1px")} }
.oc-sdk-input[data-mono="true"] { font-family: ${bt}; }

.oc-sdk-search-icon { color: ${T}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${F}; }
.oc-sdk-search-clear { border-radius: ${bo}; color: ${T}; }
.oc-sdk-search-clear:hover { background: ${I}; color: ${L}; }

.oc-sdk-trigger { border-radius: ${xt}; background: var(--oc-sdk-raised-bg); color: ${ee}; ${vt} transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${I}, ${I}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${W}, ${W}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${T}; }
.oc-sdk-trigger-chevron { color: ${T}; }
/* The app's floating level: the glass edge (a hairline ring and a lit top line, dark outside and light inside in dark themes) over soft shadows. The outer ring is the border, over the page like the app's. */
.oc-sdk-popup { --surface-foreground: ${ee}; border-color: var(--oc-sdk-float-edge); border-radius: 12px; background: ${Me}; background-clip: padding-box; color: ${ee}; box-shadow: var(--oc-sdk-float); }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${I}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${_t}; color: ${Tt}; }
.oc-sdk-option-check { color: ${L}; }
.oc-sdk-option[data-destructive="true"] { color: ${ht}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${O(y("status-error","red"),10)}; }
.oc-sdk-option-hint { color: ${T}; }
.oc-sdk-popup-empty { color: ${T}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${X}; border-radius: 4px; color: ${L}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${O(L,60,X)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${X}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${B}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${F}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(16px); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${xo} }
.oc-sdk-check-desc { color: ${T}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${O(L,4)}; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.16); }
.oc-sdk-tab { border-radius: 8px; color: ${T}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${L}; }
.oc-sdk-tab[aria-selected="true"] { color: ${Tt}; background: ${_t}; border-color: ${X}; }
.oc-sdk-tabs[data-track="true"] .oc-sdk-tab[aria-selected="true"] { color: ${ee}; background: var(--oc-sdk-raised-bg); ${vt} }
.oc-sdk-tab-count { color: ${T}; }

.oc-sdk-badge { border-radius: 9999px; background: ${I}; color: ${T}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${O("var(--oc-sdk-tone)",15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${I}; }
.oc-sdk-row[aria-selected="true"] { background: ${_t}; color: ${Tt}; }
.oc-sdk-row-lead { font-family: ${bt}; color: ${T}; }
.oc-sdk-row-sub { color: ${T}; }
.oc-sdk-row-meta { color: ${T}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${T}; }

.oc-sdk-empty-body { color: ${T}; }

.oc-sdk-spinner { color: ${T}; }
.oc-sdk-spinner-ring { border-color: ${X}; border-top-color: ${F}; border-radius: 9999px; }

/* Set apart by its tint alone, like the app's banners. */
.oc-sdk-banner { border-color: transparent; border-radius: 8px; background: ${O("var(--oc-sdk-tone)",10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${T}; }

.oc-sdk-separator { color: ${T}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${O(X,40)}; }

.oc-sdk-progress-label { color: ${T}; }
.oc-sdk-progress-track { border-radius: 9999px; background: ${X}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${F}); }

.oc-sdk-text a { color: ${yt}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${O(X,60)}; }
`,k=`
${Ve}
${Wo}
${Oo}`;var Co="oc-sdk-ui-style";var G=(e)=>{let r=document.getElementById(Co);if(r instanceof HTMLStyleElement){if(r.textContent!==e)r.textContent=e;return}Xe(document);let s=document.createElement("style");s.id=Co,s.textContent=e,document.head.appendChild(s)},b=(e,r)=>{let s=document.createElement(e);if(r)s.className=r;return s},q=(e)=>{let r=b("button",e);return r.type="button",r},U=(e,r)=>{let s=r??"";if(e.textContent!==s)e.textContent=s},te=(e,r,s)=>{if(s===void 0||s===null||s==="")e.removeAttribute(r);else if(e.getAttribute(r)!==s)e.setAttribute(r,s)};var jo=()=>{let e=document.createElement("span");return e.className="oc-sdk-spinner-ring",e.setAttribute("aria-hidden","true"),e},oe=(e,r)=>{G(k);let s=r,p=q("oc-sdk oc-sdk-btn"),d=jo(),E=document.createElement("span");p.append(E),e.append(p);let C=()=>{if(p.dataset.variant=s.variant??"default",p.dataset.size=s.size??"default",p.disabled=Boolean(s.disabled)||Boolean(s.loading),p.dataset.loading=s.loading?"true":"false",p.setAttribute("aria-busy",s.loading?"true":"false"),s.loading&&d.parentNode!==p)p.prepend(d);else if(!s.loading&&d.parentNode===p)d.remove();U(E,s.label)},_=()=>{if(s.disabled||s.loading)return;s.onClick()};return p.addEventListener("click",_),C(),{update:(A)=>{s={...s,...A},C()},dispose:()=>{p.removeEventListener("click",_),p.remove()}}};var Ct=(e,r)=>{G(k);let s=r,p=b("label","oc-sdk oc-sdk-field"),d=b("span","oc-sdk-field-label"),E=s.multiline?b("textarea","oc-sdk-input"):b("input","oc-sdk-input"),C=b("span","oc-sdk-field-note");p.append(d,E,C),e.append(p);let _=()=>{if(U(d,s.label),d.hidden=!s.label,E instanceof HTMLInputElement)E.type=s.password?"password":"text";else E.rows=s.rows??3;if(E.value!==s.value)E.value=s.value;E.disabled=Boolean(s.disabled),te(E,"placeholder",s.placeholder),E.dataset.mono=s.mono?"true":"false";let M=Boolean(s.error);p.dataset.invalid=M?"true":"false",E.setAttribute("aria-invalid",M?"true":"false");let V=s.error??s.helper??"";U(C,V),C.hidden=V===""},A=()=>{s.onChange(E.value)};return E.addEventListener("input",A),_(),{update:(M)=>{s={...s,...M},_()},dispose:()=>{E.removeEventListener("input",A),p.remove()}}};var kt=mt(),ko=document.querySelector("#root");if(!ko)throw Error("Missing root");var Ao=!1;kt.onReady((e)=>{if(ft(e,document.documentElement),Ao)return;Ao=!0;let r=document.createElement("div");r.style.cssText="display:flex;align-items:center;gap:8px;height:100%;padding:0 8px;box-sizing:border-box;",ko.append(r);let s="",p=document.createElement("div");p.style.flex="1",r.append(p);let d=Ct(p,{value:s,placeholder:"https://example.com",mono:!0,onChange:(_)=>{s=_,d.update({value:_})}}),E=oe(r,{label:"Go",size:"sm",onClick:()=>{if(!s.trim())return;E.update({loading:!0}),kt.serviceRequest({method:"POST",path:"/navigate",body:JSON.stringify({url:s.trim()})}).then(()=>C()).finally(()=>E.update({loading:!1}))}}),C=async()=>{try{let _=await kt.serviceRequest({method:"GET",path:"/state"}),A=JSON.parse(_.body);if(String(A.url)===A.url&&A.url!==s)s=A.url==="about:blank"?"":A.url,d.update({value:s})}catch{}};C(),setInterval(()=>{C()},2000)});})();
