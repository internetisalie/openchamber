(()=>{var g="openchamber.sdk",_=1;var rt=`
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
`;function st(e){let r=e.documentElement;if(r.hasAttribute("data-oc-scrollbar-activity"))return;r.setAttribute("data-oc-scrollbar-activity","");let s=new WeakMap;e.addEventListener("scroll",(u)=>{let c=u.target===e?r:u.target;if(!(c instanceof Element))return;if(!c.hasAttribute("data-oc-scrolling"))c.setAttribute("data-oc-scrolling","");let E=s.get(c);if(E!==void 0)clearTimeout(E);s.set(c,setTimeout(()=>{s.delete(c),c.removeAttribute("data-oc-scrolling")},1000))},{capture:!0,passive:!0})}var or=`(${st.toString()})(document);`;var nt=128,it=65536;var ke=128;var Ie=65536;var at=8000,lt=192000,ut=120000;var lo=(e)=>{let r=[],s=0,u=0;return{push:(c)=>{r.push(c),u+=c.length;while(u-s>e&&r.length>1){let E=r.shift();u-=E?.length??0,s=0}},pull:(c)=>{let E=0;while(E<c.length&&r.length>0){let m=r[0],T=Math.min(c.length-E,m.length-s);if(c.set(m.subarray(s,s+T),E),E+=T,s+=T,s>=m.length)r.shift(),u-=m.length,s=0}c.fill(0,E)},clear:()=>{r.length=0,s=0,u=0},get size(){return u-s}}};var So=/^[a-z][a-z0-9-]{0,39}$/;var uo=(e)=>Object(e)===e&&!Array.isArray(e),ct=(e,r)=>Object.keys(e).every((s)=>r.includes(s)),co=(e)=>String(e)===e&&e.length>=1&&e.length<=60,po=(e)=>String(e)===e&&e.length>=1&&e.length<=80,Eo=(e)=>{if(!Array.isArray(e)||e.length>4)return!1;let r=new Set;for(let s of e){if(!uo(s)||!So.test(s.id)||!co(s.label))return!1;if(s.disabled!==void 0&&s.disabled!==!0&&s.disabled!==!1)return!1;if(r.has(s.id))return!1;if(r.add(s.id),s.kind==="button"){if(!ct(s,["kind","id","label","disabled"]))return!1;continue}if(s.kind!=="select"||!ct(s,["kind","id","label","value","options","disabled"]))return!1;if(!po(s.value)||!Array.isArray(s.options)||s.options.length<1||s.options.length>16)return!1;let u=new Set;for(let c of s.options){if(!uo(c)||!ct(c,["value","label"])||!po(c.value)||!co(c.label)||u.has(c.value))return!1;u.add(c.value)}if(!u.has(s.value))return!1}return!0};var go=["{id}","{segment}","{segments+}"];var Ur=new Set(go);var _o=["turn-finished","turn-failed","permission-asked","question-asked","turn-started","session-created","session-archived","session-deleted"];var Nr=new Set(_o);var Pe=20000000,Me=256;var pt=(e)=>("bytes"in e)?e.bytes.byteLength:e.content.length,To=(e,r)=>{if(e.path!==r.path||e.readOnly!==r.readOnly)return!1;if(e.encoding==="text"||r.encoding==="text")return e.encoding==="text"&&r.encoding==="text"&&e.content===r.content;if(e.bytes.byteLength!==r.bytes.byteLength)return!1;for(let s=0;s<e.bytes.byteLength;s+=1)if(e.bytes[s]!==r.bytes[s])return!1;return!0},Ge=(e)=>{let r=e,s=e;return{observe:(u)=>{let c=u!==s;return s=u,{edited:c,dirty:u!==r}},markSaved:(u)=>(r=u,s!==u)}};var mo=/^[A-Za-z0-9_-]{1,80}$/;var Ro=["left","right","top","bottom"];var ho=(e,r=0,s={remaining:16000})=>{if(--s.remaining<0||r>=32)return!1;if(e===null)return!0;let u=Array.isArray(e)?e:Object(e)===e?Object.values(e):[];for(let c of u)if(!ho(c,r+1,s))return!1;return!0},dt=(e)=>{if(e===null||e===!0||e===!1)return!0;if(Array.isArray(e))return Object.keys(e).every((r)=>/^(0|[1-9]\d*)$/.test(r)&&Number(r)<e.length)&&e.every(dt);if(Object(e)===e){let r=Object.getPrototypeOf(e);return(r===null||r===Object.prototype)&&Object.values(e).every(dt)}return String(e)===e||Number.isFinite(e)},St=(e)=>{try{if(String(e.id)!==e.id||!mo.test(e.id)||!Number.isFinite(e.anchor.x)||Math.abs(e.anchor.x)>1e5||!Number.isFinite(e.anchor.y)||Math.abs(e.anchor.y)>1e5||!Number.isFinite(e.anchor.width)||!Number.isFinite(e.anchor.height)||e.anchor.width<=0||e.anchor.height<=0||e.anchor.width>1e5||e.anchor.height>1e5||!Number.isInteger(e.width)||e.width<160||e.width>640||!Number.isInteger(e.height)||e.height<48||e.height>480||e.side!==void 0&&!Ro.includes(e.side)||e.focus!==void 0&&e.focus!==!0&&e.focus!==!1||!ho(e.data)||!dt(e.data))return!1;return JSON.stringify(e.data).length<=16000}catch{return!1}};var gt=2000;var yo=["file","directory","other","missing"],_t=(e)=>Boolean(e&&"sessionId"in e),Tt=(e)=>Boolean(e&&"sent"in e&&!("sessionId"in e));var bo=/^[0-9a-f]{7,64}$/i,mt=(e)=>bo.test(e),Ue=500,we=32000,vo=16000,Oo=128,Ao=200,xo=2000,Co=16000,ko=80,Io=200,Po=16000;var Mo=2000;var Ne=8000000,Rt=4194304,ht=20000,Le=1024,De=2000000;var He=64000,Fe=8000,ft=4000;var yt=960000;var Go=999,Uo=1e4,_e=500,wo=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","REQUEST_FAILED","RESPONSE_TOO_LARGE","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED","UNSUPPORTED"],No=["stopped","starting","ready","failed"],sr=new Set(wo),Lo=(e)=>sr.has(e),Do=(e)=>e&&Lo(e)?e:"HOST_REJECTED",se=(e)=>{if(e===void 0)return!1;if(e===null||e===!0||e===!1)return!0;if(String(e)===e)return!0;if(Number(e)===e)return Number.isFinite(e);if(Array.isArray(e))return e.every(se);if(Object(e)===e)return Object.values(e).every(se);return!1},Ho=(e)=>se(e)&&JSON.stringify(e).length<=Po,fo=(e)=>e?.trim().slice(0,Io)??"",ne=(e)=>{let r=e.id.trim().slice(0,Oo),s=e.title.trim().slice(0,Ao),u=e.url.trim().slice(0,xo),c=e.text?.trim().slice(0,Co),E=e.author?.trim().slice(0,ko),m=e.kind==="pull"?"pull":"issue",T={providerId:e.providerId.trim(),id:r,title:s||r,url:u,kind:m};if(c)T.text=c;if(E)T.author=E;if(m==="pull"){let k=fo(e.branches?.head),w=fo(e.branches?.base);if(k&&w)T.branches={head:k,base:w}}if(Ho(e.data))T.data=e.data;return T},bt=(e)=>{let r=ne(e);if(e.projectId)r.projectId=e.projectId;if(e.navigation)r.navigation=e.navigation;if(e.worktree)r.worktree=e.worktree;return r},vt=(e)=>{let r={text:e.text.trim().slice(0,vo)};if(e.send)r.send=!0;return r},Ot=(e)=>{if(e===null||!Number.isFinite(e))return null;return Math.min(Go,Math.max(0,Math.round(e)))},At=(e)=>{if(!Number.isFinite(e))return 0;return Math.min(Uo,Math.max(0,Math.ceil(e)))};var ie=(e)=>e.length>0&&e.length<=Le&&!e.includes("\x00")&&!e.includes("\\");var Te=(e)=>{if(!e.startsWith("/")||e.includes("\x00")||e.includes("\\")||e.includes("://"))return!1;if(e.length>Mo)return!1;return!e.split("/").some((s)=>s==="."||s==="..")},nr=new Set(No),xt=(e)=>Boolean(e&&"status"in e&&nr.has(String(e.status))&&!("body"in e)),me=(e)=>Boolean(e&&"status"in e&&"body"in e&&Number.isInteger(e.status)),Ct=(e)=>Boolean(e&&"content"in e&&String(e.content)===e.content),kt=(e)=>Boolean(e&&"written"in e&&e.written===!0),It=(e)=>Boolean(e&&"entries"in e&&Array.isArray(e.entries)),ir=new Set(yo),Pt=(e)=>Boolean(e&&"kind"in e&&"size"in e&&ir.has(String(e.kind))&&Number.isFinite(e.size)),Mt=(e)=>Boolean(e&&"text"in e&&String(e.text)===e.text&&!("status"in e)),ar=new Set(["workspace","shells","ready","directory","session","connection","settings","session-lifecycle","item","resolve","action","service-event","status-control-event","popover-closed","file-open","file-snapshot","file-saved","generate-late","microphone-audio","microphone-ended"]),lr=(e)=>Object(e)===e?e:null,Et=(e)=>String(e)===e&&e.length>0,ur=(e)=>{if(!Et(e.id))return null;if(e.ok===!0){let r={channel:g,v:_,type:"result",id:e.id,ok:!0};if(Object(e.payload)===e.payload)r.payload=e.payload;return r}if(e.ok===!1&&Et(e.error))return{channel:g,v:_,type:"result",id:e.id,ok:!1,error:e.error,code:Do(Et(e.code)?e.code:void 0)};return null},Gt=(e)=>{let r=lr(e);if(!r||r.channel!==g||r.v!==_)return null;if(r.type==="result")return ur(r);if(!ar.has(String(r.type))||Object(r.payload)!==r.payload)return null;return r};var Fo=(e)=>("key"in e)&&("metaKey"in e)&&("ctrlKey"in e),cr=(e)=>(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="s";class l extends Error{code;constructor(e,r){super(r);this.name="HostRequestError",this.code=e}}var Ut=()=>Promise.reject(new l("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),Be=()=>Promise.reject(new l("BAD_PATH",`File path must be 1 to ${Le} characters without NUL or backslash.`)),Ve=(e)=>{if(e===void 0)return;if(Object(e)!==e||Array.isArray(e)||e.scope!==void 0&&e.scope!=="instance"&&e.scope!=="device")throw new l("HOST_REJECTED",'Storage scope must be "instance" or "device".');return e.scope==="device"?"device":void 0},S=(e)=>(e.value+=1,`oc-${e.value}`),wt=(e={})=>{let r=e.target??("window"in globalThis?window:null);if(!r)throw new l("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let s=e.acceptSource??((t)=>t===r.parent),u=e.requestTimeoutMs??ht,c=new Set,E=new Set,m=new Set,T=new Set,k=new Set,w=new Set,ue=new Set,he=new Set,fe=new Set,ye=new Set,be=new Set,Z=new Set,Qe=[],ce=null,pe=null,ve=new Set,Oe=new Set,de=null,Se=null,Ye=!1,ee=new Map,te=new Map,oe=new Map,F=!1,d={value:0},p=null,V=null,Ee=!1,ge=!1,Jt=null,N=null,Qt=(t)=>{if(!t)return null;return{sessionId:t.id,phase:t.busy?"started":"completed"}},G=(t)=>{r.parent.postMessage(t,"*")},Yt=()=>{if(F||r.parent===r||Z.size===0||p?.features?.lateGenerateResults!==!0)return;G({channel:g,v:_,type:"generate-late-listen"})},f=(t,o)=>{for(let a of t)try{a(o)}catch(i){console.error(i)}},Zt=(t)=>{if(!(t instanceof MessageEvent))return;if(!s(t.source))return;let o=Gt(t.data);if(!o)return;if(o.type==="workspace"){let i=te.get(o.payload.subscriptionId);if(i)f([i],o.payload.snapshot);return}if(o.type==="shells"){let i=oe.get(o.payload.subscriptionId);if(i)f([i],o.payload.snapshot);return}if(o.type==="microphone-audio"){N?.queue.push(o.payload.samples);return}if(o.type==="microphone-ended"){let i=N;if(!i)return;N=null,i.release(),f(i.endedListeners,o.payload.reason);return}if(o.type==="ready"){let i=o.payload;if(p=i,V=Qt(i.session),f(c,i),f(E,i.directory),f(m,i.session),V)f(T,V);if(f(k,i.connection),f(w,i.settings),f(ue,i.item),i.block)f(he,i.block);Yt();return}if(o.type==="service-event"){f(fe,o.payload);return}if(o.type==="generate-late"){if(Z.size===0)Qe.push(o.payload);else f(Z,o.payload);return}if(o.type==="directory"){if(p)p={...p,directory:o.payload.directory};f(E,o.payload.directory);return}if(o.type==="session"){if(p)p={...p,session:o.payload.session};if(!o.payload.session)V=null;else if(V?.sessionId!==o.payload.session.id)V=Qt(o.payload.session);f(m,o.payload.session);return}if(o.type==="session-lifecycle"){V=o.payload,f(T,o.payload);return}if(o.type==="connection"){if(p)p={...p,connection:o.payload.connection};f(k,o.payload.connection);return}if(o.type==="settings"){if(p)p={...p,settings:o.payload.settings};f(w,o.payload.settings);return}if(o.type==="item"){if(p)p={...p,item:o.payload.item};f(ue,o.payload.item);return}if(o.type==="status-control-event"){f(ye,o.payload);return}if(o.type==="popover-closed"){f(be,o.payload);return}if(o.type==="action"){let i=(h)=>{if(!F)G({channel:g,v:_,type:"action-result",id:o.id,payload:h})},R=pe;if(!R){i({ok:!1,error:"This extension does not handle background actions."});return}Promise.resolve().then(()=>R(o.payload)).then(()=>i({ok:!0}),(h)=>{let y=(h instanceof Error?h.message:String(h)).trim();i({ok:!1,error:(y||"Action failed.").slice(0,_e)})});return}if(o.type==="file-open"){let i=o.payload;if(Se&&To(Se,i))return;Se=i,f(ve,o.payload);return}if(o.type==="file-saved"){f(Oe,o.payload.version);return}if(o.type==="file-snapshot"){let i=(y)=>{if(!F)G({channel:g,v:_,type:"file-snapshot-result",id:o.id,payload:y})},R=(y)=>i({error:(y.trim()||"Could not read the edited file.").slice(0,_e)}),h=de;if(!h){R("This extension does not edit files.");return}Promise.resolve().then(()=>h(o.payload.purpose)).then((y)=>{if(pt(y)>Pe){R(`The file is over ${Pe} ${"bytes"in y?"bytes":"characters"}.`);return}if(y.version.length>Me){R(`The snapshot version is over ${Me} characters.`);return}i({snapshot:"bytes"in y?{bytes:y.bytes,version:y.version}:{content:y.content,version:y.version}})},(y)=>R(y instanceof Error?y.message:String(y)));return}if(o.type==="resolve"){let i=(h)=>{G({channel:g,v:_,type:"resolve-result",id:o.id,payload:h})},R=ce;if(!R){i({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>R(o.payload)).then((h)=>i({item:h?ne(h):null}),(h)=>{let y=(h instanceof Error?h.message:String(h)).trim();i({error:(y||"Command failed.").slice(0,_e)})});return}let a=ee.get(o.id);if(!a)return;if(clearTimeout(a.timer),ee.delete(o.id),o.ok){a.resolve(o.payload);return}a.reject(new l(o.code,o.error))};r.addEventListener("message",Zt),G({channel:g,v:_,type:"hello"});let I=(t,o=u)=>{if(F||r.parent===r)return Promise.reject(new l("HOST_UNAVAILABLE","No host frame. This page is not in an iframe."));return new Promise((a,i)=>{let R=setTimeout(()=>{ee.delete(t.id),i(new l("HOST_TIMEOUT","Host did not answer in time."))},o);ee.set(t.id,{resolve:a,reject:i,timer:R}),G(t)})},x=(t)=>I(t).then(()=>{return}),v={channel:g,v:_},Ze=(t)=>{if(!F&&r.parent!==r)G(t)},eo=()=>Ze({...v,type:"file-save"}),et=()=>{if(!F&&r.parent!==r)G({...v,type:"microphone-close",id:S(d)})},er=async()=>{if(N)throw new l("HOST_REJECTED","The microphone is already open in this frame.");if(p?.features?.microphone!==!0)throw new l("UNSUPPORTED","This OpenChamber cannot share the microphone with extensions.");let t=globalThis.AudioContext;if(typeof t!=="function")throw new l("UNSUPPORTED","This frame has no Web Audio.");let o=new t;if(o.sampleRate<at||o.sampleRate>lt)throw o.close().catch(()=>{return}),new l("UNSUPPORTED",`Audio at ${o.sampleRate} Hz is not supported.`);let a=o.state==="suspended"?o.resume().catch(()=>{return}):void 0,i=lo(Math.round(o.sampleRate/4)),R=o.createScriptProcessor(1024,1,1);R.onaudioprocess=(H)=>i.pull(H.outputBuffer.getChannelData(0));let h=o.createMediaStreamDestination();R.connect(h);let y=new Set,re={queue:i,endedListeners:y,release:()=>{R.onaudioprocess=null,R.disconnect(),i.clear();for(let H of h.stream.getTracks())H.stop();o.close().catch(()=>{return})}};N=re;try{let H=await I({...v,type:"microphone-open",id:S(d),payload:{sampleRate:o.sampleRate}},ut);if(!H||!("opened"in H)||H.opened!==!0)throw new l("HOST_REJECTED","Host did not open the microphone.");if(await a,N!==re)throw new l("DISCONNECTED","The microphone closed while it was opening.")}catch(H){if(N===re)N=null;throw re.release(),et(),H}return{stream:h.stream,close:()=>{if(N!==re)return;N=null,re.release(),et()},onEnded:(H)=>(y.add(H),()=>{y.delete(H)})}},to=(t)=>{if(!Fo(t)||!cr(t))return;t.preventDefault(),eo()},oo=(t)=>{if(!Fo(t)||t.key!=="Escape"||p?.surface!=="popover"||!p.popover)return;t.preventDefault(),io(p.popover.id,"escape").catch(()=>{return})},Ae=()=>{let t=p?.surface==="popover"?p.popover:void 0;if(!t)return;let o=Ee||ge;if(Jt===o)return;Jt=o,ao(t.id,o).catch(()=>{return})},xe=()=>{if(p?.surface!=="popover"||Ee)return;Ee=!0,Ae()},ro=(t)=>{if(p?.surface!=="popover"||t.relatedTarget!==null||!Ee)return;Ee=!1,Ae()},so=()=>{if(p?.surface!=="popover"||ge)return;ge=!0,Ae()},no=()=>{if(p?.surface!=="popover"||!ge)return;ge=!1,Ae()},B=(t,o=1024)=>{if(!t.trim()||t.length>o)throw new l("HOST_REJECTED",`Identity must contain 1 to ${o} characters.`)},tt=async(t)=>{if(t.kind!=="projects")B(t.projectId);let o=await I({...v,type:"workspace-read",id:S(d),payload:t});if(!o||!("kind"in o)||!("state"in o)||o.kind!==t.kind)throw new l("HOST_REJECTED","Host did not return workspace data.");return o},ot=async(t,o)=>{if(t.kind!=="projects")B(t.projectId);let a=S(d);te.set(a,o);try{await x({...v,type:"workspace-subscribe",id:S(d),payload:{subscriptionId:a,query:t}})}catch(i){if(te.delete(a),!F)G({...v,type:"workspace-unsubscribe",id:S(d),payload:{subscriptionId:a}});throw i}return()=>{if(!te.delete(a)||F)return;G({...v,type:"workspace-unsubscribe",id:S(d),payload:{subscriptionId:a}})}},tr=async(t,o)=>{if(t.kind==="session")B(t.sessionId);if(t.kind==="project")B(t.projectId);let a=S(d);oe.set(a,o);try{await x({...v,type:"shells-subscribe",id:S(d),payload:{subscriptionId:a,scope:t}})}catch(i){if(oe.delete(a),!F)G({...v,type:"shells-unsubscribe",id:S(d),payload:{subscriptionId:a}});throw i}return()=>{if(!oe.delete(a)||F)return;G({...v,type:"shells-unsubscribe",id:S(d),payload:{subscriptionId:a}})}},Ce=async(t)=>{if("key"in t&&(t.key.length===0||t.key.length>nt))throw new l("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(t.op==="set"&&!se(t.value))throw new l("HOST_REJECTED","Storage values must be JSON.");if(t.op==="set"&&new TextEncoder().encode(JSON.stringify(t.value)).length>it)throw new l("HOST_REJECTED","Storage value exceeds 64 KiB.");if(t.scope==="device"&&p?.features?.deviceStorage!==!0)throw new l("UNSUPPORTED","This host does not support device storage.");let o=await I({...v,type:"storage",id:S(d),payload:t});if(!o||!("storage"in o)||o.op!==t.op)throw new l("HOST_REJECTED","Host did not return storage data.");return o},io=(t,o)=>p?.features?.popovers!==!0&&!(p?.surface==="popover"&&p.popover?.id===t)?Promise.reject(new l("UNSUPPORTED","This host does not support popovers.")):x({...v,type:"popover-close",id:S(d),payload:o?{id:t,reason:o}:{id:t}}),ao=(t,o)=>p?.features?.popovers!==!0&&!(p?.surface==="popover"&&p.popover?.id===t)?Promise.reject(new l("UNSUPPORTED","This host does not support popovers.")):x({...v,type:"popover-anchor",id:S(d),payload:{id:t,active:o}});return r.addEventListener("keydown",oo,!0),r.addEventListener("pointerover",xe),r.addEventListener("pointermove",xe),r.addEventListener("pointerout",ro),r.addEventListener("focus",so),r.addEventListener("blur",no),{onAction:(t)=>(pe=t,()=>{if(pe===t)pe=null}),listProjects:async()=>{let t=await tt({kind:"projects"});if(t.kind!=="projects")throw new l("HOST_REJECTED","Expected projects.");return t},listWorktrees:async(t)=>{let o=await tt({kind:"worktrees",projectId:t});if(o.kind!=="worktrees")throw new l("HOST_REJECTED","Expected worktrees.");return o},listSessions:async(t)=>{let o=await tt({kind:"sessions",projectId:t});if(o.kind!=="sessions")throw new l("HOST_REJECTED","Expected sessions.");return o},onProjects:(t)=>ot({kind:"projects"},(o)=>{if(o.kind==="projects")t(o)}),onWorktrees:(t,o)=>ot({kind:"worktrees",projectId:t},(a)=>{if(a.kind==="worktrees")o(a)}),onSessions:(t,o)=>ot({kind:"sessions",projectId:t},(a)=>{if(a.kind==="sessions")o(a)}),onRunningShells:(t,o)=>tr(t,o),readShellOutput:async(t,o)=>{B(t,ke);let a=o?.cursor;if(a!==void 0&&(!Number.isInteger(a)||a<0))throw new l("HOST_REJECTED","Shell output cursor must be a non-negative integer.");let i=o?.tailBytes;if(i!==void 0&&(!Number.isInteger(i)||i<1||i>Ie))throw new l("HOST_REJECTED",`Shell output tailBytes must be an integer between 1 and ${Ie}.`);let h=await I({...v,type:"shell-output",id:S(d),payload:{shellId:t,cursor:a,tailBytes:i}});if(!h||typeof h.output!=="string"||!Number.isFinite(h.cursor))throw new l("HOST_REJECTED","Host did not return shell output.");return h},stopShell:async(t)=>{if(B(t,ke),(await I({...v,type:"shell-stop",id:S(d),payload:{shellId:t}}))?.stopped!==!0)throw new l("HOST_REJECTED","Host did not stop the shell.");return{stopped:!0}},openSession:async(t)=>{B(t),await x({...v,type:"open-session",id:S(d),payload:{sessionId:t}})},storage:{get:async(t,o)=>{let a=Ve(o),i={op:"get",key:t};if(a)i.scope=a;let R=await Ce(i);return R.op==="get"&&R.found?R.value:void 0},set:async(t,o,a)=>{let i=Ve(a),R={op:"set",key:t,value:o};if(i)R.scope=i;await Ce(R)},delete:async(t,o)=>{let a=Ve(o),i={op:"delete",key:t};if(a)i.scope=a;await Ce(i)},keys:async(t)=>{let o=Ve(t),a={op:"keys"};if(o)a.scope=o;let i=await Ce(a);if(i.op!=="keys")throw new l("HOST_REJECTED","Expected storage keys.");return i.keys}},onReady:(t)=>{if(c.add(t),p)t(p);return()=>{c.delete(t)}},onDirectory:(t)=>{if(E.add(t),p)t(p.directory);return()=>{E.delete(t)}},onSession:(t)=>{if(m.add(t),p)t(p.session);return()=>{m.delete(t)}},onSessionLifecycle:(t)=>{if(T.add(t),V)t(V);return()=>{T.delete(t)}},onConnection:(t)=>{if(k.add(t),p)t(p.connection);return()=>{k.delete(t)}},onSettings:(t)=>{if(w.add(t),p)t(p.settings);return()=>{w.delete(t)}},onItem:(t)=>{if(ue.add(t),p)t(p.item);return()=>{ue.delete(t)}},onBlock:(t)=>{if(he.add(t),p?.block)t(p.block);return()=>{he.delete(t)}},onServiceEvent:(t)=>(fe.add(t),()=>{fe.delete(t)}),onStatusControl:(t)=>(ye.add(t),()=>{ye.delete(t)}),onPopoverClosed:(t)=>(be.add(t),()=>{be.delete(t)}),setStatusControls:(t)=>{if(p?.features?.statusControls!==!0)return Promise.reject(new l("UNSUPPORTED","This host does not support status controls."));if(!Eo(t))return Promise.reject(new l("HOST_REJECTED","Status controls must have unique bounded ids and valid selected options."));return x({...v,type:"status-controls",id:S(d),payload:{controls:t}})},openPopover:(t)=>{if(p?.features?.popovers!==!0)return Promise.reject(new l("UNSUPPORTED","This host does not support popovers."));if(!St(t))return Promise.reject(new l("HOST_REJECTED","Popover requests need bounded geometry and JSON data."));return x({...v,type:"popover-open",id:S(d),payload:t})},closePopover:io,setPopoverAnchorActive:ao,onResolve:(t)=>(ce=t,()=>{if(ce===t)ce=null}),toast:(t)=>{let o=t.message.trim();if(!o||o.length>Ue)return Promise.reject(new l("HOST_REJECTED",`Toast message must contain 1 to ${Ue} characters.`));if(t.copy&&t.copy!==!0&&(!t.copy.text.length||t.copy.text.length>we))return Promise.reject(new l("HOST_REJECTED",`Toast copy text must contain 1 to ${we} characters.`));return x({channel:g,v:_,type:"toast",id:S(d),payload:{...t,message:o}})},openUrl:(t)=>x({channel:g,v:_,type:"open-url",id:S(d),payload:{url:t}}),openCommit:(t)=>mt(t)?x({channel:g,v:_,type:"open-commit",id:S(d),payload:{sha:t}}):Promise.reject(new l("HOST_REJECTED","Commit id must be 7 to 64 hex characters.")),answerBlock:(t)=>x({channel:g,v:_,type:"block-answer",id:S(d),payload:{text:t.trim().slice(0,gt)}}),openSurface:(t)=>x({channel:g,v:_,type:"open-surface",id:S(d),payload:{surfaceId:t}}),writeClipboard:(t)=>x({channel:g,v:_,type:"clipboard-write",id:S(d),payload:{text:t}}),compose:(t)=>x({channel:g,v:_,type:"compose",id:S(d),payload:t}),attach:(t)=>x({channel:g,v:_,type:"attach",id:S(d),payload:ne(t)}),startSession:async(t)=>{if(t.projectId!==void 0)B(t.projectId);let o=t.worktree;if(o&&o!==!0)if(o.kind==="existing")B(o.directory);else{if(o.name!==void 0)B(o.name,200);if(o.baseBranch!==void 0)B(o.baseBranch,200)}let a=await I({channel:g,v:_,type:"start-session",id:S(d),payload:bt(t)},e.requestTimeoutMs??180000);if(!_t(a))throw new l("HOST_REJECTED","Host did not return a session.");return a},prompt:(t)=>I({channel:g,v:_,type:"prompt",id:S(d),payload:vt(t)}).then((o)=>{if(!Tt(o))throw new l("HOST_REJECTED","Host did not return a prompt result.");return o}),sessionLink:(t)=>x({channel:g,v:_,type:"session-link",id:S(d),payload:ne(t)}),close:()=>x({channel:g,v:_,type:"close",id:S(d)}),oauthStart:()=>x({channel:g,v:_,type:"oauth-start",id:S(d)}),oauthDisconnect:()=>x({channel:g,v:_,type:"oauth-disconnect",id:S(d)}),request:(t)=>(Te(t.path)?I({channel:g,v:_,type:"request",id:S(d),payload:t}):Ut()).then((o)=>{if(!me(o))throw new l("HOST_REJECTED","Host request result was empty.");if(o.body.length>Ne)throw new l("HOST_REJECTED","Host request result was too large.");return o}),openCodeRequest:(t)=>(Te(t.path)?I({channel:g,v:_,type:"opencode-request",id:S(d),payload:t}):Ut()).then((o)=>{if(!me(o))throw new l("HOST_REJECTED","Host OpenCode request result was empty.");if(o.body.length>Rt)throw new l("HOST_REJECTED","Host OpenCode request result was too large.");return o}),serviceRequest:(t)=>(Te(t.path)?I({channel:g,v:_,type:"service-request",id:S(d),payload:t}):Ut()).then((o)=>{if(!me(o))throw new l("HOST_REJECTED","Host service request result was empty.");if(o.body.length>Ne)throw new l("HOST_REJECTED","Host service request result was too large.");return o}),serviceStatus:()=>I({channel:g,v:_,type:"service-status",id:S(d)}).then((t)=>{if(!xt(t))throw new l("HOST_REJECTED","Host did not return service status.");return t}),readFile:(t)=>(ie(t)?I({channel:g,v:_,type:"file-read",id:S(d),payload:{path:t}}):Be()).then((o)=>{if(!Ct(o))throw new l("HOST_REJECTED","Host did not return file content.");return o}),writeFile:(t,o)=>{if(!ie(t))return Be();if(o.length>De)return Promise.reject(new l("FILE_TOO_LARGE",`Content is over ${De} characters.`));return I({channel:g,v:_,type:"file-write",id:S(d),payload:{path:t,content:o}}).then((a)=>{if(!kt(a))throw new l("HOST_REJECTED","Host did not confirm the write.");return a})},listDir:(t)=>(ie(t)?I({channel:g,v:_,type:"file-list",id:S(d),payload:{path:t}}):Be()).then((o)=>{if(!It(o))throw new l("HOST_REJECTED","Host did not return directory entries.");return o}),stat:(t)=>(ie(t)?I({channel:g,v:_,type:"file-stat",id:S(d),payload:{path:t}}):Be()).then((o)=>{if(!Pt(o))throw new l("HOST_REJECTED","Host did not return file status.");return o}),generate:(t)=>{let o=t.prompt.trim(),a=t.system?.trim();if(o.length===0||o.length>He)return Promise.reject(new l("HOST_REJECTED",`Prompt must be 1 to ${He} characters.`));if(a!==void 0&&(a.length===0||a.length>Fe))return Promise.reject(new l("HOST_REJECTED",`System prompt must be 1 to ${Fe} characters.`));let i=t.maxOutputTokens===void 0?void 0:Math.min(ft,Math.max(1,Math.floor(t.maxOutputTokens)));if(i!==void 0&&!Number.isFinite(i))return Promise.reject(new l("HOST_REJECTED","maxOutputTokens must be a number."));let R={prompt:o};if(a!==void 0)R.system=a;if(i!==void 0)R.maxOutputTokens=i;return I({channel:g,v:_,type:"generate",id:S(d),payload:R},e.requestTimeoutMs??yt).then((h)=>{if(!Mt(h))throw new l("HOST_REJECTED","Host did not return generated text.");return h})},onLateGenerateResult:(t)=>{Z.add(t);for(let o of Qe.splice(0))f([t],o);return Yt(),()=>{Z.delete(t)}},openMicrophone:er,setBadge:(t)=>x({channel:g,v:_,type:"badge",id:S(d),payload:{count:Ot(t)}}),setHeight:(t)=>x({channel:g,v:_,type:"resize",id:S(d),payload:{height:At(t)}}),onFileOpen:(t)=>{if(ve.add(t),!Ye)Ye=!0,r.addEventListener("keydown",to,!0);if(Se)t(Se);return()=>{ve.delete(t)}},onFileSnapshot:(t)=>(de=t,()=>{if(de===t)de=null}),onFileSaved:(t)=>(Oe.add(t),()=>{Oe.delete(t)}),reportFileChange:(t)=>Ze({...v,type:"file-change",payload:{dirty:t.dirty,edited:t.edited}}),requestFileSave:eo,reportFileUnsupported:()=>Ze({...v,type:"file-unsupported"}),dispose:()=>{for(let t of te.keys())G({...v,type:"workspace-unsubscribe",id:S(d),payload:{subscriptionId:t}});te.clear();for(let t of oe.keys())G({...v,type:"shells-unsubscribe",id:S(d),payload:{subscriptionId:t}});if(oe.clear(),N)et(),N.release(),N=null;if(F=!0,ce=null,pe=null,de=null,ve.clear(),Oe.clear(),Ye)r.removeEventListener("keydown",to,!0);r.removeEventListener("message",Zt),r.removeEventListener("keydown",oo,!0),r.removeEventListener("pointerover",xe),r.removeEventListener("pointermove",xe),r.removeEventListener("pointerout",ro),r.removeEventListener("focus",so),r.removeEventListener("blur",no);for(let t of ee.values())clearTimeout(t.timer),t.reject(new l("HOST_UNAVAILABLE","Host client was disposed."));ee.clear(),c.clear(),E.clear(),m.clear(),T.clear(),k.clear(),w.clear(),ue.clear(),he.clear(),fe.clear(),ye.clear(),be.clear(),Z.clear(),Qe.length=0}}};var Bo=["browser.open","browser.snapshot","browser.click","browser.type","browser.select","browser.scroll","browser.back","browser.forward","browser.inspect","browser.capture","browser.resize","browser.close"];var Zr=new Set(Bo);var Vo=["none","agent","user"];var ts=new Set(Vo);var pr=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],dr=[["--oc-syntax-keyword","--syntax-keyword","syntaxKeyword"],["--oc-syntax-string","--syntax-string","syntaxString"],["--oc-syntax-number","--syntax-number","syntaxNumber"],["--oc-syntax-function","--syntax-function","syntaxFunction"],["--oc-syntax-type","--syntax-type","syntaxType"],["--oc-syntax-comment","--syntax-comment","syntaxComment"],["--oc-syntax-variable","--syntax-variable","syntaxVariable"],["--oc-syntax-operator","--syntax-operator","syntaxOperator"]],Xo=(e,r)=>{r.style.colorScheme=e.mode;for(let[s,u]of pr)r.style.setProperty(s,e.tokens[u]);for(let[s,u,c]of dr){let E=e.tokens[c]??"";r.style.setProperty(s,E),r.style.setProperty(u,E)}r.style.setProperty("font-family",e.tokens.font),r.style.setProperty("font-size",e.tokens.fontSize??"0.875rem"),r.style.setProperty("line-height","1.45"),r.style.setProperty("color",e.tokens.foreground)},Nt=(e,r)=>{if(Xo(e.theme,r),r.dataset)r.dataset.ocSurface=e.surface,r.dataset.ocTheme=e.theme.mode};var Sr={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},b=(e,r)=>`var(--${e}, var(--oc-${Sr[e]}, ${r}))`,W=b("surface-background","transparent"),We=b("surface-elevated","transparent"),ae=b("surface-elevated-foreground","inherit"),L=b("surface-foreground","inherit"),O=b("surface-muted-foreground","gray"),Er=b("surface-muted","transparent"),z=b("interactive-border","currentColor"),U=b("interactive-hover","transparent"),J=b("interactive-active","transparent"),Lt=b("interactive-selection","transparent"),Dt=b("interactive-selection-foreground","inherit"),X=b("primary","currentColor"),Ht=b("primary-text","inherit"),Ft=b("error-text","inherit"),gr=b("font-sans","inherit"),Bt=b("font-mono","monospace"),Ko=b("radius","9px"),Vt=`calc(${Ko} - 2px)`,Wo=`calc(${Ko} - 4px)`,A=(e,r,s="transparent")=>`color-mix(in srgb, ${e} ${r}%, ${s})`,$o=`background-image: linear-gradient(${U}, ${U});`,Xt=(e,r="0.5px")=>`box-shadow: inset 0 0 0 ${r} ${e}, var(--oc-sdk-field-lift);`,Wt="border-color: var(--oc-sdk-edge); box-shadow: var(--oc-sdk-raised-lift);",qo="box-shadow: var(--oc-sdk-lit);",$t=`inset 0 0.5px 0 0 ${A(L,8)}, 0 1px 2px 0 rgb(0 0 0 / 0.4)`,_r=`
:root {
  --oc-sdk-edge: ${A(L,16)};
  --oc-sdk-field-bg: ${We};
  --oc-sdk-raised-bg: ${W};
  --oc-sdk-field-lift: inset 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --oc-sdk-raised-lift: 0 1px 1.5px 0 rgb(0 0 0 / 0.08);
  --oc-sdk-lit: inset 0 1px 0 0 rgb(255 255 255 / 0.2), 0 1px 1.5px 0 rgb(0 0 0 / 0.1);
  --oc-sdk-float-edge: rgb(0 0 0 / 0.14);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.7), 0 1px 2px -0.5px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 12px 20px -4px rgb(0 0 0 / 0.06);
}
:root[data-oc-theme="dark"] {
  --oc-sdk-edge: ${A(L,14)};
  --oc-sdk-field-bg: ${A(W,50,We)};
  --oc-sdk-raised-bg: ${We};
  --oc-sdk-field-lift: ${$t};
  --oc-sdk-raised-lift: ${$t};
  --oc-sdk-lit: ${$t};
  --oc-sdk-float-edge: rgb(0 0 0 / 0.55);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.04), inset 0 0 0 0.5px rgb(255 255 255 / 0.08), 0 8px 16px 0 rgb(0 0 0 / 0.25), 0 4px 8px 0 rgb(0 0 0 / 0.25);
}`,Xe=(e)=>{let r=b(`status-${e}`,"currentColor");return`
.oc-sdk[data-tone="${e}"], .oc-sdk [data-tone="${e}"] { --oc-sdk-tone: ${r}; --oc-sdk-tone-text: ${b(`${e}-text`,"inherit")}; }`},n=(e)=>`calc(${e}rem / 14)`,Tr=`
.oc-sdk { box-sizing: border-box; font-size: 0.875rem; line-height: 1.45; }
.oc-sdk *, .oc-sdk *::before, .oc-sdk *::after { box-sizing: border-box; }
/* :where() keeps the reset at zero specificity so every primitive class below overrides it. */
:where(.oc-sdk) :where(button, input, textarea), :where(button.oc-sdk, input.oc-sdk, textarea.oc-sdk) { font: inherit; color: inherit; margin: 0; }
:where(.oc-sdk) :where(button), :where(button.oc-sdk) { cursor: pointer; background: none; border: 0; padding: 0; }
.oc-sdk button:disabled, button.oc-sdk:disabled, .oc-sdk[aria-disabled="true"], .oc-sdk [aria-disabled="true"] { opacity: .5; pointer-events: none; }

