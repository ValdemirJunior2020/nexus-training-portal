(() => {
  const client = ZAFClient.init();
  const state = { user: null, ticket: null, job: null, timer: null, startedAt: 0, elapsed: 0 };
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (v) => String(v ?? "").replace(/[&<>\"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
  const formatTime = (seconds) => { const s = Math.max(0, Math.floor(seconds)); return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`; };

  function render(content) { $("app").innerHTML = `<div class="nx-shell">${content}</div>`; }
  function setProgress(percent, stage, elapsed = null) {
    const p = Math.max(0, Math.min(100, Number(percent) || 0));
    const bar = $("nx-progress-bar"); if (bar) bar.style.width = `${p}%`;
    const pct = $("nx-progress-pct"); if (pct) pct.textContent = `${Math.round(p)}%`;
    const s = $("nx-stage"); if (s) s.textContent = stage || "Working";
    if (elapsed != null) { state.elapsed = elapsed; const e = $("nx-elapsed"); if (e) e.textContent = formatTime(elapsed); }
  }
  function startTimer() { clearInterval(state.timer); state.startedAt = Date.now(); state.timer = setInterval(() => setProgress(Number($("nx-progress-pct")?.textContent?.replace("%","")) || 0, $("nx-stage")?.textContent, (Date.now()-state.startedAt)/1000), 1000); }
  function stopTimer() { clearInterval(state.timer); state.timer = null; }
  function sanitize(text) { return String(text || "").replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[IP REDACTED]").replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[EMAIL REDACTED]").replace(/\+?\d[\d\s().-]{7,}\d/g, "[PHONE REDACTED]"); }

  async function getTicket() {
    const data = await client.get(["ticket.id","ticket.subject","ticket.status","ticket.priority","ticket.type","ticket.tags","ticket.requester","ticket.assignee.user","ticket.assignee.group","ticket.comments","ticket.comment","currentUser","currentAccount.subdomain"]);
    const comments = Array.isArray(data["ticket.comments"]) ? data["ticket.comments"] : [];
    const text = comments.map(c => `${c.author?.name || ""}: ${c.value || ""}`).join("\n");
    const combined = `${data["ticket.subject"] || ""}\n${text}`;
    const itinerary = combined.match(/\bH\d{6,12}\b/i)?.[0]?.toUpperCase() || combined.match(/\b\d{8,12}\b/)?.[0] || "";
    return { ticket_id:data["ticket.id"], subject:sanitize(data["ticket.subject"]), status:data["ticket.status"], priority:data["ticket.priority"], type:data["ticket.type"], tags:data["ticket.tags"]||[], requester:{name:sanitize(data["ticket.requester"]?.name),email:"[REDACTED]",id:data["ticket.requester"]?.id}, assignee:{name:sanitize(data["ticket.assignee.user"]?.name),email:"[REDACTED]",id:data["ticket.assignee.user"]?.id}, group:data["ticket.assignee.group"]?.name||"", itinerary, comments:comments.slice(-80).map(c=>({id:c.id,text:sanitize(c.value),author:sanitize(c.author?.name)})), current_comment:sanitize(data["ticket.comment"]?.text||""), zendesk_user_id:data["currentUser"]?.zendeskId||data["currentUser"]?.id };
  }

  async function authorize() {
    const current = await client.get("currentUser"); const user = current.currentUser || {};
    const res = await fetch("/api/zendesk/session", {method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({email:user.email,zendeskId:user.zendeskId||user.id})});
    const body = await res.json().catch(()=>({})); if(!res.ok||!body.authorized) throw new Error(body.message||"This email is not authorized to work on HotelPlanner tickets."); state.user=body.user;
  }

  async function analyze() {
    try {
      render(`<div class="nx-head"><div><b>NEXUS COPILOT</b><span class="nx-online">● Connected</span></div></div><div class="nx-ticket"><b>Analyzing ticket...</b><div class="nx-progress"><div id="nx-progress-bar"></div></div><div class="nx-meta"><span id="nx-stage">Reading ticket</span><span id="nx-progress-pct">5%</span></div><div class="nx-meta"><span>Elapsed</span><span id="nx-elapsed">00:00</span></div></div>`);
      startTimer(); setProgress(5,"Reading Zendesk ticket"); state.ticket=await getTicket(); setProgress(20,"Sanitizing ticket");
      const payload={...state.ticket,reservation_context:`Zendesk ticket ${state.ticket.ticket_id}. Itinerary ${state.ticket.itinerary}.`,zendesk_user_id:state.ticket.zendesk_user_id,engine:"nexus",mode:"standard",allow_tools:false,allow_learning:false};
      setProgress(35,"Checking Ticket Matrix");
      const response=await fetch("/api/extension/analyze",{method:"POST",headers:{"Content-Type":"application/json","x-nexus-user":state.user.email},credentials:"include",body:JSON.stringify(payload)});
      const job=await response.json(); if(!response.ok)throw new Error(job.error||"Nexus analysis could not be queued."); state.job=job; setProgress(45,job.position?`Waiting in queue — position ${job.position}`:"Nexus analysis started"); await pollJob(job.job_id||job.id);
    }catch(e){stopTimer();render(`<div class="nx-error"><b>NEXUS COPILOT</b><p>${escapeHtml(e.message)}</p><button id="nx-retry">Retry</button></div>`);$("nx-retry")?.addEventListener("click",analyze);}
  }

  async function pollJob(jobId) {
    for(;;){
      const res=await fetch(`/api/extension/jobs/${encodeURIComponent(jobId)}`,{credentials:"include",cache:"no-store",headers:{"x-nexus-user":state.user.email}}); const job=await res.json(); if(!res.ok)throw new Error(job.error||"Could not read Nexus job status.");
      const progress=Number(job.progress??job.percent??(job.status==="queued"?45:job.status==="running"?70:100));
      const stage=job.stage||job.message||(job.status==="queued"?`Waiting in queue — position ${job.position||"..."}`:job.status==="running"?"Nexus AI analysis":"Complete");
      setProgress(progress,stage,(Date.now()-state.startedAt)/1000);
      if(["done","completed","complete","failed","error"].includes(String(job.status).toLowerCase())){stopTimer();if(["failed","error"].includes(String(job.status).toLowerCase()))throw new Error(job.error||"Nexus analysis failed.");showResult(job.result||job.response||job);return;}
      await new Promise(r=>setTimeout(r,1500));
    }
  }

  function showResult(result){
    const text=typeof result==="string"?result:result.recommendation||result.answer||result.response||JSON.stringify(result,null,2); const elapsed=state.elapsed;
    render(`<div class="nx-head"><div><b>NEXUS COPILOT</b><span class="nx-online">● Connected</span></div><button id="nx-refresh">↻</button></div><div class="nx-ticket"><div class="nx-id">${escapeHtml(state.ticket.ticket_id)} ${state.ticket.itinerary?`· ${escapeHtml(state.ticket.itinerary)}`:""}</div><div class="nx-title">${escapeHtml(state.ticket.subject)}</div></div><div class="nx-card"><label>RECOMMENDATION</label><div class="nx-result">${escapeHtml(text)}</div></div><div class="nx-card"><label>STATUS</label><div class="nx-ok">✓ Analysis complete</div><div class="nx-small">Elapsed ${formatTime(elapsed)}</div></div><div class="nx-actions"><button id="nx-copy">Copy Recommendation</button></div>`);
    $("nx-copy")?.addEventListener("click",()=>navigator.clipboard?.writeText(text)); $("nx-refresh")?.addEventListener("click",analyze);
  }

  function wireEvents(){
    const events=["ticket.subject.changed","ticket.status.changed","ticket.priority.changed","ticket.tags.changed","ticket.comments.changed","ticket.assignee.user.id.changed","ticket.assignee.group.id.changed","ticket.customStatus.changed","ticket.form.id.changed"];
    let timer=null; const refresh=()=>{clearTimeout(timer);timer=setTimeout(()=>analyze(),1500);}; events.forEach(event=>client.on(event,refresh)); client.on("ticket.save",()=>{refresh();return true;});
  }

  async function boot(){client.invoke("resize",{width:"100%",height:"560px"}).catch(()=>{});if(window.__NEXUS_ZAF_BOOT__?.status==="error"){render(`<div class="nx-error"><b>NEXUS COPILOT</b><p>${escapeHtml(window.__NEXUS_ZAF_BOOT__.message)}</p></div>`);return;}try{await authorize();await analyze();wireEvents();}catch(e){render(`<div class="nx-error"><b>NEXUS COPILOT</b><p>${escapeHtml(e.message)}</p><small>Zendesk remains fully usable.</small></div>`);}}
  boot();
})();
