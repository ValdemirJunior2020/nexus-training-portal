import { NextResponse } from "next/server";
import { view } from "../../../../../lib/server-queue";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(_:Request,{params}:{params:Promise<{jobId:string}>}){ const {jobId}=await params; const job=view(jobId); return job?NextResponse.json(job):NextResponse.json({error:"Job not found"},{status:404}); }
