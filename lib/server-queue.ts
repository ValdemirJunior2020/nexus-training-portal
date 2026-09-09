import { canUse, readDb } from "./server-control";

export type QueueKind = "zendesk" | "agent";
export type QueueJob = { id:string; email:string; kind:QueueKind; payload:any; status:"queued"|"running"|"done"|"error"; created:number; started?:number; finished?:number; result?:any; error?:string };
type State={jobs:Map<string,QueueJob>;pending:string[];running:boolean;durations:number[]};
const g=globalThis as typeof globalThis & {__nexusQueue?:State};
const state:State=g.__nexusQueue||{jobs:new Map(),pending:[],running:false,durations:[]}; g.__nexusQueue=state;
const NEXUS_URL=process.env.NEXUS_URL||"http://127.0.0.1:8787";
const avg=()=>state.durations.length?state.durations.reduce((a,b)=>a+b,0)/state.durations.length:120;
export function view(id:string){const j=state.jobs.get(id);if(!j)return null;const now=Date.now()/1000;const pos=j.status==="queued"?Math.max(1,state.pending.indexOf(id)+1):0;const waited=(j.started||now)-j.created;const running=j.status==="running"&&j.started?now-j.started:0;const average=avg();return{job_id:id,status:j.status,position:pos,waited_seconds:Math.round(waited),running_seconds:Math.round(running),average_job_seconds:Math.round(average),estimated_wait_seconds:Math.round(j.status==="running"?Math.max(0,average-running):pos*average),result:j.result,error:j.error};}
async function submitInternal(email:string,payload:any,kind:QueueKind,requireAccess:boolean){if(requireAccess&&!(await canUse(email)))throw new Error("ACCESS_DISABLED");const db=await readDb();const max=Number(db.settings.maxQueueJobs||100);if(state.pending.length>=max)throw new Error("QUEUE_FULL");const id=crypto.randomUUID();state.jobs.set(id,{id,email,kind,payload,status:"queued",created:Date.now()/1000});state.pending.push(id);void work();return view(id)!;}
export const submitZendesk=(email:string,payload:any)=>submitInternal(email,payload,"zendesk",true);
export const submitAgent=(email:string,payload:any)=>submitInternal(email,payload,"agent",false);
export const submit=submitZendesk;
async function work(){if(state.running)return;state.running=true;try{while(state.pending.length){const id=state.pending.shift()!;const j=state.jobs.get(id)!;j.status="running";j.started=Date.now()/1000;try{const endpoint=j.kind==="zendesk"?"/zendesk/analyze":"/agent/run";const res=await fetch(`${NEXUS_URL}${endpoint}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(j.payload),cache:"no-store"});if(!res.ok)throw new Error(`Nexus ${res.status}: ${await res.text()}`);j.result=await res.json();j.status="done";}catch(e){j.status="error";j.error=e instanceof Error?e.message:"Unknown Nexus error";}finally{j.finished=Date.now()/1000;state.durations.push(Math.max(.1,j.finished-j.started!));state.durations=state.durations.slice(-30);}}}finally{state.running=false;}}
export function queueSummary(){const active=[...state.jobs.values()].filter(j=>j.status==="running");return{waiting:state.pending.length,running:active.length,average_job_seconds:Math.round(avg()),jobs:state.pending.slice(0,50).map(id=>view(id))};}
