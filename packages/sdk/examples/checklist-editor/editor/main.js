(()=>{var S="openchamber.sdk",g=1;var ze=`
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
`;function je(e){let s=e.documentElement;if(s.hasAttribute("data-oc-scrollbar-activity"))return;s.setAttribute("data-oc-scrollbar-activity","");let r=new WeakMap;e.addEventListener("scroll",(l)=>{let c=l.target===e?s:l.target;if(!(c instanceof Element))return;if(!c.hasAttribute("data-oc-scrolling"))c.setAttribute("data-oc-scrolling","");let m=r.get(c);if(m!==void 0)clearTimeout(m);r.set(c,setTimeout(()=>{r.delete(c),c.removeAttribute("data-oc-scrolling")},1000))},{capture:!0,passive:!0})}var No=`(${je.toString()})(document);`;var Ke=128,Je=65536;var be=128;var Te=65536;var Jt=/^[a-z][a-z0-9-]{0,39}$/;var zt=(e)=>Object(e)===e&&!Array.isArray(e),Ye=(e,s)=>Object.keys(e).every((r)=>s.includes(r)),jt=(e)=>String(e)===e&&e.length>=1&&e.length<=60,Kt=(e)=>String(e)===e&&e.length>=1&&e.length<=80,Yt=(e)=>{if(!Array.isArray(e)||e.length>4)return!1;let s=new Set;for(let r of e){if(!zt(r)||!Jt.test(r.id)||!jt(r.label))return!1;if(r.disabled!==void 0&&r.disabled!==!0&&r.disabled!==!1)return!1;if(s.has(r.id))return!1;if(s.add(r.id),r.kind==="button"){if(!Ye(r,["kind","id","label","disabled"]))return!1;continue}if(r.kind!=="select"||!Ye(r,["kind","id","label","value","options","disabled"]))return!1;if(!Kt(r.value)||!Array.isArray(r.options)||r.options.length<1||r.options.length>16)return!1;let l=new Set;for(let c of r.options){if(!zt(c)||!Ye(c,["value","label"])||!Kt(c.value)||!jt(c.label)||l.has(c.value))return!1;l.add(c.value)}if(!l.has(r.value))return!1}return!0};var ve=20000000,_e=256;var Qe=(e)=>("bytes"in e)?e.bytes.byteLength:e.content.length,Qt=(e,s)=>{if(e.path!==s.path||e.readOnly!==s.readOnly)return!1;if(e.encoding==="text"||s.encoding==="text")return e.encoding==="text"&&s.encoding==="text"&&e.content===s.content;if(e.bytes.byteLength!==s.bytes.byteLength)return!1;for(let r=0;r<e.bytes.byteLength;r+=1)if(e.bytes[r]!==s.bytes[r])return!1;return!0},ke=(e)=>{let s=e,r=e;return{observe:(l)=>{let c=l!==r;return r=l,{edited:c,dirty:l!==s}},markSaved:(l)=>(s=l,r!==l)}};var Zt=/^[A-Za-z0-9_-]{1,80}$/;var eo=["left","right","top","bottom"];var to=(e,s=0,r={remaining:16000})=>{if(--r.remaining<0||s>=32)return!1;if(e===null)return!0;let l=Array.isArray(e)?e:Object(e)===e?Object.values(e):[];for(let c of l)if(!to(c,s+1,r))return!1;return!0},Ze=(e)=>{if(e===null||e===!0||e===!1)return!0;if(Array.isArray(e))return Object.keys(e).every((s)=>/^(0|[1-9]\d*)$/.test(s)&&Number(s)<e.length)&&e.every(Ze);if(Object(e)===e){let s=Object.getPrototypeOf(e);return(s===null||s===Object.prototype)&&Object.values(e).every(Ze)}return String(e)===e||Number.isFinite(e)},et=(e)=>{try{if(String(e.id)!==e.id||!Zt.test(e.id)||!Number.isFinite(e.anchor.x)||Math.abs(e.anchor.x)>1e5||!Number.isFinite(e.anchor.y)||Math.abs(e.anchor.y)>1e5||!Number.isFinite(e.anchor.width)||!Number.isFinite(e.anchor.height)||e.anchor.width<=0||e.anchor.height<=0||e.anchor.width>1e5||e.anchor.height>1e5||!Number.isInteger(e.width)||e.width<160||e.width>640||!Number.isInteger(e.height)||e.height<48||e.height>480||e.side!==void 0&&!eo.includes(e.side)||e.focus!==void 0&&e.focus!==!0&&e.focus!==!1||!to(e.data)||!Ze(e.data))return!1;return JSON.stringify(e.data).length<=16000}catch{return!1}};var so=["file","directory","other","missing"],ot=(e)=>Boolean(e&&"sessionId"in e),st=(e)=>Boolean(e&&"sent"in e&&!("sessionId"in e));var ro=/^[0-9a-f]{7,64}$/i,rt=(e)=>ro.test(e),Ae=500,Re=32000,no=16000,io=128,ao=200,lo=2000,co=16000,po=80,uo=200,So=16000;var go=2000;var Ge=8000000,nt=4194304,it=20000,Ce=1024,Oe=2000000;var Pe=64000,we=8000,at=4000;var lt=960000;var mo=999,Eo=1e4,ue=500,fo=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","REQUEST_FAILED","RESPONSE_TOO_LARGE","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED","UNSUPPORTED"],yo=["stopped","starting","ready","failed"],Fo=new Set(fo),ho=(e)=>Fo.has(e),xo=(e)=>e&&ho(e)?e:"HOST_REJECTED",Z=(e)=>{if(e===void 0)return!1;if(e===null||e===!0||e===!1)return!0;if(String(e)===e)return!0;if(Number(e)===e)return Number.isFinite(e);if(Array.isArray(e))return e.every(Z);if(Object(e)===e)return Object.values(e).every(Z);return!1},bo=(e)=>Z(e)&&JSON.stringify(e).length<=So,oo=(e)=>e?.trim().slice(0,uo)??"",ee=(e)=>{let s=e.id.trim().slice(0,io),r=e.title.trim().slice(0,ao),l=e.url.trim().slice(0,lo),c=e.text?.trim().slice(0,co),m=e.author?.trim().slice(0,po),y=e.kind==="pull"?"pull":"issue",E={providerId:e.providerId.trim(),id:s,title:r||s,url:l,kind:y};if(c)E.text=c;if(m)E.author=m;if(y==="pull"){let G=oo(e.branches?.head),M=oo(e.branches?.base);if(G&&M)E.branches={head:G,base:M}}if(bo(e.data))E.data=e.data;return E},ct=(e)=>{let s=ee(e);if(e.projectId)s.projectId=e.projectId;if(e.navigation)s.navigation=e.navigation;if(e.worktree)s.worktree=e.worktree;return s},pt=(e)=>{let s={text:e.text.trim().slice(0,no)};if(e.send)s.send=!0;return s},ut=(e)=>{if(e===null||!Number.isFinite(e))return null;return Math.min(mo,Math.max(0,Math.round(e)))},dt=(e)=>{if(!Number.isFinite(e))return 0;return Math.min(Eo,Math.max(0,Math.ceil(e)))};var te=(e)=>e.length>0&&e.length<=Ce&&!e.includes("\x00")&&!e.includes("\\");var de=(e)=>{if(!e.startsWith("/")||e.includes("\x00")||e.includes("\\")||e.includes("://"))return!1;if(e.length>go)return!1;return!e.split("/").some((r)=>r==="."||r==="..")},Bo=new Set(yo),St=(e)=>Boolean(e&&"status"in e&&Bo.has(String(e.status))&&!("body"in e)),Se=(e)=>Boolean(e&&"status"in e&&"body"in e&&Number.isInteger(e.status)),gt=(e)=>Boolean(e&&"content"in e&&String(e.content)===e.content),mt=(e)=>Boolean(e&&"written"in e&&e.written===!0),Et=(e)=>Boolean(e&&"entries"in e&&Array.isArray(e.entries)),Do=new Set(so),ft=(e)=>Boolean(e&&"kind"in e&&"size"in e&&Do.has(String(e.kind))&&Number.isFinite(e.size)),yt=(e)=>Boolean(e&&"text"in e&&String(e.text)===e.text&&!("status"in e)),$o=new Set(["workspace","shells","ready","directory","session","connection","settings","session-lifecycle","item","resolve","action","status-control-event","popover-closed","file-open","file-snapshot","file-saved"]),Xo=(e)=>Object(e)===e?e:null,tt=(e)=>String(e)===e&&e.length>0,Vo=(e)=>{if(!tt(e.id))return null;if(e.ok===!0){let s={channel:S,v:g,type:"result",id:e.id,ok:!0};if(Object(e.payload)===e.payload)s.payload=e.payload;return s}if(e.ok===!1&&tt(e.error))return{channel:S,v:g,type:"result",id:e.id,ok:!1,error:e.error,code:xo(tt(e.code)?e.code:void 0)};return null},ht=(e)=>{let s=Xo(e);if(!s||s.channel!==S||s.v!==g)return null;if(s.type==="result")return Vo(s);if(!$o.has(String(s.type))||Object(s.payload)!==s.payload)return null;return s};var To=(e)=>("key"in e)&&("metaKey"in e)&&("ctrlKey"in e),qo=(e)=>(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="s";class a extends Error{code;constructor(e,s){super(s);this.name="HostRequestError",this.code=e}}var xt=()=>Promise.reject(new a("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),Me=()=>Promise.reject(new a("BAD_PATH",`File path must be 1 to ${Ce} characters without NUL or backslash.`)),Ie=(e)=>{if(e===void 0)return;if(Object(e)!==e||Array.isArray(e)||e.scope!==void 0&&e.scope!=="instance"&&e.scope!=="device")throw new a("HOST_REJECTED",'Storage scope must be "instance" or "device".');return e.scope==="device"?"device":void 0},d=(e)=>(e.value+=1,`oc-${e.value}`),bt=(e={})=>{let s=e.target??("window"in globalThis?window:null);if(!s)throw new a("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let r=e.acceptSource??((t)=>t===s.parent),l=e.requestTimeoutMs??it,c=new Set,m=new Set,y=new Set,E=new Set,G=new Set,M=new Set,re=new Set,ge=new Set,me=new Set,ne=null,ie=null,Ee=new Set,fe=new Set,ae=null,le=null,Xe=!1,J=new Map,Y=new Map,Q=new Map,N=!1,u={value:0},p=null,F=null,ce=!1,pe=!1,Lt=null,Ht=(t)=>{if(!t)return null;return{sessionId:t.id,phase:t.busy?"started":"completed"}},U=(t)=>{s.parent.postMessage(t,"*")},R=(t,o)=>{for(let i of t)try{i(o)}catch(n){console.error(n)}},Nt=(t)=>{if(!(t instanceof MessageEvent))return;if(!r(t.source))return;let o=ht(t.data);if(!o)return;if(o.type==="workspace"){let n=Y.get(o.payload.subscriptionId);if(n)R([n],o.payload.snapshot);return}if(o.type==="shells"){let n=Q.get(o.payload.subscriptionId);if(n)R([n],o.payload.snapshot);return}if(o.type==="ready"){let n=o.payload;if(p=n,F=Ht(n.session),R(c,n),R(m,n.directory),R(y,n.session),F)R(E,F);R(G,n.connection),R(M,n.settings),R(re,n.item);return}if(o.type==="directory"){if(p)p={...p,directory:o.payload.directory};R(m,o.payload.directory);return}if(o.type==="session"){if(p)p={...p,session:o.payload.session};if(!o.payload.session)F=null;else if(F?.sessionId!==o.payload.session.id)F=Ht(o.payload.session);R(y,o.payload.session);return}if(o.type==="session-lifecycle"){F=o.payload,R(E,o.payload);return}if(o.type==="connection"){if(p)p={...p,connection:o.payload.connection};R(G,o.payload.connection);return}if(o.type==="settings"){if(p)p={...p,settings:o.payload.settings};R(M,o.payload.settings);return}if(o.type==="item"){if(p)p={...p,item:o.payload.item};R(re,o.payload.item);return}if(o.type==="status-control-event"){R(ge,o.payload);return}if(o.type==="popover-closed"){R(me,o.payload);return}if(o.type==="action"){let n=(f)=>{if(!N)U({channel:S,v:g,type:"action-result",id:o.id,payload:f})},h=ie;if(!h){n({ok:!1,error:"This extension does not handle background actions."});return}Promise.resolve().then(()=>h(o.payload)).then(()=>n({ok:!0}),(f)=>{let k=(f instanceof Error?f.message:String(f)).trim();n({ok:!1,error:(k||"Action failed.").slice(0,ue)})});return}if(o.type==="file-open"){let n=o.payload;if(le&&Qt(le,n))return;le=n,R(Ee,o.payload);return}if(o.type==="file-saved"){R(fe,o.payload.version);return}if(o.type==="file-snapshot"){let n=(k)=>{if(!N)U({channel:S,v:g,type:"file-snapshot-result",id:o.id,payload:k})},h=(k)=>n({error:(k.trim()||"Could not read the edited file.").slice(0,ue)}),f=ae;if(!f){h("This extension does not edit files.");return}Promise.resolve().then(()=>f(o.payload.purpose)).then((k)=>{if(Qe(k)>ve){h(`The file is over ${ve} ${"bytes"in k?"bytes":"characters"}.`);return}if(k.version.length>_e){h(`The snapshot version is over ${_e} characters.`);return}n({snapshot:"bytes"in k?{bytes:k.bytes,version:k.version}:{content:k.content,version:k.version}})},(k)=>h(k instanceof Error?k.message:String(k)));return}if(o.type==="resolve"){let n=(f)=>{U({channel:S,v:g,type:"resolve-result",id:o.id,payload:f})},h=ne;if(!h){n({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>h(o.payload)).then((f)=>n({item:f?ee(f):null}),(f)=>{let k=(f instanceof Error?f.message:String(f)).trim();n({error:(k||"Command failed.").slice(0,ue)})});return}let i=J.get(o.id);if(!i)return;if(clearTimeout(i.timer),J.delete(o.id),o.ok){i.resolve(o.payload);return}i.reject(new a(o.code,o.error))};s.addEventListener("message",Nt),U({channel:S,v:g,type:"hello"});let P=(t,o=l)=>{if(N||s.parent===s)return Promise.reject(new a("HOST_UNAVAILABLE","No host frame. This page is not in an iframe."));return new Promise((i,n)=>{let h=setTimeout(()=>{J.delete(t.id),n(new a("HOST_TIMEOUT","Host did not answer in time."))},o);J.set(t.id,{resolve:i,reject:n,timer:h}),U(t)})},v=(t)=>P(t).then(()=>{return}),_={channel:S,v:g},Ve=(t)=>{if(!N&&s.parent!==s)U(t)},Ft=()=>Ve({..._,type:"file-save"}),Bt=(t)=>{if(!To(t)||!qo(t))return;t.preventDefault(),Ft()},Dt=(t)=>{if(!To(t)||t.key!=="Escape"||p?.surface!=="popover"||!p.popover)return;t.preventDefault(),qt(p.popover.id,"escape").catch(()=>{return})},ye=()=>{let t=p?.surface==="popover"?p.popover:void 0;if(!t)return;let o=ce||pe;if(Lt===o)return;Lt=o,Wt(t.id,o).catch(()=>{return})},he=()=>{if(p?.surface!=="popover"||ce)return;ce=!0,ye()},$t=(t)=>{if(p?.surface!=="popover"||t.relatedTarget!==null||!ce)return;ce=!1,ye()},Xt=()=>{if(p?.surface!=="popover"||pe)return;pe=!0,ye()},Vt=()=>{if(p?.surface!=="popover"||!pe)return;pe=!1,ye()},H=(t,o=1024)=>{if(!t.trim()||t.length>o)throw new a("HOST_REJECTED",`Identity must contain 1 to ${o} characters.`)},qe=async(t)=>{if(t.kind!=="projects")H(t.projectId);let o=await P({..._,type:"workspace-read",id:d(u),payload:t});if(!o||!("kind"in o)||!("state"in o)||o.kind!==t.kind)throw new a("HOST_REJECTED","Host did not return workspace data.");return o},We=async(t,o)=>{if(t.kind!=="projects")H(t.projectId);let i=d(u);Y.set(i,o);try{await v({..._,type:"workspace-subscribe",id:d(u),payload:{subscriptionId:i,query:t}})}catch(n){if(Y.delete(i),!N)U({..._,type:"workspace-unsubscribe",id:d(u),payload:{subscriptionId:i}});throw n}return()=>{if(!Y.delete(i)||N)return;U({..._,type:"workspace-unsubscribe",id:d(u),payload:{subscriptionId:i}})}},Ho=async(t,o)=>{if(t.kind==="session")H(t.sessionId);if(t.kind==="project")H(t.projectId);let i=d(u);Q.set(i,o);try{await v({..._,type:"shells-subscribe",id:d(u),payload:{subscriptionId:i,scope:t}})}catch(n){if(Q.delete(i),!N)U({..._,type:"shells-unsubscribe",id:d(u),payload:{subscriptionId:i}});throw n}return()=>{if(!Q.delete(i)||N)return;U({..._,type:"shells-unsubscribe",id:d(u),payload:{subscriptionId:i}})}},xe=async(t)=>{if("key"in t&&(t.key.length===0||t.key.length>Ke))throw new a("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(t.op==="set"&&!Z(t.value))throw new a("HOST_REJECTED","Storage values must be JSON.");if(t.op==="set"&&new TextEncoder().encode(JSON.stringify(t.value)).length>Je)throw new a("HOST_REJECTED","Storage value exceeds 64 KiB.");if(t.scope==="device"&&p?.features?.deviceStorage!==!0)throw new a("UNSUPPORTED","This host does not support device storage.");let o=await P({..._,type:"storage",id:d(u),payload:t});if(!o||!("storage"in o)||o.op!==t.op)throw new a("HOST_REJECTED","Host did not return storage data.");return o},qt=(t,o)=>p?.features?.popovers!==!0&&!(p?.surface==="popover"&&p.popover?.id===t)?Promise.reject(new a("UNSUPPORTED","This host does not support popovers.")):v({..._,type:"popover-close",id:d(u),payload:o?{id:t,reason:o}:{id:t}}),Wt=(t,o)=>p?.features?.popovers!==!0&&!(p?.surface==="popover"&&p.popover?.id===t)?Promise.reject(new a("UNSUPPORTED","This host does not support popovers.")):v({..._,type:"popover-anchor",id:d(u),payload:{id:t,active:o}});return s.addEventListener("keydown",Dt,!0),s.addEventListener("pointerover",he),s.addEventListener("pointermove",he),s.addEventListener("pointerout",$t),s.addEventListener("focus",Xt),s.addEventListener("blur",Vt),{onAction:(t)=>(ie=t,()=>{if(ie===t)ie=null}),listProjects:async()=>{let t=await qe({kind:"projects"});if(t.kind!=="projects")throw new a("HOST_REJECTED","Expected projects.");return t},listWorktrees:async(t)=>{let o=await qe({kind:"worktrees",projectId:t});if(o.kind!=="worktrees")throw new a("HOST_REJECTED","Expected worktrees.");return o},listSessions:async(t)=>{let o=await qe({kind:"sessions",projectId:t});if(o.kind!=="sessions")throw new a("HOST_REJECTED","Expected sessions.");return o},onProjects:(t)=>We({kind:"projects"},(o)=>{if(o.kind==="projects")t(o)}),onWorktrees:(t,o)=>We({kind:"worktrees",projectId:t},(i)=>{if(i.kind==="worktrees")o(i)}),onSessions:(t,o)=>We({kind:"sessions",projectId:t},(i)=>{if(i.kind==="sessions")o(i)}),onRunningShells:(t,o)=>Ho(t,o),readShellOutput:async(t,o)=>{H(t,be);let i=o?.cursor;if(i!==void 0&&(!Number.isInteger(i)||i<0))throw new a("HOST_REJECTED","Shell output cursor must be a non-negative integer.");let n=o?.tailBytes;if(n!==void 0&&(!Number.isInteger(n)||n<1||n>Te))throw new a("HOST_REJECTED",`Shell output tailBytes must be an integer between 1 and ${Te}.`);let f=await P({..._,type:"shell-output",id:d(u),payload:{shellId:t,cursor:i,tailBytes:n}});if(!f||typeof f.output!=="string"||!Number.isFinite(f.cursor))throw new a("HOST_REJECTED","Host did not return shell output.");return f},stopShell:async(t)=>{if(H(t,be),(await P({..._,type:"shell-stop",id:d(u),payload:{shellId:t}}))?.stopped!==!0)throw new a("HOST_REJECTED","Host did not stop the shell.");return{stopped:!0}},openSession:async(t)=>{H(t),await v({..._,type:"open-session",id:d(u),payload:{sessionId:t}})},storage:{get:async(t,o)=>{let i=Ie(o),n={op:"get",key:t};if(i)n.scope=i;let h=await xe(n);return h.op==="get"&&h.found?h.value:void 0},set:async(t,o,i)=>{let n=Ie(i),h={op:"set",key:t,value:o};if(n)h.scope=n;await xe(h)},delete:async(t,o)=>{let i=Ie(o),n={op:"delete",key:t};if(i)n.scope=i;await xe(n)},keys:async(t)=>{let o=Ie(t),i={op:"keys"};if(o)i.scope=o;let n=await xe(i);if(n.op!=="keys")throw new a("HOST_REJECTED","Expected storage keys.");return n.keys}},onReady:(t)=>{if(c.add(t),p)t(p);return()=>{c.delete(t)}},onDirectory:(t)=>{if(m.add(t),p)t(p.directory);return()=>{m.delete(t)}},onSession:(t)=>{if(y.add(t),p)t(p.session);return()=>{y.delete(t)}},onSessionLifecycle:(t)=>{if(E.add(t),F)t(F);return()=>{E.delete(t)}},onConnection:(t)=>{if(G.add(t),p)t(p.connection);return()=>{G.delete(t)}},onSettings:(t)=>{if(M.add(t),p)t(p.settings);return()=>{M.delete(t)}},onItem:(t)=>{if(re.add(t),p)t(p.item);return()=>{re.delete(t)}},onStatusControl:(t)=>(ge.add(t),()=>{ge.delete(t)}),onPopoverClosed:(t)=>(me.add(t),()=>{me.delete(t)}),setStatusControls:(t)=>{if(p?.features?.statusControls!==!0)return Promise.reject(new a("UNSUPPORTED","This host does not support status controls."));if(!Yt(t))return Promise.reject(new a("HOST_REJECTED","Status controls must have unique bounded ids and valid selected options."));return v({..._,type:"status-controls",id:d(u),payload:{controls:t}})},openPopover:(t)=>{if(p?.features?.popovers!==!0)return Promise.reject(new a("UNSUPPORTED","This host does not support popovers."));if(!et(t))return Promise.reject(new a("HOST_REJECTED","Popover requests need bounded geometry and JSON data."));return v({..._,type:"popover-open",id:d(u),payload:t})},closePopover:qt,setPopoverAnchorActive:Wt,onResolve:(t)=>(ne=t,()=>{if(ne===t)ne=null}),toast:(t)=>{let o=t.message.trim();if(!o||o.length>Ae)return Promise.reject(new a("HOST_REJECTED",`Toast message must contain 1 to ${Ae} characters.`));if(t.copy&&t.copy!==!0&&(!t.copy.text.length||t.copy.text.length>Re))return Promise.reject(new a("HOST_REJECTED",`Toast copy text must contain 1 to ${Re} characters.`));return v({channel:S,v:g,type:"toast",id:d(u),payload:{...t,message:o}})},openUrl:(t)=>v({channel:S,v:g,type:"open-url",id:d(u),payload:{url:t}}),openCommit:(t)=>rt(t)?v({channel:S,v:g,type:"open-commit",id:d(u),payload:{sha:t}}):Promise.reject(new a("HOST_REJECTED","Commit id must be 7 to 64 hex characters.")),openSurface:(t)=>v({channel:S,v:g,type:"open-surface",id:d(u),payload:{surfaceId:t}}),writeClipboard:(t)=>v({channel:S,v:g,type:"clipboard-write",id:d(u),payload:{text:t}}),compose:(t)=>v({channel:S,v:g,type:"compose",id:d(u),payload:t}),attach:(t)=>v({channel:S,v:g,type:"attach",id:d(u),payload:ee(t)}),startSession:async(t)=>{if(t.projectId!==void 0)H(t.projectId);let o=t.worktree;if(o&&o!==!0)if(o.kind==="existing")H(o.directory);else{if(o.name!==void 0)H(o.name,200);if(o.baseBranch!==void 0)H(o.baseBranch,200)}let i=await P({channel:S,v:g,type:"start-session",id:d(u),payload:ct(t)},e.requestTimeoutMs??180000);if(!ot(i))throw new a("HOST_REJECTED","Host did not return a session.");return i},prompt:(t)=>P({channel:S,v:g,type:"prompt",id:d(u),payload:pt(t)}).then((o)=>{if(!st(o))throw new a("HOST_REJECTED","Host did not return a prompt result.");return o}),sessionLink:(t)=>v({channel:S,v:g,type:"session-link",id:d(u),payload:ee(t)}),close:()=>v({channel:S,v:g,type:"close",id:d(u)}),oauthStart:()=>v({channel:S,v:g,type:"oauth-start",id:d(u)}),oauthDisconnect:()=>v({channel:S,v:g,type:"oauth-disconnect",id:d(u)}),request:(t)=>(de(t.path)?P({channel:S,v:g,type:"request",id:d(u),payload:t}):xt()).then((o)=>{if(!Se(o))throw new a("HOST_REJECTED","Host request result was empty.");if(o.body.length>Ge)throw new a("HOST_REJECTED","Host request result was too large.");return o}),openCodeRequest:(t)=>(de(t.path)?P({channel:S,v:g,type:"opencode-request",id:d(u),payload:t}):xt()).then((o)=>{if(!Se(o))throw new a("HOST_REJECTED","Host OpenCode request result was empty.");if(o.body.length>nt)throw new a("HOST_REJECTED","Host OpenCode request result was too large.");return o}),serviceRequest:(t)=>(de(t.path)?P({channel:S,v:g,type:"service-request",id:d(u),payload:t}):xt()).then((o)=>{if(!Se(o))throw new a("HOST_REJECTED","Host service request result was empty.");if(o.body.length>Ge)throw new a("HOST_REJECTED","Host service request result was too large.");return o}),serviceStatus:()=>P({channel:S,v:g,type:"service-status",id:d(u)}).then((t)=>{if(!St(t))throw new a("HOST_REJECTED","Host did not return service status.");return t}),readFile:(t)=>(te(t)?P({channel:S,v:g,type:"file-read",id:d(u),payload:{path:t}}):Me()).then((o)=>{if(!gt(o))throw new a("HOST_REJECTED","Host did not return file content.");return o}),writeFile:(t,o)=>{if(!te(t))return Me();if(o.length>Oe)return Promise.reject(new a("FILE_TOO_LARGE",`Content is over ${Oe} characters.`));return P({channel:S,v:g,type:"file-write",id:d(u),payload:{path:t,content:o}}).then((i)=>{if(!mt(i))throw new a("HOST_REJECTED","Host did not confirm the write.");return i})},listDir:(t)=>(te(t)?P({channel:S,v:g,type:"file-list",id:d(u),payload:{path:t}}):Me()).then((o)=>{if(!Et(o))throw new a("HOST_REJECTED","Host did not return directory entries.");return o}),stat:(t)=>(te(t)?P({channel:S,v:g,type:"file-stat",id:d(u),payload:{path:t}}):Me()).then((o)=>{if(!ft(o))throw new a("HOST_REJECTED","Host did not return file status.");return o}),generate:(t)=>{let o=t.prompt.trim(),i=t.system?.trim();if(o.length===0||o.length>Pe)return Promise.reject(new a("HOST_REJECTED",`Prompt must be 1 to ${Pe} characters.`));if(i!==void 0&&(i.length===0||i.length>we))return Promise.reject(new a("HOST_REJECTED",`System prompt must be 1 to ${we} characters.`));let n=t.maxOutputTokens===void 0?void 0:Math.min(at,Math.max(1,Math.floor(t.maxOutputTokens)));if(n!==void 0&&!Number.isFinite(n))return Promise.reject(new a("HOST_REJECTED","maxOutputTokens must be a number."));let h={prompt:o};if(i!==void 0)h.system=i;if(n!==void 0)h.maxOutputTokens=n;return P({channel:S,v:g,type:"generate",id:d(u),payload:h},e.requestTimeoutMs??lt).then((f)=>{if(!yt(f))throw new a("HOST_REJECTED","Host did not return generated text.");return f})},setBadge:(t)=>v({channel:S,v:g,type:"badge",id:d(u),payload:{count:ut(t)}}),setHeight:(t)=>v({channel:S,v:g,type:"resize",id:d(u),payload:{height:dt(t)}}),onFileOpen:(t)=>{if(Ee.add(t),!Xe)Xe=!0,s.addEventListener("keydown",Bt,!0);if(le)t(le);return()=>{Ee.delete(t)}},onFileSnapshot:(t)=>(ae=t,()=>{if(ae===t)ae=null}),onFileSaved:(t)=>(fe.add(t),()=>{fe.delete(t)}),reportFileChange:(t)=>Ve({..._,type:"file-change",payload:{dirty:t.dirty,edited:t.edited}}),requestFileSave:Ft,reportFileUnsupported:()=>Ve({..._,type:"file-unsupported"}),dispose:()=>{for(let t of Y.keys())U({..._,type:"workspace-unsubscribe",id:d(u),payload:{subscriptionId:t}});Y.clear();for(let t of Q.keys())U({..._,type:"shells-unsubscribe",id:d(u),payload:{subscriptionId:t}});if(Q.clear(),N=!0,ne=null,ie=null,ae=null,Ee.clear(),fe.clear(),Xe)s.removeEventListener("keydown",Bt,!0);s.removeEventListener("message",Nt),s.removeEventListener("keydown",Dt,!0),s.removeEventListener("pointerover",he),s.removeEventListener("pointermove",he),s.removeEventListener("pointerout",$t),s.removeEventListener("focus",Xt),s.removeEventListener("blur",Vt);for(let t of J.values())clearTimeout(t.timer),t.reject(new a("HOST_UNAVAILABLE","Host client was disposed."));J.clear(),c.clear(),m.clear(),y.clear(),E.clear(),G.clear(),M.clear(),re.clear(),ge.clear(),me.clear()}}};var vo=["browser.open","browser.snapshot","browser.click","browser.type","browser.scroll","browser.back","browser.forward","browser.inspect","browser.capture","browser.resize","browser.close"];var ks=new Set(vo);var _o=["none","agent","user"];var Rs=new Set(_o);var Wo=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],zo=[["--oc-syntax-keyword","--syntax-keyword","syntaxKeyword"],["--oc-syntax-string","--syntax-string","syntaxString"],["--oc-syntax-number","--syntax-number","syntaxNumber"],["--oc-syntax-function","--syntax-function","syntaxFunction"],["--oc-syntax-type","--syntax-type","syntaxType"],["--oc-syntax-comment","--syntax-comment","syntaxComment"],["--oc-syntax-variable","--syntax-variable","syntaxVariable"],["--oc-syntax-operator","--syntax-operator","syntaxOperator"]],ko=(e,s)=>{s.style.colorScheme=e.mode;for(let[r,l]of Wo)s.style.setProperty(r,e.tokens[l]);for(let[r,l,c]of zo){let m=e.tokens[c]??"";s.style.setProperty(r,m),s.style.setProperty(l,m)}s.style.setProperty("font-family",e.tokens.font),s.style.setProperty("font-size","0.875rem"),s.style.setProperty("line-height","1.45"),s.style.setProperty("color",e.tokens.foreground)},Tt=(e,s)=>{if(ko(e.theme,s),s.dataset)s.dataset.ocSurface=e.surface,s.dataset.ocTheme=e.theme.mode};var jo={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},b=(e,s)=>`var(--${e}, var(--oc-${jo[e]}, ${s}))`,D=b("surface-background","transparent"),Le=b("surface-elevated","transparent"),oe=b("surface-elevated-foreground","inherit"),L=b("surface-foreground","inherit"),x=b("surface-muted-foreground","gray"),Ko=b("surface-muted","transparent"),X=b("interactive-border","currentColor"),w=b("interactive-hover","transparent"),z=b("interactive-active","transparent"),vt=b("interactive-selection","transparent"),_t=b("interactive-selection-foreground","inherit"),B=b("primary","currentColor"),kt=b("primary-text","inherit"),At=b("error-text","inherit"),Jo=b("font-sans","inherit"),Rt=b("font-mono","monospace"),Oo=b("radius","9px"),Gt=`calc(${Oo} - 2px)`,Ao=`calc(${Oo} - 4px)`,T=(e,s,r="transparent")=>`color-mix(in srgb, ${e} ${s}%, ${r})`,Ro=`background-image: linear-gradient(${w}, ${w});`,Ct=(e)=>`box-shadow: inset 0 0 0 1px ${e}, var(--oc-sdk-field-lift);`,Ot="box-shadow: inset 0 0 0 1px var(--oc-sdk-edge), var(--oc-sdk-raised-lift);",Go="box-shadow: var(--oc-sdk-lit);",Co=`inset 0 1px 0 0 ${T(L,1.5)}, 0 1px 1px 0 rgb(0 0 0 / 0.28), 0 2px 3px -2px rgb(0 0 0 / 0.2)`,Yo=`
:root {
  --oc-sdk-edge: ${T(L,10)};
  --oc-sdk-field-bg: ${Le};
  --oc-sdk-raised-bg: ${D};
  --oc-sdk-field-lift: inset 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --oc-sdk-raised-lift: 0 1px 2px 0 rgb(0 0 0 / 0.06);
  --oc-sdk-lit: inset 0 1px 0 0 rgb(255 255 255 / 0.45), 0 1px 2px 0 rgb(0 0 0 / 0.08);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.8), inset 0 0 0 1px rgb(0 0 0 / 0.04), 0 0 0 1px rgb(0 0 0 / 0.1), 0 1px 2px -0.5px rgb(0 0 0 / 0.08), 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 12px 20px -4px rgb(0 0 0 / 0.08);
}
:root[data-oc-theme="dark"] {
  --oc-sdk-edge: ${T(L,6)};
  --oc-sdk-field-bg: ${T(D,50,Le)};
  --oc-sdk-raised-bg: ${Le};
  --oc-sdk-field-lift: ${Co};
  --oc-sdk-raised-lift: ${Co};
  --oc-sdk-lit: inset 0 1px 0 0 ${T(L,1.5)}, 0 1px 1px 0 rgb(0 0 0 / 0.28), 0 2px 3px -2px rgb(0 0 0 / 0.2);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.06), inset 0 0 0 1px rgb(255 255 255 / 0.08), 0 0 0 1px rgb(0 0 0 / 0.36), 0 1px 1px -0.5px rgb(0 0 0 / 0.22), 0 3px 3px -1.5px rgb(0 0 0 / 0.2), 0 6px 6px -3px rgb(0 0 0 / 0.16);
}`,Ue=(e)=>{let s=b(`status-${e}`,"currentColor");return`
.oc-sdk[data-tone="${e}"], .oc-sdk [data-tone="${e}"] { --oc-sdk-tone: ${s}; --oc-sdk-tone-text: ${b(`${e}-text`,"inherit")}; }`},Qo=`
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
`,Po=`${Yo}
.oc-sdk { color: ${L}; font-family: ${Jo}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${Ro} }
.oc-sdk-mono { font-family: ${Rt}; }
.oc-sdk-muted { color: ${x}; }
${Ue("success")}${Ue("warning")}${Ue("error")}${Ue("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${B}; --oc-sdk-tone-text: ${kt}; }

.oc-sdk-btn { border-radius: ${Gt}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${Ao}; }
.oc-sdk-btn[data-variant="default"] { color: ${kt}; background: ${T(B,10,D)}; border-color: ${T(B,12)}; ${Go} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${T(B,16,D)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${T(B,22,D)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${Ko}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${w}, ${w}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${z}, ${z}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${oe}; border-color: transparent; ${Ot} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${w}, ${w}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${z}, ${z}); box-shadow: inset 0 0 0 1px var(--oc-sdk-edge); }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${w}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${z}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${b("status-error","red")}; color: ${At}; background: ${T("var(--oc-sdk-tone)",7,D)}; border-color: ${T("var(--oc-sdk-tone)",12)}; ${Go} }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${T("var(--oc-sdk-tone)",9,D)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${T("var(--oc-sdk-tone)",11,D)}; box-shadow: none; }

.oc-sdk-field-note { color: ${x}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${At}; }
.oc-sdk-input { border-radius: ${Gt}; background: var(--oc-sdk-field-bg); color: ${oe}; ${Ct("var(--oc-sdk-edge)")} transition: background 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${x}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${w}, ${w}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { ${Ct(T(L,26))} }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input, .oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { ${Ct(b("status-error","red"))} }
.oc-sdk-input[data-mono="true"] { font-family: ${Rt}; }

.oc-sdk-search-icon { color: ${x}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${B}; }
.oc-sdk-search-clear { border-radius: ${Ao}; color: ${x}; }
.oc-sdk-search-clear:hover { background: ${w}; color: ${L}; }

.oc-sdk-trigger { border-color: transparent; border-radius: ${Gt}; background: var(--oc-sdk-raised-bg); color: ${oe}; ${Ot} transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${w}, ${w}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${z}, ${z}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${x}; }
.oc-sdk-trigger-chevron { color: ${x}; }
/* The app's dropdown light: lit top, hairline rings and a layered shadow, no border. */
.oc-sdk-popup { --surface-foreground: ${oe}; border-color: transparent; border-radius: 12px; background: ${Le}; color: ${oe}; box-shadow: var(--oc-sdk-float); }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${w}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${vt}; color: ${_t}; }
.oc-sdk-option-check { color: ${L}; }
.oc-sdk-option[data-destructive="true"] { color: ${At}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${T(b("status-error","red"),10)}; }
.oc-sdk-option-hint { color: ${x}; }
.oc-sdk-popup-empty { color: ${x}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${X}; border-radius: 4px; color: ${L}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${T(L,60,X)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${X}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${D}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${B}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(16px); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${Ro} }
.oc-sdk-check-desc { color: ${x}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${T(L,4)}; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.16); }
.oc-sdk-tab { border-radius: 8px; color: ${x}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${L}; }
.oc-sdk-tab[aria-selected="true"] { color: ${_t}; background: ${vt}; border-color: ${X}; }
.oc-sdk-tabs[data-track="true"] .oc-sdk-tab[aria-selected="true"] { color: ${oe}; background: var(--oc-sdk-raised-bg); border-color: transparent; ${Ot} }
.oc-sdk-tab-count { color: ${x}; }

.oc-sdk-badge { border-radius: 9999px; background: ${w}; color: ${x}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${T("var(--oc-sdk-tone)",15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${w}; }
.oc-sdk-row[aria-selected="true"] { background: ${vt}; color: ${_t}; }
.oc-sdk-row-lead { font-family: ${Rt}; color: ${x}; }
.oc-sdk-row-sub { color: ${x}; }
.oc-sdk-row-meta { color: ${x}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${x}; }

.oc-sdk-empty-body { color: ${x}; }

.oc-sdk-spinner { color: ${x}; }
.oc-sdk-spinner-ring { border-color: ${X}; border-top-color: ${B}; border-radius: 9999px; }

/* Set apart by its tint alone, like the app's banners. */
.oc-sdk-banner { border-color: transparent; border-radius: 8px; background: ${T("var(--oc-sdk-tone)",10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${x}; }

.oc-sdk-separator { color: ${x}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${T(X,40)}; }

.oc-sdk-progress-label { color: ${x}; }
.oc-sdk-progress-track { border-radius: 9999px; background: ${X}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${B}); }

.oc-sdk-text a { color: ${kt}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${T(X,60)}; }
`,C=`
${ze}
${Qo}
${Po}`;var wo="oc-sdk-ui-style";var O=(e)=>{let s=document.getElementById(wo);if(s instanceof HTMLStyleElement){if(s.textContent!==e)s.textContent=e;return}je(document);let r=document.createElement("style");r.id=wo,r.textContent=e,document.head.appendChild(r)},A=(e,s)=>{let r=document.createElement(e);if(s)r.className=s;return r},V=(e)=>{let s=A("button",e);return s.type="button",s},I=(e,s)=>{let r=s??"";if(e.textContent!==r)e.textContent=r};var Zo=()=>{let e=document.createElement("span");return e.className="oc-sdk-spinner-ring",e.setAttribute("aria-hidden","true"),e},q=(e,s)=>{O(C);let r=s,l=V("oc-sdk oc-sdk-btn"),c=Zo(),m=document.createElement("span");l.append(m),e.append(l);let y=()=>{if(l.dataset.variant=r.variant??"default",l.dataset.size=r.size??"default",l.disabled=Boolean(r.disabled)||Boolean(r.loading),l.dataset.loading=r.loading?"true":"false",l.setAttribute("aria-busy",r.loading?"true":"false"),r.loading&&c.parentNode!==l)l.prepend(c);else if(!r.loading&&c.parentNode===l)c.remove();I(m,r.label)},E=()=>{if(r.disabled||r.loading)return;r.onClick()};return l.addEventListener("click",E),y(),{update:(G)=>{r={...r,...G},y()},dispose:()=>{l.removeEventListener("click",E),l.remove()}}};var wt=(e,s)=>{O(C);let r=s,l=A("div","oc-sdk oc-sdk-empty"),c=A("h2","oc-sdk-empty-title"),m=A("p","oc-sdk-empty-body"),y=A("div","oc-sdk-empty-action");l.append(c,m,y),e.append(l);let E=null,G=()=>{if(I(c,r.title),I(m,r.body),m.hidden=!r.body,y.hidden=!r.action,!r.action){E?.dispose(),E=null;return}let M={label:r.action.label,onClick:r.action.onClick};if(E)E.update(M);else E=q(y,{...M,variant:"outline",size:"sm"})};return G(),{update:(M)=>{r={...r,...M},G()},dispose:()=>{E?.dispose(),E=null,l.remove()}}};var rs=/^(\s*[-*+] )\[( |x|X)\] ?(.*)$/,Mo=(e)=>e.split(`
`).map((s)=>{let r=rs.exec(s);return r?{kind:"item",prefix:r[1]??"- ",done:r[2]!==" ",text:r[3]??""}:{kind:"text",text:s}}),Io=(e)=>e.map((s)=>s.kind==="text"?s.text:`${s.prefix}[${s.done?"x":" "}] ${s.text}`).join(`
`),De=(e)=>{let s=2166136261;for(let r=0;r<e.length;r+=1)s^=e.charCodeAt(r),s=Math.imul(s,16777619);return`${e.length}:${(s>>>0).toString(16)}`},Uo=(e,s)=>{let r=-1,l="- ";e.forEach((E,G)=>{if(E.kind!=="item")return;r=G,l=E.prefix});let c={kind:"item",prefix:l,done:!1,text:s};if(r>=0)return[...e.slice(0,r+1),c,...e.slice(r+1)];return[...e.at(-1)?.kind==="text"&&e.at(-1)?.text===""?e.slice(0,-1):[...e],c,{kind:"text",text:""}]};var K=bt(),j=document.querySelector("#root");if(!j)throw Error("Missing root");var Lo=document.createElement("style");Lo.textContent=`
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
`;document.head.append(Lo);K.onReady((e)=>Tt(e,document.documentElement));var W=[],se=!1,It=ke(null),Ut=()=>Io(W),$e=()=>{K.reportFileChange(It.observe(De(Ut())))},Mt=()=>{if(j.replaceChildren(),!W.some((s)=>s.kind==="item")&&se){wt(j,{title:"No items",body:"This checklist is empty."});return}if(W.forEach((s,r)=>{if(s.kind==="text"){let y=document.createElement("p");y.className="note",y.textContent=s.text,j.append(y);return}let l=document.createElement("div");l.className=s.done?"item done":"item";let c=document.createElement("input");c.type="checkbox",c.checked=s.done,c.disabled=se,c.addEventListener("change",()=>{s.done=c.checked,l.className=s.done?"item done":"item",$e()});let m=document.createElement("input");if(m.type="text",m.value=s.text,m.readOnly=se,m.setAttribute("aria-label","Item"),m.addEventListener("input",()=>{s.text=m.value,$e()}),l.append(c,m),!se){let y=document.createElement("span");y.className="remove",q(y,{label:"Remove",variant:"ghost",size:"xs",onClick:()=>{W=W.filter((E,G)=>G!==r),$e(),Mt()}}),l.append(y)}j.append(l)}),se)return;let e=document.createElement("div");e.className="actions",q(e,{label:"Add item",variant:"secondary",size:"sm",onClick:()=>{W=Uo(W,""),$e(),Mt();let s=j.querySelectorAll('.item input[type="text"]');s.item(s.length-1)?.focus()}}),j.append(e)};K.onFileOpen((e)=>{if(e.encoding!=="text"){K.reportFileUnsupported();return}W=Mo(e.content),se=e.readOnly,It=ke(De(Ut())),Mt()});K.onFileSnapshot(()=>{let e=Ut();return{content:e,version:De(e)}});K.onFileSaved((e)=>{K.reportFileChange({dirty:It.markSaved(e),edited:!1})});})();
