type Row = Record<string, unknown>;
const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const integer = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
const text = (value: unknown) => typeof value === "string" ? value : null;
const weekdays = new Set(["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY","SUNDAY"]);

/** Whitelist nested settings too; future/raw JSON never becomes an archive field. */
export function projectCoachingBookingPolicy(value: unknown) {
  const raw=object(value), a=object(raw.appointments);
  return {schemaVersion:raw.schemaVersion===1?1:null,appointments:{
    weeklyHours:Array.isArray(a.weeklyHours)?a.weeklyHours.flatMap(item=>{
      const day=object(item);
      if(typeof day.weekday!=="string"||!weekdays.has(day.weekday))return [];
      return [{weekday:day.weekday,intervals:Array.isArray(day.intervals)?day.intervals.flatMap(item=>{
        const interval=object(item),start=integer(interval.startMinute,0,1440),end=integer(interval.endMinute,0,1440);
        return start!==null&&end!==null&&start<end?[{startMinute:start,endMinute:end}]:[];
      }):[]}];
    }):[],
    maxAdvanceMinutes:integer(a.maxAdvanceMinutes,1),minimumLeadMinutes:integer(a.minimumLeadMinutes,0),
    minimumBufferMinutes:integer(a.minimumBufferMinutes,0,2147483647),
    resolutionResponseHours:integer(a.resolutionResponseHours,1,Math.floor(Number.MAX_SAFE_INTEGER/3600000)),
  }};
}

/** Settings history only, never checkout receipts/payer identities. Command
 * operationId/inputHash/previewHash and arbitrary nested metadata are omitted. */
export function projectCoachingBookingPolicyReceipt(value: unknown) {
  const raw=object(value);
  return {
    schemaVersion:raw.schemaVersion===1?1:null,
    version:integer(raw.version,1,2147483647),previousVersion:integer(raw.previousVersion,0,2147483647),
    previousEventId:text(raw.previousEventId),previousPolicyHash:text(raw.previousPolicyHash),policyHash:text(raw.policyHash),
    policy:projectCoachingBookingPolicy(raw.policy),reason:text(raw.reason),
    actorWorkspaceUserId:text(raw.actorWorkspaceUserId),actorNameSnapshot:text(raw.actorNameSnapshot),
    affectedAvailabilityCount:integer(raw.affectedAvailabilityCount,0),retainedAppointmentCount:integer(raw.retainedAppointmentCount,0),
  };
}
