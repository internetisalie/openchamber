(()=>{var S="openchamber.sdk",g=1;var Be=`
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
`;function De(e){let s=e.documentElement;if(s.hasAttribute("data-oc-scrollbar-activity"))return;s.setAttribute("data-oc-scrollbar-activity","");let r=new WeakMap;e.addEventListener("scroll",(u)=>{let d=u.target===e?s:u.target;if(!(d instanceof Element))return;if(!d.hasAttribute("data-oc-scrolling"))d.setAttribute("data-oc-scrolling","");let m=r.get(d);if(m!==void 0)clearTimeout(m);r.set(d,setTimeout(()=>{r.delete(d),d.removeAttribute("data-oc-scrolling")},1000))},{capture:!0,passive:!0})}var Ro=`(${De.toString()})(document);`;var $e=128,Xe=65536;var ye=128;var he=65536;var Dt=/^[a-z][a-z0-9-]{0,39}$/;var Nt=(e)=>Object(e)===e&&!Array.isArray(e),Ve=(e,s)=>Object.keys(e).every((r)=>s.includes(r)),Ft=(e)=>String(e)===e&&e.length>=1&&e.length<=60,Bt=(e)=>String(e)===e&&e.length>=1&&e.length<=80,$t=(e)=>{if(!Array.isArray(e)||e.length>4)return!1;let s=new Set;for(let r of e){if(!Nt(r)||!Dt.test(r.id)||!Ft(r.label))return!1;if(r.disabled!==void 0&&r.disabled!==!0&&r.disabled!==!1)return!1;if(s.has(r.id))return!1;if(s.add(r.id),r.kind==="button"){if(!Ve(r,["kind","id","label","disabled"]))return!1;continue}if(r.kind!=="select"||!Ve(r,["kind","id","label","value","options","disabled"]))return!1;if(!Bt(r.value)||!Array.isArray(r.options)||r.options.length<1||r.options.length>16)return!1;let u=new Set;for(let d of r.options){if(!Nt(d)||!Ve(d,["value","label"])||!Bt(d.value)||!Ft(d.label)||u.has(d.value))return!1;u.add(d.value)}if(!u.has(r.value))return!1}return!0};var be=20000000,xe=256;var qe=(e)=>("bytes"in e)?e.bytes.byteLength:e.content.length,Xt=(e,s)=>{if(e.path!==s.path||e.readOnly!==s.readOnly)return!1;if(e.encoding==="text"||s.encoding==="text")return e.encoding==="text"&&s.encoding==="text"&&e.content===s.content;if(e.bytes.byteLength!==s.bytes.byteLength)return!1;for(let r=0;r<e.bytes.byteLength;r+=1)if(e.bytes[r]!==s.bytes[r])return!1;return!0};var Vt=/^[A-Za-z0-9_-]{1,80}$/;var qt=["left","right","top","bottom"];var Wt=(e,s=0,r={remaining:16000})=>{if(--r.remaining<0||s>=32)return!1;if(e===null)return!0;let u=Array.isArray(e)?e:Object(e)===e?Object.values(e):[];for(let d of u)if(!Wt(d,s+1,r))return!1;return!0},We=(e)=>{if(e===null||e===!0||e===!1)return!0;if(Array.isArray(e))return Object.keys(e).every((s)=>/^(0|[1-9]\d*)$/.test(s)&&Number(s)<e.length)&&e.every(We);if(Object(e)===e){let s=Object.getPrototypeOf(e);return(s===null||s===Object.prototype)&&Object.values(e).every(We)}return String(e)===e||Number.isFinite(e)},ze=(e)=>{try{if(String(e.id)!==e.id||!Vt.test(e.id)||!Number.isFinite(e.anchor.x)||Math.abs(e.anchor.x)>1e5||!Number.isFinite(e.anchor.y)||Math.abs(e.anchor.y)>1e5||!Number.isFinite(e.anchor.width)||!Number.isFinite(e.anchor.height)||e.anchor.width<=0||e.anchor.height<=0||e.anchor.width>1e5||e.anchor.height>1e5||!Number.isInteger(e.width)||e.width<160||e.width>640||!Number.isInteger(e.height)||e.height<48||e.height>480||e.side!==void 0&&!qt.includes(e.side)||e.focus!==void 0&&e.focus!==!0&&e.focus!==!1||!Wt(e.data)||!We(e.data))return!1;return JSON.stringify(e.data).length<=16000}catch{return!1}};var jt=["file","directory","other","missing"],Ke=(e)=>Boolean(e&&"sessionId"in e),Je=(e)=>Boolean(e&&"sent"in e&&!("sessionId"in e));var Kt=/^[0-9a-f]{7,64}$/i,Ye=(e)=>Kt.test(e),Te=500,_e=32000,Jt=16000,Yt=128,Qt=200,Zt=2000,eo=16000,to=80,oo=200,so=16000;var ro=2000;var ve=8000000,Qe=4194304,Ze=20000,ke=1024,Ae=2000000;var Re=64000,Ge=8000,et=4000;var tt=960000;var no=999,io=1e4,le=500,ao=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","REQUEST_FAILED","RESPONSE_TOO_LARGE","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED","UNSUPPORTED"],lo=["stopped","starting","ready","failed"],Go=new Set(ao),po=(e)=>Go.has(e),co=(e)=>e&&po(e)?e:"HOST_REJECTED",J=(e)=>{if(e===void 0)return!1;if(e===null||e===!0||e===!1)return!0;if(String(e)===e)return!0;if(Number(e)===e)return Number.isFinite(e);if(Array.isArray(e))return e.every(J);if(Object(e)===e)return Object.values(e).every(J);return!1},uo=(e)=>J(e)&&JSON.stringify(e).length<=so,zt=(e)=>e?.trim().slice(0,oo)??"",Y=(e)=>{let s=e.id.trim().slice(0,Yt),r=e.title.trim().slice(0,Qt),u=e.url.trim().slice(0,Zt),d=e.text?.trim().slice(0,eo),m=e.author?.trim().slice(0,to),A=e.kind==="pull"?"pull":"issue",y={providerId:e.providerId.trim(),id:s,title:r||s,url:u,kind:A};if(d)y.text=d;if(m)y.author=m;if(A==="pull"){let R=zt(e.branches?.head),M=zt(e.branches?.base);if(R&&M)y.branches={head:R,base:M}}if(uo(e.data))y.data=e.data;return y},ot=(e)=>{let s=Y(e);if(e.projectId)s.projectId=e.projectId;if(e.navigation)s.navigation=e.navigation;if(e.worktree)s.worktree=e.worktree;return s},st=(e)=>{let s={text:e.text.trim().slice(0,Jt)};if(e.send)s.send=!0;return s},rt=(e)=>{if(e===null||!Number.isFinite(e))return null;return Math.min(no,Math.max(0,Math.round(e)))},nt=(e)=>{if(!Number.isFinite(e))return 0;return Math.min(io,Math.max(0,Math.ceil(e)))};var Q=(e)=>e.length>0&&e.length<=ke&&!e.includes("\x00")&&!e.includes("\\");var pe=(e)=>{if(!e.startsWith("/")||e.includes("\x00")||e.includes("\\")||e.includes("://"))return!1;if(e.length>ro)return!1;return!e.split("/").some((r)=>r==="."||r==="..")},Co=new Set(lo),it=(e)=>Boolean(e&&"status"in e&&Co.has(String(e.status))&&!("body"in e)),ce=(e)=>Boolean(e&&"status"in e&&"body"in e&&Number.isInteger(e.status)),at=(e)=>Boolean(e&&"content"in e&&String(e.content)===e.content),lt=(e)=>Boolean(e&&"written"in e&&e.written===!0),pt=(e)=>Boolean(e&&"entries"in e&&Array.isArray(e.entries)),Oo=new Set(jt),ct=(e)=>Boolean(e&&"kind"in e&&"size"in e&&Oo.has(String(e.kind))&&Number.isFinite(e.size)),ut=(e)=>Boolean(e&&"text"in e&&String(e.text)===e.text&&!("status"in e)),Po=new Set(["workspace","shells","ready","directory","session","connection","settings","session-lifecycle","item","resolve","action","status-control-event","popover-closed","file-open","file-snapshot","file-saved"]),wo=(e)=>Object(e)===e?e:null,je=(e)=>String(e)===e&&e.length>0,Mo=(e)=>{if(!je(e.id))return null;if(e.ok===!0){let s={channel:S,v:g,type:"result",id:e.id,ok:!0};if(Object(e.payload)===e.payload)s.payload=e.payload;return s}if(e.ok===!1&&je(e.error))return{channel:S,v:g,type:"result",id:e.id,ok:!1,error:e.error,code:co(je(e.code)?e.code:void 0)};return null},dt=(e)=>{let s=wo(e);if(!s||s.channel!==S||s.v!==g)return null;if(s.type==="result")return Mo(s);if(!Po.has(String(s.type))||Object(s.payload)!==s.payload)return null;return s};var So=(e)=>("key"in e)&&("metaKey"in e)&&("ctrlKey"in e),Io=(e)=>(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="s";class a extends Error{code;constructor(e,s){super(s);this.name="HostRequestError",this.code=e}}var St=()=>Promise.reject(new a("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),Ce=()=>Promise.reject(new a("BAD_PATH",`File path must be 1 to ${ke} characters without NUL or backslash.`)),Oe=(e)=>{if(e===void 0)return;if(Object(e)!==e||Array.isArray(e)||e.scope!==void 0&&e.scope!=="instance"&&e.scope!=="device")throw new a("HOST_REJECTED",'Storage scope must be "instance" or "device".');return e.scope==="device"?"device":void 0},c=(e)=>(e.value+=1,`oc-${e.value}`),gt=(e={})=>{let s=e.target??("window"in globalThis?window:null);if(!s)throw new a("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let r=e.acceptSource??((t)=>t===s.parent),u=e.requestTimeoutMs??Ze,d=new Set,m=new Set,A=new Set,y=new Set,R=new Set,M=new Set,X=new Set,ue=new Set,de=new Set,oe=null,se=null,Se=new Set,ge=new Set,re=null,ne=null,Le=!1,z=new Map,j=new Map,K=new Map,N=!1,p={value:0},l=null,F=null,ie=!1,ae=!1,Rt=null,Gt=(t)=>{if(!t)return null;return{sessionId:t.id,phase:t.busy?"started":"completed"}},U=(t)=>{s.parent.postMessage(t,"*")},G=(t,o)=>{for(let i of t)try{i(o)}catch(n){console.error(n)}},Ct=(t)=>{if(!(t instanceof MessageEvent))return;if(!r(t.source))return;let o=dt(t.data);if(!o)return;if(o.type==="workspace"){let n=j.get(o.payload.subscriptionId);if(n)G([n],o.payload.snapshot);return}if(o.type==="shells"){let n=K.get(o.payload.subscriptionId);if(n)G([n],o.payload.snapshot);return}if(o.type==="ready"){let n=o.payload;if(l=n,F=Gt(n.session),G(d,n),G(m,n.directory),G(A,n.session),F)G(y,F);G(R,n.connection),G(M,n.settings),G(X,n.item);return}if(o.type==="directory"){if(l)l={...l,directory:o.payload.directory};G(m,o.payload.directory);return}if(o.type==="session"){if(l)l={...l,session:o.payload.session};if(!o.payload.session)F=null;else if(F?.sessionId!==o.payload.session.id)F=Gt(o.payload.session);G(A,o.payload.session);return}if(o.type==="session-lifecycle"){F=o.payload,G(y,o.payload);return}if(o.type==="connection"){if(l)l={...l,connection:o.payload.connection};G(R,o.payload.connection);return}if(o.type==="settings"){if(l)l={...l,settings:o.payload.settings};G(M,o.payload.settings);return}if(o.type==="item"){if(l)l={...l,item:o.payload.item};G(X,o.payload.item);return}if(o.type==="status-control-event"){G(ue,o.payload);return}if(o.type==="popover-closed"){G(de,o.payload);return}if(o.type==="action"){let n=(E)=>{if(!N)U({channel:S,v:g,type:"action-result",id:o.id,payload:E})},f=se;if(!f){n({ok:!1,error:"This extension does not handle background actions."});return}Promise.resolve().then(()=>f(o.payload)).then(()=>n({ok:!0}),(E)=>{let k=(E instanceof Error?E.message:String(E)).trim();n({ok:!1,error:(k||"Action failed.").slice(0,le)})});return}if(o.type==="file-open"){let n=o.payload;if(ne&&Xt(ne,n))return;ne=n,G(Se,o.payload);return}if(o.type==="file-saved"){G(ge,o.payload.version);return}if(o.type==="file-snapshot"){let n=(k)=>{if(!N)U({channel:S,v:g,type:"file-snapshot-result",id:o.id,payload:k})},f=(k)=>n({error:(k.trim()||"Could not read the edited file.").slice(0,le)}),E=re;if(!E){f("This extension does not edit files.");return}Promise.resolve().then(()=>E(o.payload.purpose)).then((k)=>{if(qe(k)>be){f(`The file is over ${be} ${"bytes"in k?"bytes":"characters"}.`);return}if(k.version.length>xe){f(`The snapshot version is over ${xe} characters.`);return}n({snapshot:"bytes"in k?{bytes:k.bytes,version:k.version}:{content:k.content,version:k.version}})},(k)=>f(k instanceof Error?k.message:String(k)));return}if(o.type==="resolve"){let n=(E)=>{U({channel:S,v:g,type:"resolve-result",id:o.id,payload:E})},f=oe;if(!f){n({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>f(o.payload)).then((E)=>n({item:E?Y(E):null}),(E)=>{let k=(E instanceof Error?E.message:String(E)).trim();n({error:(k||"Command failed.").slice(0,le)})});return}let i=z.get(o.id);if(!i)return;if(clearTimeout(i.timer),z.delete(o.id),o.ok){i.resolve(o.payload);return}i.reject(new a(o.code,o.error))};s.addEventListener("message",Ct),U({channel:S,v:g,type:"hello"});let P=(t,o=u)=>{if(N||s.parent===s)return Promise.reject(new a("HOST_UNAVAILABLE","No host frame. This page is not in an iframe."));return new Promise((i,n)=>{let f=setTimeout(()=>{z.delete(t.id),n(new a("HOST_TIMEOUT","Host did not answer in time."))},o);z.set(t.id,{resolve:i,reject:n,timer:f}),U(t)})},_=(t)=>P(t).then(()=>{return}),v={channel:S,v:g},He=(t)=>{if(!N&&s.parent!==s)U(t)},Ot=()=>He({...v,type:"file-save"}),Pt=(t)=>{if(!So(t)||!Io(t))return;t.preventDefault(),Ot()},wt=(t)=>{if(!So(t)||t.key!=="Escape"||l?.surface!=="popover"||!l.popover)return;t.preventDefault(),Lt(l.popover.id,"escape").catch(()=>{return})},me=()=>{let t=l?.surface==="popover"?l.popover:void 0;if(!t)return;let o=ie||ae;if(Rt===o)return;Rt=o,Ht(t.id,o).catch(()=>{return})},Ee=()=>{if(l?.surface!=="popover"||ie)return;ie=!0,me()},Mt=(t)=>{if(l?.surface!=="popover"||t.relatedTarget!==null||!ie)return;ie=!1,me()},It=()=>{if(l?.surface!=="popover"||ae)return;ae=!0,me()},Ut=()=>{if(l?.surface!=="popover"||!ae)return;ae=!1,me()},H=(t,o=1024)=>{if(!t.trim()||t.length>o)throw new a("HOST_REJECTED",`Identity must contain 1 to ${o} characters.`)},Ne=async(t)=>{if(t.kind!=="projects")H(t.projectId);let o=await P({...v,type:"workspace-read",id:c(p),payload:t});if(!o||!("kind"in o)||!("state"in o)||o.kind!==t.kind)throw new a("HOST_REJECTED","Host did not return workspace data.");return o},Fe=async(t,o)=>{if(t.kind!=="projects")H(t.projectId);let i=c(p);j.set(i,o);try{await _({...v,type:"workspace-subscribe",id:c(p),payload:{subscriptionId:i,query:t}})}catch(n){if(j.delete(i),!N)U({...v,type:"workspace-unsubscribe",id:c(p),payload:{subscriptionId:i}});throw n}return()=>{if(!j.delete(i)||N)return;U({...v,type:"workspace-unsubscribe",id:c(p),payload:{subscriptionId:i}})}},Ao=async(t,o)=>{if(t.kind==="session")H(t.sessionId);if(t.kind==="project")H(t.projectId);let i=c(p);K.set(i,o);try{await _({...v,type:"shells-subscribe",id:c(p),payload:{subscriptionId:i,scope:t}})}catch(n){if(K.delete(i),!N)U({...v,type:"shells-unsubscribe",id:c(p),payload:{subscriptionId:i}});throw n}return()=>{if(!K.delete(i)||N)return;U({...v,type:"shells-unsubscribe",id:c(p),payload:{subscriptionId:i}})}},fe=async(t)=>{if("key"in t&&(t.key.length===0||t.key.length>$e))throw new a("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(t.op==="set"&&!J(t.value))throw new a("HOST_REJECTED","Storage values must be JSON.");if(t.op==="set"&&new TextEncoder().encode(JSON.stringify(t.value)).length>Xe)throw new a("HOST_REJECTED","Storage value exceeds 64 KiB.");if(t.scope==="device"&&l?.features?.deviceStorage!==!0)throw new a("UNSUPPORTED","This host does not support device storage.");let o=await P({...v,type:"storage",id:c(p),payload:t});if(!o||!("storage"in o)||o.op!==t.op)throw new a("HOST_REJECTED","Host did not return storage data.");return o},Lt=(t,o)=>l?.features?.popovers!==!0&&!(l?.surface==="popover"&&l.popover?.id===t)?Promise.reject(new a("UNSUPPORTED","This host does not support popovers.")):_({...v,type:"popover-close",id:c(p),payload:o?{id:t,reason:o}:{id:t}}),Ht=(t,o)=>l?.features?.popovers!==!0&&!(l?.surface==="popover"&&l.popover?.id===t)?Promise.reject(new a("UNSUPPORTED","This host does not support popovers.")):_({...v,type:"popover-anchor",id:c(p),payload:{id:t,active:o}});return s.addEventListener("keydown",wt,!0),s.addEventListener("pointerover",Ee),s.addEventListener("pointermove",Ee),s.addEventListener("pointerout",Mt),s.addEventListener("focus",It),s.addEventListener("blur",Ut),{onAction:(t)=>(se=t,()=>{if(se===t)se=null}),listProjects:async()=>{let t=await Ne({kind:"projects"});if(t.kind!=="projects")throw new a("HOST_REJECTED","Expected projects.");return t},listWorktrees:async(t)=>{let o=await Ne({kind:"worktrees",projectId:t});if(o.kind!=="worktrees")throw new a("HOST_REJECTED","Expected worktrees.");return o},listSessions:async(t)=>{let o=await Ne({kind:"sessions",projectId:t});if(o.kind!=="sessions")throw new a("HOST_REJECTED","Expected sessions.");return o},onProjects:(t)=>Fe({kind:"projects"},(o)=>{if(o.kind==="projects")t(o)}),onWorktrees:(t,o)=>Fe({kind:"worktrees",projectId:t},(i)=>{if(i.kind==="worktrees")o(i)}),onSessions:(t,o)=>Fe({kind:"sessions",projectId:t},(i)=>{if(i.kind==="sessions")o(i)}),onRunningShells:(t,o)=>Ao(t,o),readShellOutput:async(t,o)=>{H(t,ye);let i=o?.cursor;if(i!==void 0&&(!Number.isInteger(i)||i<0))throw new a("HOST_REJECTED","Shell output cursor must be a non-negative integer.");let n=o?.tailBytes;if(n!==void 0&&(!Number.isInteger(n)||n<1||n>he))throw new a("HOST_REJECTED",`Shell output tailBytes must be an integer between 1 and ${he}.`);let E=await P({...v,type:"shell-output",id:c(p),payload:{shellId:t,cursor:i,tailBytes:n}});if(!E||typeof E.output!=="string"||!Number.isFinite(E.cursor))throw new a("HOST_REJECTED","Host did not return shell output.");return E},stopShell:async(t)=>{if(H(t,ye),(await P({...v,type:"shell-stop",id:c(p),payload:{shellId:t}}))?.stopped!==!0)throw new a("HOST_REJECTED","Host did not stop the shell.");return{stopped:!0}},openSession:async(t)=>{H(t),await _({...v,type:"open-session",id:c(p),payload:{sessionId:t}})},storage:{get:async(t,o)=>{let i=Oe(o),n={op:"get",key:t};if(i)n.scope=i;let f=await fe(n);return f.op==="get"&&f.found?f.value:void 0},set:async(t,o,i)=>{let n=Oe(i),f={op:"set",key:t,value:o};if(n)f.scope=n;await fe(f)},delete:async(t,o)=>{let i=Oe(o),n={op:"delete",key:t};if(i)n.scope=i;await fe(n)},keys:async(t)=>{let o=Oe(t),i={op:"keys"};if(o)i.scope=o;let n=await fe(i);if(n.op!=="keys")throw new a("HOST_REJECTED","Expected storage keys.");return n.keys}},onReady:(t)=>{if(d.add(t),l)t(l);return()=>{d.delete(t)}},onDirectory:(t)=>{if(m.add(t),l)t(l.directory);return()=>{m.delete(t)}},onSession:(t)=>{if(A.add(t),l)t(l.session);return()=>{A.delete(t)}},onSessionLifecycle:(t)=>{if(y.add(t),F)t(F);return()=>{y.delete(t)}},onConnection:(t)=>{if(R.add(t),l)t(l.connection);return()=>{R.delete(t)}},onSettings:(t)=>{if(M.add(t),l)t(l.settings);return()=>{M.delete(t)}},onItem:(t)=>{if(X.add(t),l)t(l.item);return()=>{X.delete(t)}},onStatusControl:(t)=>(ue.add(t),()=>{ue.delete(t)}),onPopoverClosed:(t)=>(de.add(t),()=>{de.delete(t)}),setStatusControls:(t)=>{if(l?.features?.statusControls!==!0)return Promise.reject(new a("UNSUPPORTED","This host does not support status controls."));if(!$t(t))return Promise.reject(new a("HOST_REJECTED","Status controls must have unique bounded ids and valid selected options."));return _({...v,type:"status-controls",id:c(p),payload:{controls:t}})},openPopover:(t)=>{if(l?.features?.popovers!==!0)return Promise.reject(new a("UNSUPPORTED","This host does not support popovers."));if(!ze(t))return Promise.reject(new a("HOST_REJECTED","Popover requests need bounded geometry and JSON data."));return _({...v,type:"popover-open",id:c(p),payload:t})},closePopover:Lt,setPopoverAnchorActive:Ht,onResolve:(t)=>(oe=t,()=>{if(oe===t)oe=null}),toast:(t)=>{let o=t.message.trim();if(!o||o.length>Te)return Promise.reject(new a("HOST_REJECTED",`Toast message must contain 1 to ${Te} characters.`));if(t.copy&&t.copy!==!0&&(!t.copy.text.length||t.copy.text.length>_e))return Promise.reject(new a("HOST_REJECTED",`Toast copy text must contain 1 to ${_e} characters.`));return _({channel:S,v:g,type:"toast",id:c(p),payload:{...t,message:o}})},openUrl:(t)=>_({channel:S,v:g,type:"open-url",id:c(p),payload:{url:t}}),openCommit:(t)=>Ye(t)?_({channel:S,v:g,type:"open-commit",id:c(p),payload:{sha:t}}):Promise.reject(new a("HOST_REJECTED","Commit id must be 7 to 64 hex characters.")),openSurface:(t)=>_({channel:S,v:g,type:"open-surface",id:c(p),payload:{surfaceId:t}}),writeClipboard:(t)=>_({channel:S,v:g,type:"clipboard-write",id:c(p),payload:{text:t}}),compose:(t)=>_({channel:S,v:g,type:"compose",id:c(p),payload:t}),attach:(t)=>_({channel:S,v:g,type:"attach",id:c(p),payload:Y(t)}),startSession:async(t)=>{if(t.projectId!==void 0)H(t.projectId);let o=t.worktree;if(o&&o!==!0)if(o.kind==="existing")H(o.directory);else{if(o.name!==void 0)H(o.name,200);if(o.baseBranch!==void 0)H(o.baseBranch,200)}let i=await P({channel:S,v:g,type:"start-session",id:c(p),payload:ot(t)},e.requestTimeoutMs??180000);if(!Ke(i))throw new a("HOST_REJECTED","Host did not return a session.");return i},prompt:(t)=>P({channel:S,v:g,type:"prompt",id:c(p),payload:st(t)}).then((o)=>{if(!Je(o))throw new a("HOST_REJECTED","Host did not return a prompt result.");return o}),sessionLink:(t)=>_({channel:S,v:g,type:"session-link",id:c(p),payload:Y(t)}),close:()=>_({channel:S,v:g,type:"close",id:c(p)}),oauthStart:()=>_({channel:S,v:g,type:"oauth-start",id:c(p)}),oauthDisconnect:()=>_({channel:S,v:g,type:"oauth-disconnect",id:c(p)}),request:(t)=>(pe(t.path)?P({channel:S,v:g,type:"request",id:c(p),payload:t}):St()).then((o)=>{if(!ce(o))throw new a("HOST_REJECTED","Host request result was empty.");if(o.body.length>ve)throw new a("HOST_REJECTED","Host request result was too large.");return o}),openCodeRequest:(t)=>(pe(t.path)?P({channel:S,v:g,type:"opencode-request",id:c(p),payload:t}):St()).then((o)=>{if(!ce(o))throw new a("HOST_REJECTED","Host OpenCode request result was empty.");if(o.body.length>Qe)throw new a("HOST_REJECTED","Host OpenCode request result was too large.");return o}),serviceRequest:(t)=>(pe(t.path)?P({channel:S,v:g,type:"service-request",id:c(p),payload:t}):St()).then((o)=>{if(!ce(o))throw new a("HOST_REJECTED","Host service request result was empty.");if(o.body.length>ve)throw new a("HOST_REJECTED","Host service request result was too large.");return o}),serviceStatus:()=>P({channel:S,v:g,type:"service-status",id:c(p)}).then((t)=>{if(!it(t))throw new a("HOST_REJECTED","Host did not return service status.");return t}),readFile:(t)=>(Q(t)?P({channel:S,v:g,type:"file-read",id:c(p),payload:{path:t}}):Ce()).then((o)=>{if(!at(o))throw new a("HOST_REJECTED","Host did not return file content.");return o}),writeFile:(t,o)=>{if(!Q(t))return Ce();if(o.length>Ae)return Promise.reject(new a("FILE_TOO_LARGE",`Content is over ${Ae} characters.`));return P({channel:S,v:g,type:"file-write",id:c(p),payload:{path:t,content:o}}).then((i)=>{if(!lt(i))throw new a("HOST_REJECTED","Host did not confirm the write.");return i})},listDir:(t)=>(Q(t)?P({channel:S,v:g,type:"file-list",id:c(p),payload:{path:t}}):Ce()).then((o)=>{if(!pt(o))throw new a("HOST_REJECTED","Host did not return directory entries.");return o}),stat:(t)=>(Q(t)?P({channel:S,v:g,type:"file-stat",id:c(p),payload:{path:t}}):Ce()).then((o)=>{if(!ct(o))throw new a("HOST_REJECTED","Host did not return file status.");return o}),generate:(t)=>{let o=t.prompt.trim(),i=t.system?.trim();if(o.length===0||o.length>Re)return Promise.reject(new a("HOST_REJECTED",`Prompt must be 1 to ${Re} characters.`));if(i!==void 0&&(i.length===0||i.length>Ge))return Promise.reject(new a("HOST_REJECTED",`System prompt must be 1 to ${Ge} characters.`));let n=t.maxOutputTokens===void 0?void 0:Math.min(et,Math.max(1,Math.floor(t.maxOutputTokens)));if(n!==void 0&&!Number.isFinite(n))return Promise.reject(new a("HOST_REJECTED","maxOutputTokens must be a number."));let f={prompt:o};if(i!==void 0)f.system=i;if(n!==void 0)f.maxOutputTokens=n;return P({channel:S,v:g,type:"generate",id:c(p),payload:f},e.requestTimeoutMs??tt).then((E)=>{if(!ut(E))throw new a("HOST_REJECTED","Host did not return generated text.");return E})},setBadge:(t)=>_({channel:S,v:g,type:"badge",id:c(p),payload:{count:rt(t)}}),setHeight:(t)=>_({channel:S,v:g,type:"resize",id:c(p),payload:{height:nt(t)}}),onFileOpen:(t)=>{if(Se.add(t),!Le)Le=!0,s.addEventListener("keydown",Pt,!0);if(ne)t(ne);return()=>{Se.delete(t)}},onFileSnapshot:(t)=>(re=t,()=>{if(re===t)re=null}),onFileSaved:(t)=>(ge.add(t),()=>{ge.delete(t)}),reportFileChange:(t)=>He({...v,type:"file-change",payload:{dirty:t.dirty,edited:t.edited}}),requestFileSave:Ot,reportFileUnsupported:()=>He({...v,type:"file-unsupported"}),dispose:()=>{for(let t of j.keys())U({...v,type:"workspace-unsubscribe",id:c(p),payload:{subscriptionId:t}});j.clear();for(let t of K.keys())U({...v,type:"shells-unsubscribe",id:c(p),payload:{subscriptionId:t}});if(K.clear(),N=!0,oe=null,se=null,re=null,Se.clear(),ge.clear(),Le)s.removeEventListener("keydown",Pt,!0);s.removeEventListener("message",Ct),s.removeEventListener("keydown",wt,!0),s.removeEventListener("pointerover",Ee),s.removeEventListener("pointermove",Ee),s.removeEventListener("pointerout",Mt),s.removeEventListener("focus",It),s.removeEventListener("blur",Ut);for(let t of z.values())clearTimeout(t.timer),t.reject(new a("HOST_UNAVAILABLE","Host client was disposed."));z.clear(),d.clear(),m.clear(),A.clear(),y.clear(),R.clear(),M.clear(),X.clear(),ue.clear(),de.clear()}}};var go=["browser.open","browser.snapshot","browser.click","browser.type","browser.scroll","browser.back","browser.forward","browser.inspect","browser.capture","browser.resize","browser.close"];var Ss=new Set(go);var mo=["none","agent","user"];var ms=new Set(mo);var Uo=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],Lo=[["--oc-syntax-keyword","--syntax-keyword","syntaxKeyword"],["--oc-syntax-string","--syntax-string","syntaxString"],["--oc-syntax-number","--syntax-number","syntaxNumber"],["--oc-syntax-function","--syntax-function","syntaxFunction"],["--oc-syntax-type","--syntax-type","syntaxType"],["--oc-syntax-comment","--syntax-comment","syntaxComment"],["--oc-syntax-variable","--syntax-variable","syntaxVariable"],["--oc-syntax-operator","--syntax-operator","syntaxOperator"]],Eo=(e,s)=>{s.style.colorScheme=e.mode;for(let[r,u]of Uo)s.style.setProperty(r,e.tokens[u]);for(let[r,u,d]of Lo){let m=e.tokens[d]??"";s.style.setProperty(r,m),s.style.setProperty(u,m)}s.style.setProperty("font-family",e.tokens.font),s.style.setProperty("font-size","0.875rem"),s.style.setProperty("line-height","1.45"),s.style.setProperty("color",e.tokens.foreground)},mt=(e,s)=>{if(Eo(e.theme,s),s.dataset)s.dataset.ocSurface=e.surface,s.dataset.ocTheme=e.theme.mode};var Ho={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},b=(e,s)=>`var(--${e}, var(--oc-${Ho[e]}, ${s}))`,D=b("surface-background","transparent"),we=b("surface-elevated","transparent"),Z=b("surface-elevated-foreground","inherit"),L=b("surface-foreground","inherit"),h=b("surface-muted-foreground","gray"),No=b("surface-muted","transparent"),V=b("interactive-border","currentColor"),w=b("interactive-hover","transparent"),W=b("interactive-active","transparent"),Et=b("interactive-selection","transparent"),ft=b("interactive-selection-foreground","inherit"),B=b("primary","currentColor"),yt=b("primary-text","inherit"),ht=b("error-text","inherit"),Fo=b("font-sans","inherit"),bt=b("font-mono","monospace"),xo=b("radius","9px"),xt=`calc(${xo} - 2px)`,fo=`calc(${xo} - 4px)`,x=(e,s,r="transparent")=>`color-mix(in srgb, ${e} ${s}%, ${r})`,yo=`background-image: linear-gradient(${w}, ${w});`,Tt=(e)=>`box-shadow: inset 0 0 0 1px ${e}, var(--oc-sdk-field-lift);`,_t="box-shadow: inset 0 0 0 1px var(--oc-sdk-edge), var(--oc-sdk-raised-lift);",ho="box-shadow: var(--oc-sdk-lit);",bo=`inset 0 1px 0 0 ${x(L,1.5)}, 0 1px 1px 0 rgb(0 0 0 / 0.28), 0 2px 3px -2px rgb(0 0 0 / 0.2)`,Bo=`
:root {
  --oc-sdk-edge: ${x(L,10)};
  --oc-sdk-field-bg: ${we};
  --oc-sdk-raised-bg: ${D};
  --oc-sdk-field-lift: inset 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --oc-sdk-raised-lift: 0 1px 2px 0 rgb(0 0 0 / 0.06);
  --oc-sdk-lit: inset 0 1px 0 0 rgb(255 255 255 / 0.45), 0 1px 2px 0 rgb(0 0 0 / 0.08);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.8), inset 0 0 0 1px rgb(0 0 0 / 0.04), 0 0 0 1px rgb(0 0 0 / 0.1), 0 1px 2px -0.5px rgb(0 0 0 / 0.08), 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 12px 20px -4px rgb(0 0 0 / 0.08);
}
:root[data-oc-theme="dark"] {
  --oc-sdk-edge: ${x(L,6)};
  --oc-sdk-field-bg: ${x(D,50,we)};
  --oc-sdk-raised-bg: ${we};
  --oc-sdk-field-lift: ${bo};
  --oc-sdk-raised-lift: ${bo};
  --oc-sdk-lit: inset 0 1px 0 0 ${x(L,1.5)}, 0 1px 1px 0 rgb(0 0 0 / 0.28), 0 2px 3px -2px rgb(0 0 0 / 0.2);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.06), inset 0 0 0 1px rgb(255 255 255 / 0.08), 0 0 0 1px rgb(0 0 0 / 0.36), 0 1px 1px -0.5px rgb(0 0 0 / 0.22), 0 3px 3px -1.5px rgb(0 0 0 / 0.2), 0 6px 6px -3px rgb(0 0 0 / 0.16);
}`,Pe=(e)=>{let s=b(`status-${e}`,"currentColor");return`
.oc-sdk[data-tone="${e}"], .oc-sdk [data-tone="${e}"] { --oc-sdk-tone: ${s}; --oc-sdk-tone-text: ${b(`${e}-text`,"inherit")}; }`},Do=`
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
`,To=`${Bo}
.oc-sdk { color: ${L}; font-family: ${Fo}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${yo} }
.oc-sdk-mono { font-family: ${bt}; }
.oc-sdk-muted { color: ${h}; }
${Pe("success")}${Pe("warning")}${Pe("error")}${Pe("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${B}; --oc-sdk-tone-text: ${yt}; }

.oc-sdk-btn { border-radius: ${xt}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${fo}; }
.oc-sdk-btn[data-variant="default"] { color: ${yt}; background: ${x(B,10,D)}; border-color: ${x(B,12)}; ${ho} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${x(B,16,D)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${x(B,22,D)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${No}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${w}, ${w}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${W}, ${W}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${Z}; border-color: transparent; ${_t} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${w}, ${w}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${W}, ${W}); box-shadow: inset 0 0 0 1px var(--oc-sdk-edge); }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${w}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${W}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${b("status-error","red")}; color: ${ht}; background: ${x("var(--oc-sdk-tone)",7,D)}; border-color: ${x("var(--oc-sdk-tone)",12)}; ${ho} }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${x("var(--oc-sdk-tone)",9,D)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${x("var(--oc-sdk-tone)",11,D)}; box-shadow: none; }

.oc-sdk-field-note { color: ${h}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${ht}; }
.oc-sdk-input { border-radius: ${xt}; background: var(--oc-sdk-field-bg); color: ${Z}; ${Tt("var(--oc-sdk-edge)")} transition: background 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${h}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${w}, ${w}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { ${Tt(x(L,26))} }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input, .oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { ${Tt(b("status-error","red"))} }
.oc-sdk-input[data-mono="true"] { font-family: ${bt}; }

.oc-sdk-search-icon { color: ${h}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${B}; }
.oc-sdk-search-clear { border-radius: ${fo}; color: ${h}; }
.oc-sdk-search-clear:hover { background: ${w}; color: ${L}; }

.oc-sdk-trigger { border-color: transparent; border-radius: ${xt}; background: var(--oc-sdk-raised-bg); color: ${Z}; ${_t} transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${w}, ${w}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${W}, ${W}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${h}; }
.oc-sdk-trigger-chevron { color: ${h}; }
/* The app's dropdown light: lit top, hairline rings and a layered shadow, no border. */
.oc-sdk-popup { --surface-foreground: ${Z}; border-color: transparent; border-radius: 12px; background: ${we}; color: ${Z}; box-shadow: var(--oc-sdk-float); }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${w}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${Et}; color: ${ft}; }
.oc-sdk-option-check { color: ${L}; }
.oc-sdk-option[data-destructive="true"] { color: ${ht}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${x(b("status-error","red"),10)}; }
.oc-sdk-option-hint { color: ${h}; }
.oc-sdk-popup-empty { color: ${h}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${V}; border-radius: 4px; color: ${L}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${x(L,60,V)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${V}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${D}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${B}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(16px); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${yo} }
.oc-sdk-check-desc { color: ${h}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${x(L,4)}; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.16); }
.oc-sdk-tab { border-radius: 8px; color: ${h}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${L}; }
.oc-sdk-tab[aria-selected="true"] { color: ${ft}; background: ${Et}; border-color: ${V}; }
.oc-sdk-tabs[data-track="true"] .oc-sdk-tab[aria-selected="true"] { color: ${Z}; background: var(--oc-sdk-raised-bg); border-color: transparent; ${_t} }
.oc-sdk-tab-count { color: ${h}; }

.oc-sdk-badge { border-radius: 9999px; background: ${w}; color: ${h}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${x("var(--oc-sdk-tone)",15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${w}; }
.oc-sdk-row[aria-selected="true"] { background: ${Et}; color: ${ft}; }
.oc-sdk-row-lead { font-family: ${bt}; color: ${h}; }
.oc-sdk-row-sub { color: ${h}; }
.oc-sdk-row-meta { color: ${h}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${h}; }

.oc-sdk-empty-body { color: ${h}; }

.oc-sdk-spinner { color: ${h}; }
.oc-sdk-spinner-ring { border-color: ${V}; border-top-color: ${B}; border-radius: 9999px; }

/* Set apart by its tint alone, like the app's banners. */
.oc-sdk-banner { border-color: transparent; border-radius: 8px; background: ${x("var(--oc-sdk-tone)",10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${h}; }

.oc-sdk-separator { color: ${h}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${x(V,40)}; }

.oc-sdk-progress-label { color: ${h}; }
.oc-sdk-progress-track { border-radius: 9999px; background: ${V}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${B}); }

.oc-sdk-text a { color: ${yt}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${x(V,60)}; }
`,C=`
${Be}
${Do}
${To}`;var _o="oc-sdk-ui-style";var O=(e)=>{let s=document.getElementById(_o);if(s instanceof HTMLStyleElement){if(s.textContent!==e)s.textContent=e;return}De(document);let r=document.createElement("style");r.id=_o,r.textContent=e,document.head.appendChild(r)},T=(e,s)=>{let r=document.createElement(e);if(s)r.className=s;return r},q=(e)=>{let s=T("button",e);return s.type="button",s},I=(e,s)=>{let r=s??"";if(e.textContent!==r)e.textContent=r},ee=(e,s,r)=>{if(r===void 0||r===null||r==="")e.removeAttribute(s);else if(e.getAttribute(s)!==r)e.setAttribute(s,r)};var $o=()=>{let e=document.createElement("span");return e.className="oc-sdk-spinner-ring",e.setAttribute("aria-hidden","true"),e},te=(e,s)=>{O(C);let r=s,u=q("oc-sdk oc-sdk-btn"),d=$o(),m=document.createElement("span");u.append(m),e.append(u);let A=()=>{if(u.dataset.variant=r.variant??"default",u.dataset.size=r.size??"default",u.disabled=Boolean(r.disabled)||Boolean(r.loading),u.dataset.loading=r.loading?"true":"false",u.setAttribute("aria-busy",r.loading?"true":"false"),r.loading&&d.parentNode!==u)u.prepend(d);else if(!r.loading&&d.parentNode===u)d.remove();I(m,r.label)},y=()=>{if(r.disabled||r.loading)return;r.onClick()};return u.addEventListener("click",y),A(),{update:(R)=>{r={...r,...R},A()},dispose:()=>{u.removeEventListener("click",y),u.remove()}}};var vt=(e,s)=>{O(C);let r=s,u=T("label","oc-sdk oc-sdk-field"),d=T("span","oc-sdk-field-label"),m=r.multiline?T("textarea","oc-sdk-input"):T("input","oc-sdk-input"),A=T("span","oc-sdk-field-note");u.append(d,m,A),e.append(u);let y=()=>{if(I(d,r.label),d.hidden=!r.label,m instanceof HTMLInputElement)m.type=r.password?"password":"text";else m.rows=r.rows??3;if(m.value!==r.value)m.value=r.value;m.disabled=Boolean(r.disabled),ee(m,"placeholder",r.placeholder),m.dataset.mono=r.mono?"true":"false";let M=Boolean(r.error);u.dataset.invalid=M?"true":"false",m.setAttribute("aria-invalid",M?"true":"false");let X=r.error??r.helper??"";I(A,X),A.hidden=X===""},R=()=>{r.onChange(m.value)};return m.addEventListener("input",R),y(),{update:(M)=>{r={...r,...M},y()},dispose:()=>{m.removeEventListener("input",R),u.remove()}}};var At=gt(),ko=document.querySelector("#root");if(!ko)throw Error("Missing root");var vo=!1;At.onReady((e)=>{if(mt(e,document.documentElement),vo)return;vo=!0;let s=document.createElement("div");s.style.cssText="display:flex;align-items:center;gap:8px;height:100%;padding:0 8px;box-sizing:border-box;",ko.append(s);let r="",u=document.createElement("div");u.style.flex="1",s.append(u);let d=vt(u,{value:r,placeholder:"https://example.com",mono:!0,onChange:(y)=>{r=y,d.update({value:y})}}),m=te(s,{label:"Go",size:"sm",onClick:()=>{if(!r.trim())return;m.update({loading:!0}),At.serviceRequest({method:"POST",path:"/navigate",body:JSON.stringify({url:r.trim()})}).then(()=>A()).finally(()=>m.update({loading:!1}))}}),A=async()=>{try{let y=await At.serviceRequest({method:"GET",path:"/state"}),R=JSON.parse(y.body);if(String(R.url)===R.url&&R.url!==r)r=R.url==="about:blank"?"":R.url,d.update({value:r})}catch{}};A(),setInterval(()=>{A()},2000)});})();