.oc-sdk-btn { display: inline-flex; align-items: center; justify-content: center; gap: ${n(8)}; height: ${n(32)}; padding: 0 ${n(12)}; border: 1px solid transparent; font-size: 0.875rem; font-weight: 500; line-height: 1; white-space: nowrap; }
.oc-sdk-btn[data-size="sm"] { gap: ${n(6)}; height: ${n(28)}; padding: 0 ${n(10)}; font-size: 0.8125rem; }
.oc-sdk-btn[data-size="xs"] { gap: ${n(4)}; height: ${n(24)}; padding: 0 ${n(8)}; font-size: 0.75rem; }
.oc-sdk-btn[data-loading="true"] { opacity: .5; pointer-events: none; }
.oc-sdk-btn > .oc-sdk-spinner-ring { width: ${n(14)}; height: ${n(14)}; }

.oc-sdk-field { display: flex; flex-direction: column; gap: ${n(4)}; min-width: 0; }
.oc-sdk-field-label { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-field-note { font-size: 0.75rem; }
.oc-sdk-input { display: block; width: 100%; min-width: 0; height: ${n(32)}; padding: 0 ${n(10)}; border: 0; font-size: 0.875rem; line-height: 1.45; appearance: none; }
textarea.oc-sdk-input { height: auto; padding: ${n(8)} ${n(10)}; resize: vertical; }

.oc-sdk-search { position: relative; min-width: 0; }
.oc-sdk-search .oc-sdk-input { padding-left: ${n(34)}; padding-right: ${n(34)}; }
.oc-sdk-search-icon { position: absolute; left: ${n(11)}; top: 50%; transform: translateY(-50%); pointer-events: none; }
.oc-sdk-search-clear { position: absolute; right: ${n(6)}; top: 50%; transform: translateY(-50%); display: none; align-items: center; justify-content: center; width: ${n(24)}; height: ${n(24)}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-clear { display: inline-flex; }

.oc-sdk-select { position: relative; display: flex; flex-direction: column; gap: ${n(4)}; min-width: 0; }
.oc-sdk-trigger { display: inline-flex; align-items: center; gap: ${n(6)}; align-self: flex-start; width: auto; max-width: 100%; min-width: 0; height: ${n(28)}; padding: 0 ${n(10)}; border: 1px solid transparent; font-size: 0.8125rem; text-align: left; }
.oc-sdk-trigger-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-trigger-chevron { flex: 0 0 auto; }
.oc-sdk-popup { position: fixed; z-index: 50; display: flex; flex-direction: column; gap: ${n(2)}; min-width: ${n(160)}; max-width: calc(100vw - ${n(16)}); max-height: min(${n(320)}, calc(100vh - ${n(16)})); overflow: auto; padding: ${n(4)}; border: 1px solid transparent; }
.oc-sdk-popup-search { flex: 0 0 auto; padding: ${n(2)} ${n(2)} ${n(4)}; }
.oc-sdk-popup-search .oc-sdk-input { height: ${n(28)}; font-size: 0.8125rem; }
.oc-sdk-option { display: flex; align-items: center; gap: ${n(8)}; width: 100%; padding: ${n(6)} ${n(8)}; font-size: 0.8125rem; text-align: left; }
.oc-sdk-option-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-option-hint { flex: 0 0 auto; font-size: 0.75rem; }
.oc-sdk-option-check { flex: 0 0 auto; display: inline-flex; width: ${n(14)}; visibility: hidden; }
.oc-sdk-option[aria-selected="true"] > .oc-sdk-option-check { visibility: visible; }
.oc-sdk-popup-empty { padding: ${n(8)}; font-size: 0.8125rem; }

.oc-sdk-check { display: inline-flex; align-items: flex-start; gap: ${n(8)}; width: 100%; text-align: left; }
.oc-sdk-check-box { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: ${n(14)}; height: ${n(14)}; margin-top: ${n(3)}; border: 1px solid transparent; }
.oc-sdk-check-box > svg { display: none; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box > svg { display: block; }
.oc-sdk-check-thumb { flex: 0 0 auto; position: relative; width: ${n(36)}; height: ${n(20)}; --oc-sdk-thumb-travel: ${n(16)}; }
.oc-sdk-check-thumb::after { content: ""; position: absolute; top: ${n(2)}; left: ${n(2)}; width: ${n(16)}; height: ${n(16)}; }
.oc-sdk-check-text { display: flex; flex-direction: column; min-width: 0; }
.oc-sdk-check-label { font-size: 0.875rem; }
.oc-sdk-check-desc { font-size: 0.75rem; }

.oc-sdk-tabs { display: inline-flex; gap: ${n(2)}; padding: ${n(2)}; max-width: 100%; overflow: auto; }
.oc-sdk-tab { display: inline-flex; align-items: center; gap: ${n(6)}; height: ${n(28)}; padding: 0 ${n(10)}; border: 1px solid transparent; font-size: 0.8125rem; font-weight: 500; white-space: nowrap; }
.oc-sdk-tab-count { font-size: 0.75rem; font-variant-numeric: tabular-nums; }

.oc-sdk-badge { display: inline-flex; align-items: center; padding: ${n(1)} ${n(6)}; font-size: ${n(11)}; font-weight: 500; line-height: ${n(16)}; white-space: nowrap; }

.oc-sdk-list { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.oc-sdk-row { display: flex; align-items: center; gap: ${n(8)}; width: 100%; padding: ${n(6)} ${n(8)}; text-align: left; }
.oc-sdk-row-lead { flex: 0 0 auto; width: ${n(64)}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.oc-sdk-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-row-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-meta { flex: 0 0 auto; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-list-empty { padding: ${n(16)} ${n(8)}; text-align: center; font-size: 0.8125rem; }

.oc-sdk-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${n(4)}; padding: ${n(40)} ${n(16)}; text-align: center; }
.oc-sdk-empty-title { margin: 0; font-size: 0.8125rem; font-weight: 600; }
.oc-sdk-empty-body { margin: 0; max-width: 32rem; font-size: 0.8125rem; }
.oc-sdk-empty-action { margin-top: ${n(12)}; }

@keyframes oc-sdk-spin { to { transform: rotate(360deg); } }
.oc-sdk-spinner { display: inline-flex; align-items: center; gap: ${n(8)}; font-size: 0.8125rem; }
.oc-sdk-spinner-ring { width: ${n(16)}; height: ${n(16)}; border: 2px solid transparent; animation: oc-sdk-spin .8s linear infinite; }
.oc-sdk-spinner[data-size="sm"] .oc-sdk-spinner-ring { width: ${n(12)}; height: ${n(12)}; }

.oc-sdk-banner { display: flex; align-items: flex-start; gap: ${n(12)}; padding: ${n(8)} ${n(12)}; border: 1px solid transparent; }
.oc-sdk-banner-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: ${n(2)}; }
.oc-sdk-banner-title { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-banner-body { font-size: 0.8125rem; }
.oc-sdk-banner-action { flex: 0 0 auto; }

.oc-sdk-separator { display: flex; align-items: center; gap: ${n(8)}; width: 100%; margin: ${n(8)} 0; font-size: 0.75rem; }
.oc-sdk-separator::before, .oc-sdk-separator::after { content: ""; flex: 1 1 auto; height: 1px; }
.oc-sdk-separator[data-labeled="false"]::after { display: none; }
.oc-sdk-popup > .oc-sdk-separator { margin: ${n(4)} 0; }

.oc-sdk-progress { display: flex; flex-direction: column; gap: ${n(4)}; min-width: 0; }
.oc-sdk-progress-label { display: flex; justify-content: space-between; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-progress-track { height: ${n(6)}; overflow: hidden; }
.oc-sdk-progress-fill { height: 100%; transform-origin: left; transition: transform 200ms ease-out; }
.oc-sdk-progress-value { display: inline-flex; align-items: center; gap: ${n(2)}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { font-weight: 600; }

.oc-sdk-menu { position: relative; display: inline-flex; }

.oc-sdk-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.oc-sdk-text img { display: block; max-width: 100%; margin: ${n(8)} 0; }

/* Under a finger the controls reach the app's touch sizes: rows and options 44px like its sheets, every other
   control at least 36px. Inputs keep 16px text, below which iOS zooms the page on focus. */
@media (pointer: coarse) {
  .oc-sdk-btn, .oc-sdk-input { height: ${n(40)}; }
  .oc-sdk-btn[data-size="sm"], .oc-sdk-btn[data-size="xs"], .oc-sdk-trigger, .oc-sdk-tab, .oc-sdk-popup-search .oc-sdk-input { height: ${n(36)}; }
  .oc-sdk-input, .oc-sdk-popup-search .oc-sdk-input { font-size: max(16px, 0.875rem); }
  .oc-sdk-search-clear { width: ${n(36)}; height: ${n(36)}; right: 0; }
  .oc-sdk-row, .oc-sdk-option { min-height: ${n(44)}; }
  .oc-sdk-check { min-height: ${n(36)}; padding: ${n(8)} 0; }
}
`,jo=`${_r}
.oc-sdk { color: ${L}; font-family: ${gr}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${$o} }
.oc-sdk-mono { font-family: ${Bt}; }
.oc-sdk-muted { color: ${O}; }
${Xe("success")}${Xe("warning")}${Xe("error")}${Xe("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${X}; --oc-sdk-tone-text: ${Ht}; }

.oc-sdk-btn { border-radius: ${Vt}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${Wo}; }
.oc-sdk-btn[data-variant="default"] { color: ${Ht}; background: ${A(X,10,W)}; border-color: ${A(X,12)}; ${qo} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${A(X,16,W)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${A(X,22,W)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${Er}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${U}, ${U}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${J}, ${J}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${ae}; ${Wt} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${U}, ${U}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${J}, ${J}); box-shadow: none; }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${U}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${J}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${b("status-error","red")}; color: ${Ft}; background: ${A("var(--oc-sdk-tone)",7,W)}; border-color: ${A("var(--oc-sdk-tone)",12)}; ${qo} }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${A("var(--oc-sdk-tone)",9,W)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${A("var(--oc-sdk-tone)",11,W)}; box-shadow: none; }

.oc-sdk-field-note { color: ${O}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${Ft}; }
.oc-sdk-input { border-radius: ${Vt}; background: var(--oc-sdk-field-bg); color: ${ae}; ${Xt("var(--oc-sdk-edge)")} transition: background 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${O}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${U}, ${U}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { ${Xt(A(L,26),"1px")} }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input, .oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { ${Xt(b("status-error","red"),"1px")} }
.oc-sdk-input[data-mono="true"] { font-family: ${Bt}; }

.oc-sdk-search-icon { color: ${O}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${X}; }
.oc-sdk-search-clear { border-radius: ${Wo}; color: ${O}; }
.oc-sdk-search-clear:hover { background: ${U}; color: ${L}; }

.oc-sdk-trigger { border-radius: ${Vt}; background: var(--oc-sdk-raised-bg); color: ${ae}; ${Wt} transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${U}, ${U}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${J}, ${J}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${O}; }
.oc-sdk-trigger-chevron { color: ${O}; }
/* The app's floating level: the glass edge (a hairline ring and a lit top line, dark outside and light inside in dark themes) over soft shadows. The outer ring is the border, over the page like the app's. */
.oc-sdk-popup { --surface-foreground: ${ae}; border-color: var(--oc-sdk-float-edge); border-radius: 12px; background: ${We}; background-clip: padding-box; color: ${ae}; box-shadow: var(--oc-sdk-float); }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${U}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${Lt}; color: ${Dt}; }
.oc-sdk-option-check { color: ${L}; }
.oc-sdk-option[data-destructive="true"] { color: ${Ft}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${A(b("status-error","red"),10)}; }
.oc-sdk-option-hint { color: ${O}; }
.oc-sdk-popup-empty { color: ${O}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${z}; border-radius: 4px; color: ${L}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${A(L,60,z)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${z}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${W}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${X}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(var(--oc-sdk-thumb-travel, 16px)); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${$o} }
.oc-sdk-check-desc { color: ${O}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${A(L,4)}; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.16); }
.oc-sdk-tab { border-radius: 8px; color: ${O}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${L}; }
.oc-sdk-tab[aria-selected="true"] { color: ${Dt}; background: ${Lt}; border-color: ${z}; }
.oc-sdk-tabs[data-track="true"] .oc-sdk-tab[aria-selected="true"] { color: ${ae}; background: var(--oc-sdk-raised-bg); ${Wt} }
.oc-sdk-tab-count { color: ${O}; }

/* The app's neutral badge: a step of the text colour, the same in every theme. */
.oc-sdk-badge { border-radius: 9999px; background: ${A(L,6)}; color: ${O}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${A("var(--oc-sdk-tone)",15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${U}; }
.oc-sdk-row[aria-selected="true"] { background: ${Lt}; color: ${Dt}; }
.oc-sdk-row-lead { font-family: ${Bt}; color: ${O}; }
.oc-sdk-row-sub { color: ${O}; }
.oc-sdk-row-meta { color: ${O}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${O}; }

.oc-sdk-empty-body { color: ${O}; }

.oc-sdk-spinner { color: ${O}; }
.oc-sdk-spinner-ring { border-color: ${z}; border-top-color: ${X}; border-radius: 9999px; }

/* Set apart by its tint alone, like the app's banners. */
.oc-sdk-banner { border-color: transparent; border-radius: 8px; background: ${A("var(--oc-sdk-tone)",10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${O}; }

.oc-sdk-separator { color: ${O}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${A(z,40)}; }

.oc-sdk-progress-label { color: ${O}; }
/* The app's progress: a groove a step of the text colour, green once done. Older bundles mark done only through aria-valuenow. */
.oc-sdk-progress-track { border-radius: 9999px; background: ${A(L,6)}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${X}); }
.oc-sdk-progress-track[aria-valuenow="100"] > .oc-sdk-progress-fill:not([data-tone]) { background: ${b("status-success","currentColor")}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { color: ${b("success-text","inherit")}; }

.oc-sdk-text a { color: ${Ht}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${A(z,60)}; }
`,P=`
${rt}
${Tr}
${jo}`;var zo="oc-sdk-ui-style";var M=(e)=>{let r=document.getElementById(zo);if(r instanceof HTMLStyleElement){if(r.textContent!==e)r.textContent=e;return}st(document);let s=document.createElement("style");s.id=zo,s.textContent=e,document.head.appendChild(s)},C=(e,r)=>{let s=document.createElement(e);if(r)s.className=r;return s},q=(e)=>{let r=C("button",e);return r.type="button",r},D=(e,r)=>{let s=r??"";if(e.textContent!==s)e.textContent=s};var mr=()=>{let e=document.createElement("span");return e.className="oc-sdk-spinner-ring",e.setAttribute("aria-hidden","true"),e},K=(e,r)=>{M(P);let s=r,u=q("oc-sdk oc-sdk-btn"),c=mr(),E=document.createElement("span");u.append(E),e.append(u);let m=()=>{if(u.dataset.variant=s.variant??"default",u.dataset.size=s.size??"default",u.disabled=Boolean(s.disabled)||Boolean(s.loading),u.dataset.loading=s.loading?"true":"false",u.setAttribute("aria-busy",s.loading?"true":"false"),s.loading&&c.parentNode!==u)u.prepend(c);else if(!s.loading&&c.parentNode===u)c.remove();D(E,s.label)},T=()=>{if(s.disabled||s.loading)return;s.onClick()};return u.addEventListener("click",T),m(),{update:(k)=>{s={...s,...k},m()},dispose:()=>{u.removeEventListener("click",T),u.remove()}}};var qt=(e,r)=>{M(P);let s=r,u=C("div","oc-sdk oc-sdk-empty"),c=C("h2","oc-sdk-empty-title"),E=C("p","oc-sdk-empty-body"),m=C("div","oc-sdk-empty-action");u.append(c,E,m),e.append(u);let T=null,k=()=>{if(D(c,s.title),D(E,s.body),E.hidden=!s.body,m.hidden=!s.action,!s.action){T?.dispose(),T=null;return}let w={label:s.action.label,onClick:s.action.onClick};if(T)T.update(w);else T=K(m,{...w,variant:"outline",size:"sm"})};return k(),{update:(w)=>{s={...s,...w},k()},dispose:()=>{T?.dispose(),T=null,u.remove()}}};var br=/^(\s*[-*+] )\[( |x|X)\] ?(.*)$/,Jo=(e)=>e.split(`
`).map((r)=>{let s=br.exec(r);return s?{kind:"item",prefix:s[1]??"- ",done:s[2]!==" ",text:s[3]??""}:{kind:"text",text:r}}),Qo=(e)=>e.map((r)=>r.kind==="text"?r.text:`${r.prefix}[${r.done?"x":" "}] ${r.text}`).join(`
`),ze=(e)=>{let r=2166136261;for(let s=0;s<e.length;s+=1)r^=e.charCodeAt(s),r=Math.imul(r,16777619);return`${e.length}:${(r>>>0).toString(16)}`},Yo=(e,r)=>{let s=-1,u="- ";e.forEach((T,k)=>{if(T.kind!=="item")return;s=k,u=T.prefix});let c={kind:"item",prefix:u,done:!1,text:r};if(s>=0)return[...e.slice(0,s+1),c,...e.slice(s+1)];return[...e.at(-1)?.kind==="text"&&e.at(-1)?.text===""?e.slice(0,-1):[...e],c,{kind:"text",text:""}]};var Y=wt(),Q=document.querySelector("#root");if(!Q)throw Error("Missing root");var Zo=document.createElement("style");Zo.textContent=`
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
`;document.head.append(Zo);Y.onReady((e)=>Nt(e,document.documentElement));var j=[],le=!1,jt=Ge(null),zt=()=>Qo(j),Je=()=>{Y.reportFileChange(jt.observe(ze(zt())))},Kt=()=>{if(Q.replaceChildren(),!j.some((r)=>r.kind==="item")&&le){qt(Q,{title:"No items",body:"This checklist is empty."});return}if(j.forEach((r,s)=>{if(r.kind==="text"){let m=document.createElement("p");m.className="note",m.textContent=r.text,Q.append(m);return}let u=document.createElement("div");u.className=r.done?"item done":"item";let c=document.createElement("input");c.type="checkbox",c.checked=r.done,c.disabled=le,c.addEventListener("change",()=>{r.done=c.checked,u.className=r.done?"item done":"item",Je()});let E=document.createElement("input");if(E.type="text",E.value=r.text,E.readOnly=le,E.setAttribute("aria-label","Item"),E.addEventListener("input",()=>{r.text=E.value,Je()}),u.append(c,E),!le){let m=document.createElement("span");m.className="remove",K(m,{label:"Remove",variant:"ghost",size:"xs",onClick:()=>{j=j.filter((T,k)=>k!==s),Je(),Kt()}}),u.append(m)}Q.append(u)}),le)return;let e=document.createElement("div");e.className="actions",K(e,{label:"Add item",variant:"secondary",size:"sm",onClick:()=>{j=Yo(j,""),Je(),Kt();let r=Q.querySelectorAll('.item input[type="text"]');r.item(r.length-1)?.focus()}}),Q.append(e)};Y.onFileOpen((e)=>{if(e.encoding!=="text"){Y.reportFileUnsupported();return}j=Jo(e.content),le=e.readOnly,jt=Ge(ze(zt())),Kt()});Y.onFileSnapshot(()=>{let e=zt();return{content:e,version:ze(e)}});Y.onFileSaved((e)=>{Y.reportFileChange({dirty:jt.markSaved(e),edited:!1})});})();
