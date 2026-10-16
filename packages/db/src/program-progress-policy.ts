export type RankMode = "OFF" | "HISTORY" | "PREREQUISITES";
export interface ProgramRankPolicy {
  version: number;
  mode: RankMode;
  ranks: Array<{ key: string; name: string; maxStripes: number }>;
}
export interface ClassPrerequisites {
  minimumRankKey: string | null;
  minimumStripes: number;
  allowUnranked: boolean;
  minimumAge: number | null;
  maximumAge: number | null;
  cohortTag: string | null;
}
export const emptyClassPrerequisites: ClassPrerequisites = {
  minimumRankKey: null,
  minimumStripes: 0,
  allowUnranked: true,
  minimumAge: null,
  maximumAge: null,
  cohortTag: null,
};
const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
export function parseProgramRankPolicy(
  value: unknown,
): ProgramRankPolicy | null {
  const item = object(value);
  if (
    !item ||
    !["OFF", "HISTORY", "PREREQUISITES"].includes(String(item.mode)) ||
    !Number.isInteger(item.version) ||
    Number(item.version) < 1 ||
    !Array.isArray(item.ranks)
  )
    return null;
  const ranks: ProgramRankPolicy["ranks"] = [];
  for (const raw of item.ranks) {
    const rank = object(raw);
    if (
      !rank ||
      typeof rank.key !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(rank.key) ||
      typeof rank.name !== "string" ||
      !rank.name.trim() ||
      rank.name.length > 80 ||
      !Number.isInteger(rank.maxStripes) ||
      Number(rank.maxStripes) < 0 ||
      Number(rank.maxStripes) > 20 ||
      ranks.some(
        (previous) =>
          previous.key === rank.key ||
          previous.name.toLowerCase() ===
            String(rank.name).trim().toLowerCase(),
      )
    )
      return null;
    ranks.push({
      key: rank.key,
      name: rank.name.trim(),
      maxStripes: Number(rank.maxStripes),
    });
  }
  if (ranks.length > 50 || (item.mode !== "OFF" && !ranks.length)) return null;
  return { version: Number(item.version), mode: item.mode as RankMode, ranks };
}
export function parseClassPrerequisites(
  value: unknown,
): ClassPrerequisites | null {
  if (value === null || value === undefined)
    return { ...emptyClassPrerequisites };
  const item = object(value);
  if (!item) return null;
  const result = { ...emptyClassPrerequisites, ...item } as ClassPrerequisites;
  if (
    (result.minimumRankKey !== null &&
      (typeof result.minimumRankKey !== "string" ||
        !/^[a-zA-Z0-9_-]{1,64}$/.test(result.minimumRankKey))) ||
    !Number.isInteger(result.minimumStripes) ||
    result.minimumStripes < 0 ||
    result.minimumStripes > 20 ||
    typeof result.allowUnranked !== "boolean"
  )
    return null;
  for (const value of [result.minimumAge, result.maximumAge])
    if (
      value !== null &&
      (!Number.isInteger(value) || value < 0 || value > 120)
    )
      return null;
  if (
    result.minimumAge !== null &&
    result.maximumAge !== null &&
    result.minimumAge > result.maximumAge
  )
    return null;
  if (
    result.cohortTag !== null &&
    (typeof result.cohortTag !== "string" ||
      !result.cohortTag.trim() ||
      result.cohortTag.length > 80)
  )
    return null;
  return {
    minimumRankKey: result.minimumRankKey,
    minimumStripes: result.minimumStripes,
    allowUnranked: result.allowUnranked,
    minimumAge: result.minimumAge,
    maximumAge: result.maximumAge,
    cohortTag: result.cohortTag?.trim() ?? null,
  };
}
export interface RankAtDate {
  rankKey: string;
  rankName: string;
  stripeCount: number;
}
export function evaluateClassPrerequisites(args: {
  policy: unknown;
  rules: unknown;
  date: string;
  dateOfBirth: Date | null;
  tags: string[];
  rank: RankAtDate | null;
}) {
  const policy = parseProgramRankPolicy(args.policy),
    rules = parseClassPrerequisites(args.rules);
  const currentRank = args.rank
    ? `${args.rank.rankName}${args.rank.stripeCount ? ` · ${args.rank.stripeCount} stripe${args.rank.stripeCount === 1 ? "" : "s"}` : ""}`
    : "Unranked";
  const deny = (reason: string) => ({ eligible: false, reason, currentRank });
  if (!rules || (args.policy != null && !policy))
    return deny("The gym needs to review this class's eligibility settings.");
  if (rules.minimumAge !== null || rules.maximumAge !== null) {
    if (!args.dateOfBirth)
      return deny("Ask the gym to verify your date of birth for this class.");
    const birth = args.dateOfBirth.toISOString().slice(0, 10),
      age =
        Number(args.date.slice(0, 4)) -
        Number(birth.slice(0, 4)) -
        (args.date.slice(5) < birth.slice(5) ? 1 : 0);
    if (
      age < 0 ||
      (rules.minimumAge !== null && age < rules.minimumAge) ||
      (rules.maximumAge !== null && age > rules.maximumAge)
    )
      return deny(
        `This class is for ages ${rules.minimumAge ?? 0}${rules.maximumAge === null ? "+" : `–${rules.maximumAge}`}.`,
      );
  }
  if (rules.cohortTag && !args.tags.includes(rules.cohortTag))
    return deny(
      `This class is for the ${rules.cohortTag} group. Ask the gym about joining.`,
    );
  if (policy?.mode === "PREREQUISITES") {
    const minimum = rules.minimumRankKey
      ? policy.ranks.findIndex((rank) => rank.key === rules.minimumRankKey)
      : -1;
    if (rules.minimumRankKey && minimum < 0)
      return deny("The gym needs to review this class's minimum rank.");
    if (!args.rank) {
      if (!rules.allowUnranked)
        return deny(
          "This class requires a recorded rank. Your current rank is Unranked.",
        );
    } else if (minimum >= 0) {
      const current = policy.ranks.findIndex(
        (rank) => rank.key === args.rank!.rankKey,
      );
      if (
        current < minimum ||
        (current === minimum && args.rank.stripeCount < rules.minimumStripes)
      )
        return deny(
          `Requires ${policy.ranks[minimum]!.name}${rules.minimumStripes ? ` and ${rules.minimumStripes} stripes` : ""}. Your current rank is ${currentRank}.`,
        );
    }
  }
  return { eligible: true, reason: null, currentRank };
}
