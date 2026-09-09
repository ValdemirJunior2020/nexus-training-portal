import { NextRequest, NextResponse } from "next/server";
import { view } from "../../../../../lib/server-queue";
export const runtime="nodejs";
export const dynamic="force-dynamic";

function userIdFromSubject(subject:string){const match=subject.match(/\/users\/(\d+)(?:\.json)?$/);return match?.[1]||"";}

export async function GET(request:NextRequest,{params}:{params:Promise<{jobId:string}>}){
  const {jobId}=await params;
  const job=view(jobId);
  if(!job)return NextResponse.json({error:"Job not found"},{status:404});
  const email=(request.headers.get("x-nexus-user")||"").trim().toLowerCase();
  if(!email.endsWith("@hotelplanner.com"))return NextResponse.json({error:"This email is not authorized to work on HotelPlanner tickets."},{status:403});
  if(process.env.NEXUS_ZENDESK_DEV_MODE!=="true"){
    const subject=decodeURIComponent(request.cookies.get("nexus_zaf_sub")?.value||"");
    if(!userIdFromSubject(subject))return NextResponse.json({error:"Nexus could not verify this Zendesk session."},{status:403});
  }
  if((job as {email?:string}).email?.toLowerCase()!==email)return NextResponse.json({error:"This Nexus job belongs to another Zendesk user."},{status:403});
  return NextResponse.json(job);
}
