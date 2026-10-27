import { installProviderNetworkGuard } from "../../../tests/support/provider-network-guard.mjs";
import { createHash, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const provider=vi.hoisted(()=>({create:vi.fn()}));
const hooks=vi.hoisted(()=>({calls:0,beforeLock:undefined as undefined|((call:number,tx:unknown)=>Promise<void>)}));
vi.mock("stripe",()=>({default:class{checkout={sessions:{create:provider.create}};}}));
// Test barrier invokes the REAL PG lock unchanged. No authority/time/provider
// success is fabricated. Only payment's imported lock call is instrumented.
vi.mock("@flowstate/db",async importOriginal=>{
  const actual=await importOriginal<typeof import("@flowstate/db")>();
  return {...actual,lockClassSchedule:async(...args:Parameters<typeof actual.lockClassSchedule>)=>{
    await hooks.beforeLock?.(++hooks.calls,args[0]);
    return actual.lockClassSchedule(...args);
  }};
});
import {
  Prisma, prisma as db, coachingBookingWeekdays, previewCoachingBookingPolicy,
  confirmCoachingBookingPolicy, runCoachingCommand, addDays, getWorkspaceDateString,
  createWorkspaceDataExport, downloadWorkspaceDataExport,
} from "@flowstate/db";
import { prepareCoachingRecordExport,downloadCoachingRecordExport } from "../../../packages/db/src/coaching-records.js";
import { getCoachingPayerView } from "../../../packages/db/src/coaching-payer.js";
import { lockClassSchedule as realLock } from "../../../packages/db/src/class-occurrences.js";
import { deleteFixtureCoachingWorkspace } from "../../../packages/db/tests/coaching-booking-policy-fixture.js";
import { projectCoachingBookingPolicyReceipt } from "../../../packages/db/src/coaching-booking-export-projection.js";
import { startCoachingPayment } from "../../../packages/payments/src/coaching";
const url=process.env.TEST_DATABASE_URL;
if(url&&(!["localhost","127.0.0.1"].includes(new URL(url).hostname)||!new URL(url).pathname.endsWith("_test")||!process.env.DATABASE_URL||new URL(url).host!==new URL(process.env.DATABASE_URL).host||new URL(url).pathname!==new URL(process.env.DATABASE_URL).pathname))throw new Error("Matching local disposable coaching archive database required");
(url?describe:describe.skip)("coaching settings and captured-help actual archives with real PostgreSQL",()=>{
  const workspaces=new Set<string>(),users:string[]=[];
  beforeEach(()=>{vi.clearAllMocks();hooks.calls=0;hooks.beforeLock=undefined;vi.stubEnv("STRIPE_SECRET_KEY","sk_test_fictional_archive");vi.stubEnv("NEXT_PUBLIC_MEMBER_WEB_URL","https://member.example.test");provider.create.mockRejectedValue(new Error("Fictional uncertain provider response"));});
  async function fixture(){
    const owner=await db.user.create({data:{email:`${randomUUID()}@coaching-archive.example.test`,fullName:"Archive help owner"}}),coach=await db.user.create({data:{email:`${randomUUID()}@coaching-archive.example.test`,fullName:"Archive coach"}}),client=await db.user.create({data:{email:`${randomUUID()}@coaching-archive.example.test`,fullName:"Own program client"}}),payer=await db.user.create({data:{email:`${randomUUID()}@coaching-archive.example.test`,fullName:"Other payer"}}),guardian=await db.user.create({data:{email:`${randomUUID()}@coaching-archive.example.test`,fullName:"Linked child guardian"}});
    users.push(owner.id,coach.id,client.id,payer.id,guardian.id);
    const workspace=await db.workspace.create({data:{name:"Fictional coaching archive gym",status:"ACTIVE",location:{create:{name:"Gym",timezone:"UTC"}},workspaceUsers:{create:[{userId:owner.id,role:"OWNER"},{userId:coach.id,role:"COACH"},{userId:client.id,role:"CUSTOMER"},{userId:payer.id,role:"CUSTOMER"},{userId:guardian.id,role:"CUSTOMER"}]}},include:{workspaceUsers:true}});workspaces.add(workspace.id);
    const ownerStaff=workspace.workspaceUsers.find(x=>x.userId===owner.id)!,coachStaff=workspace.workspaceUsers.find(x=>x.userId===coach.id)!;
    const member=await db.member.create({data:{workspaceId:workspace.id,userId:client.id,fullName:"Own program client",dateOfBirth:new Date("1990-01-01"),status:"ACTIVE"}}),payerMember=await db.member.create({data:{workspaceId:workspace.id,userId:payer.id,fullName:"Other payer",dateOfBirth:new Date("1990-01-01"),status:"ACTIVE"}}),child=await db.member.create({data:{workspaceId:workspace.id,fullName:"Unrelated linked child",dateOfBirth:new Date("2020-01-01"),status:"ACTIVE"}});
    const guardianRow=await db.guardian.create({data:{workspaceId:workspace.id,fullName:"Linked child guardian",email:guardian.email,familyLinks:{create:{workspaceId:workspace.id,childMemberId:child.id}}}});
    await db.memberPortalGrant.create({data:{workspaceId:workspace.id,userId:guardian.id,memberId:child.id,guardianId:guardianRow.id,verifiedByWorkspaceUserId:ownerStaff.id,verificationNote:"Fictional exact child grant",canBook:true,canSign:true,canPay:true}});
    const program=await db.coachingProgram.create({data:{workspaceId:workspace.id,name:"Own program",versions:{create:{number:1,durationDays:30,deliveryWeekdays:[1,2,3,4,5],responseHours:48,goals:"OWN_CLIENT_GOAL",milestones:[],appointmentUnits:2,appointmentMinutes:60,priceCents:12000,currency:"cad",terms:"Accepted fictional terms"}}},include:{versions:true}});
    const today=getWorkspaceDateString(new Date(),"UTC"),version=program.versions[0]!;
    const enrollment=await db.coachingEnrollment.create({data:{workspaceId:workspace.id,memberId:member.id,programVersionId:version.id,startsOn:new Date(today),endsOn:new Date(addDays(today,29)),timezone:"UTC",acceptedAt:new Date(),contactVerifiedAt:new Date(),currentCoachWorkspaceUserId:coachStaff.id,caseOwnerWorkspaceUserId:ownerStaff.id,historyFromDate:new Date(today),assignments:{create:{coachWorkspaceUserId:coachStaff.id,acceptedAt:new Date(),historyFromDate:new Date(today)}}}});
    await db.coachingIntake.create({data:{enrollmentId:enrollment.id,content:"OWN_CLIENT_SUBMITTED_INTAKE"}});
    await db.coachingPrivateNote.create({data:{enrollmentId:enrollment.id,authorWorkspaceUserId:coachStaff.id,localDate:new Date(today),body:"PRIVATE_WORKING_NOTE_EXCLUDED"}});
    await db.coachingDailyNote.create({data:{enrollmentId:enrollment.id,authorWorkspaceUserId:coachStaff.id,localDate:new Date(today),draftBody:"UNPUBLISHED_DRAFT_EXCLUDED"}});
    await db.workspaceStripeSettings.create({data:{workspaceId:workspace.id,stripeAccountId:`acct_${randomUUID()}`,connectionStatus:"ACTIVE",chargesEnabled:true}});
    return {workspace,owner,coach,client,payer,guardian,member,payerMember,enrollment,version,ownerStaff,actor:{workspaceId:workspace.id,userId:client.id},ownerActor:{workspaceId:workspace.id,userId:owner.id}};
  }
  type Fixture=Awaited<ReturnType<typeof fixture>>;
  async function confirm(f:Fixture,hours:number){
    const head=await db.coachingBookingPolicy.findUnique({where:{workspaceId:f.workspace.id}}),input={policy:{schemaVersion:1,appointments:{weeklyHours:coachingBookingWeekdays.map(weekday=>({weekday,intervals:[{startMinute:0,endMinute:1440}]})),maxAdvanceMinutes:60*1440,minimumLeadMinutes:0,minimumBufferMinutes:0,resolutionResponseHours:hours}},reason:"Explicit fictional archive policy",expectedVersion:head?.version??0,operationId:randomUUID()};
    const review=await previewCoachingBookingPolicy({actor:f.ownerActor,input,db});return confirmCoachingBookingPolicy({actor:f.ownerActor,input,db,previewHash:review.previewHash,confirmed:true});
  }
  async function captured(f:Fixture){
    await confirm(f,6);const e=await db.coachingEnrollment.findUniqueOrThrow({where:{id:f.enrollment.id}});
    await runCoachingCommand(f.actor,{kind:"acceptPlan",enrollmentId:e.id,expectedVersion:e.version,operationId:randomUUID(),input:{acceptTerms:true}});
    await confirm(f,2);await expect(startCoachingPayment(f.actor,e.id)).rejects.toThrow("uncertain provider response");await confirm(f,48);
    return db.workspaceDataEvent.findFirstOrThrow({where:{workspaceId:f.workspace.id,kind:"COACHING_CHECKOUT_BOOKING_DISCLOSURE_RECORDED"}});
  }
  afterAll(async()=>{for(const workspaceId of workspaces)await deleteFixtureCoachingWorkspace(db,workspaceId);await db.user.deleteMany({where:{id:{in:users}}});vi.unstubAllEnvs();await db.$disconnect();},600000);

  it("downloads settings-only owner head/history through the real business archive and excludes checkout/private JSON",async()=>{
    const f=await fixture(),foreign=await fixture();await captured(f);const foreignReceipt=await captured(foreign);
    const job=await createWorkspaceDataExport(f.ownerActor,"Reviewed coaching settings archive",{db}),download=await downloadWorkspaceDataExport(f.ownerActor,job.id,{db});
    expect(createHash("sha256").update(download.bytes).digest("hex")).toBe(download.sha256);
    const archive=JSON.parse(gunzipSync(download.bytes).toString("utf8"));
    expect(archive.tables.CoachingBookingPolicy).toHaveLength(1);
    expect(Object.keys(archive.tables.CoachingBookingPolicy[0]).sort()).toEqual(["id","workspaceId","version","policy","policyHash","currentEventId","updatedAt"].sort());
    expect(archive.tables.CoachingBookingPolicy[0]).toMatchObject({workspaceId:f.workspace.id,version:3,policy:{appointments:{resolutionResponseHours:48}}});
    const history=archive.tables.WorkspaceDataEvent.filter((e:{kind:string})=>e.kind==="COACHING_BOOKING_POLICY_CONFIRMED");expect(history).toHaveLength(3);
    for(const event of history){expect(event.metadata).not.toHaveProperty("operationId");expect(event.metadata).not.toHaveProperty("inputHash");expect(event.metadata).not.toHaveProperty("previewHash");expect(event.metadata).not.toHaveProperty("payerUserId");expect(event.metadata).not.toHaveProperty("enrollmentId");}
    expect(archive.tables.WorkspaceDataEvent.some((e:{kind:string})=>e.kind==="COACHING_CHECKOUT_BOOKING_DISCLOSURE_RECORDED")).toBe(false);
    const text=JSON.stringify(archive);for(const secret of ["OWN_CLIENT_SUBMITTED_INTAKE","PRIVATE_WORKING_NOTE_EXCLUDED","UNPUBLISHED_DRAFT_EXCLUDED",foreignReceipt.id])expect(text).not.toContain(secret);
    const receipt=await db.workspaceDataEvent.findFirstOrThrow({where:{workspaceId:f.workspace.id,kind:"COACHING_BOOKING_POLICY_CONFIRMED"}});
    const projected=projectCoachingBookingPolicyReceipt({...(receipt.metadata as Prisma.JsonObject),arbitrary:"PRIVATE_EXTRA",policy:{...((receipt.metadata as Prisma.JsonObject).policy as Prisma.JsonObject),arbitrary:"PRIVATE_NESTED_EXTRA"}});
    expect(JSON.stringify(projected)).not.toContain("PRIVATE_");expect(projected).not.toHaveProperty("operationId");
  });

  it("prepares and downloads the exact named client's2h captured promise after48h current without expanding payer/guardian/owner rights",async()=>{
    const f=await fixture(),foreign=await fixture();const receipt=await captured(f),foreignReceipt=await captured(foreign);
    // Retained-record identity remains authoritative even if DOB is corrected
    // or becomes unknown later; do not invent a new current-DOB retrieval gate.
    await db.member.update({where:{id:f.member.id},data:{dateOfBirth:null}});
    const job=await prepareCoachingRecordExport(f.actor,f.enrollment.id),download=await downloadCoachingRecordExport(f.actor,f.enrollment.id,job.id);
    expect(createHash("sha256").update(download.artifact).digest("hex")).toBe(download.checksum);
    const archive=JSON.parse(Buffer.from(download.artifact).toString("utf8"));
    expect(archive.acceptedPlans[0].snapshot.appointmentBookingDisclosure.resolutionResponseHours).toBe(6);
    expect(archive.appointmentBookingHelpReceipts).toEqual([expect.objectContaining({id:receipt.id,enrollmentId:f.enrollment.id,policyVersion:2,resolutionResponseHours:2,notHeld:true})]);
    const help=JSON.stringify(archive.appointmentBookingHelpReceipts);for(const secret of [f.client.id,"payer","Hash","PRIVATE_","OWN_CLIENT_SUBMITTED_INTAKE"])expect(help).not.toContain(secret);
    for(const secret of ["PRIVATE_WORKING_NOTE_EXCLUDED","UNPUBLISHED_DRAFT_EXCLUDED",foreignReceipt.id])expect(JSON.stringify(archive)).not.toContain(secret);
    const grant=await db.coachingPayerGrant.create({data:{workspaceId:f.workspace.id,enrollmentId:f.enrollment.id,payerUserId:f.payer.id,payerMemberId:f.payerMember.id,clientUserId:f.client.id,clientConsentedAt:new Date(),payerAcceptedAt:new Date(),payerContactVerifiedAt:new Date(),acceptedTerms:{beneficiaryMemberId:f.member.id,programVersionId:f.version.id,amountCents:f.version.priceCents,currency:f.version.currency,terms:f.version.terms}}});
    await db.coachingEnrollment.update({where:{id:f.enrollment.id},data:{currentPayerGrantId:grant.id}});
    const commercial=await getCoachingPayerView({workspaceId:f.workspace.id,userId:f.payer.id},grant.id);
    expect(commercial).not.toHaveProperty("appointmentBookingHelpReceipts");expect(JSON.stringify(commercial)).not.toContain("OWN_CLIENT_GOAL");
    for(const userId of [f.owner.id,f.coach.id,f.payer.id,f.guardian.id,foreign.client.id]){
      const actor={workspaceId:f.workspace.id,userId};await expect(prepareCoachingRecordExport(actor,f.enrollment.id)).rejects.toThrow();await expect(downloadCoachingRecordExport(actor,f.enrollment.id,job.id)).rejects.toThrow();
    }
    await expect(downloadCoachingRecordExport(f.actor,foreign.enrollment.id,job.id)).rejects.toThrow();
    await db.workspaceUser.update({where:{workspaceId_userId:{workspaceId:f.workspace.id,userId:f.client.id}},data:{isActive:false}});
    await expect(downloadCoachingRecordExport(f.actor,f.enrollment.id,job.id)).rejects.toThrow();
  });

  it("removes actual prepared/downloaded archives and protected receipts only through canonical scoped retention, preserving foreign/global identities",async()=>{
    const f=await fixture(),foreign=await fixture();const ownReceipt=await captured(f),foreignReceipt=await captured(foreign);
    const own=await prepareCoachingRecordExport(f.actor,f.enrollment.id);await downloadCoachingRecordExport(f.actor,f.enrollment.id,own.id);
    await expect(db.workspaceDataEvent.delete({where:{id:ownReceipt.id}})).rejects.toThrow();
    await expect(db.coachingBookingPolicy.delete({where:{workspaceId:f.workspace.id}})).rejects.toThrow();
    await deleteFixtureCoachingWorkspace(db,f.workspace.id);workspaces.delete(f.workspace.id);
    expect(await db.workspace.findUnique({where:{id:f.workspace.id}})).toBeNull();expect(await db.coachingRecordExport.count({where:{workspaceId:f.workspace.id}})).toBe(0);expect(await db.workspaceDataEvent.count({where:{workspaceId:f.workspace.id}})).toBe(0);
    expect(await db.workspaceDataEvent.findUnique({where:{id:foreignReceipt.id}})).not.toBeNull();expect(await db.user.findUnique({where:{id:f.client.id}})).not.toBeNull();
  });

  it("captures the new reservation's DB millisecond after an observed real schedule-lock wait, rather than its transaction-start time",async()=>{
    const f=await fixture();await confirm(f,2);
    const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};};
    const intercept=deferred(),proceed=deferred(),blockerReady=deferred(),release=deferred();let reservationStart:Date|undefined;let reservationPid:number|undefined,blockerPid:number|undefined;
    hooks.beforeLock=async(call,raw)=>{if(call===2){const tx=raw as Prisma.TransactionClient;const t=await tx.$queryRaw<Array<{at:Date;pid:number}>>`SELECT transaction_timestamp() AT TIME ZONE 'UTC' AS at,pg_backend_pid() AS pid`;reservationStart=t[0]!.at;reservationPid=t[0]!.pid;intercept.resolve();await proceed.promise;}};
    const request=startCoachingPayment(f.actor,f.enrollment.id).then(()=>({error:null}),error=>({error}));
    await Promise.race([intercept.promise,request.then(outcome=>{throw outcome.error ?? new Error("Checkout completed before the reservation barrier");})]);
    let releasedAt:Date|undefined;
    const blocker=db.$transaction(async tx=>{await realLock(tx,f.workspace.id);const identity=await tx.$queryRaw<Array<{pid:number}>>`SELECT pg_backend_pid() AS pid`;blockerPid=identity[0]!.pid;blockerReady.resolve();await release.promise;const t=await tx.$queryRaw<Array<{at:Date}>>`SELECT clock_timestamp() AT TIME ZONE 'UTC' AS at`;releasedAt=t[0]!.at;},{timeout:20000});
    try{
      await Promise.race([blockerReady.promise,blocker.then(()=>{throw new Error("Blocker ended before lock ownership was established");})]);proceed.resolve();let observed=false;const deadline=Date.now()+10000;
      while(Date.now()<deadline){
        const waits=await db.$queryRaw<Array<{pid:number;blockers:number[]}>>`SELECT pid,pg_blocking_pids(pid) AS blockers FROM pg_locks WHERE pid=${reservationPid} AND locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND objid=((hashtext(${`class-schedule:${f.workspace.id}`})::bigint & 4294967295)::oid)`;
        if(waits.some(row=>row.pid===reservationPid&&row.blockers.includes(blockerPid!))){observed=true;break;}
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(observed).toBe(true);release.resolve();await blocker;
      const outcome=await request;expect(outcome.error).toBeInstanceOf(Error);expect(String(outcome.error)).toContain("uncertain provider response");
      const op=await db.financialOperation.findFirstOrThrow({where:{workspaceId:f.workspace.id,kind:"CHECKOUT"}}),receipt=await db.workspaceDataEvent.findFirstOrThrow({where:{workspaceId:f.workspace.id,kind:"COACHING_CHECKOUT_BOOKING_DISCLOSURE_RECORDED"}});
      console.info(JSON.stringify({proof:"real-reservation-schedule-wait",reservationPid,blockerPid,reservationStart,releasedAt,capturedAt:op.submittedAt}));
      expect(+releasedAt!).toBeGreaterThan(+reservationStart!);expect(+op.submittedAt!).toBeGreaterThanOrEqual(+releasedAt!);expect(receipt.createdAt).toEqual(op.submittedAt);expect(receipt.metadata).toMatchObject({capturedAt:op.submittedAt!.toISOString(),appointmentBookingDisclosure:{reviewedAt:op.submittedAt!.toISOString()}});
    }finally{proceed.resolve();release.resolve();await blocker;await request;hooks.beforeLock=undefined;}
  });
});

// Test-only offline boundary is independent of Vitest module-resolution identity.
const providerNetworkGuard = installProviderNetworkGuard();
afterEach(() => {
  expect(providerNetworkGuard.report.blocked).toHaveLength(0);
  expect(providerNetworkGuard.report.openedExternalSockets).toBe(0);
});
afterAll(() => { providerNetworkGuard.restore(); });
