import type { PiiCategory, PiiMatch } from "../shared/types";

const candidates: ReadonlyArray<{ category: PiiCategory; expression: RegExp; verify?: (value: string) => boolean }> = [
  { category: "EMAIL", expression: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { category: "PHONE", expression: /(?<!\d)(?:\+91[ -]?)?[6-9]\d{9}(?!\d)/g },
  { category: "CREDIT_CARD", expression: /\b(?:\d[ -]?){13,19}\b/g, verify: luhnValid },
  { category: "PAN", expression: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  { category: "AADHAAR", expression: /(?<!\d)\d{4}[ -]?\d{4}[ -]?\d{4}(?!\d)/g, verify: verhoeffValid },
  { category: "IP_ADDRESS", expression: /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g },
  { category: "DATE_OF_BIRTH", expression: /\b(?:0?[1-9]|[12]\d|3[01])[/-](?:0?[1-9]|1[0-2])[/-](?:19|20)\d{2}\b/g },
  { category: "BANK_ACCOUNT", expression: /(?<!\d)\d{9,18}(?!\d)/g }
];

function luhnValid(value: string): boolean { const digits = value.replace(/\D/g, ""); if (digits.length < 13 || /^0+$/.test(digits)) return false; return [...digits].reverse().reduce((sum, digit, index) => { let number = Number(digit); if (index % 2) number = number > 4 ? number * 2 - 9 : number * 2; return sum + number; }, 0) % 10 === 0; }
function verhoeffValid(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 12 || /^0+$/.test(digits)) return false;
  const multiplication = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]] as const;
  const permutation = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]] as const;
  let checksum = 0;
  for (const [index, digit] of [...digits].reverse().entries()) checksum = multiplication[checksum]![permutation[index % 8]![Number(digit)]!]!;
  return checksum === 0;
}

export function recognizePii(text: string): PiiMatch[] {
  const found: PiiMatch[] = [];
  for (const candidate of candidates) { candidate.expression.lastIndex = 0; for (const match of text.matchAll(candidate.expression)) { const value = match[0]; if (!candidate.verify || candidate.verify(value)) found.push({ category: candidate.category, value, start: match.index ?? 0, end: (match.index ?? 0) + value.length, confidence: candidate.verify ? 0.99 : 0.96 }); } }
  return found.sort((left, right) => left.start - right.start || right.end - left.end).filter((match, index, all) => index === 0 || match.start >= all[index - 1]!.end);
}

export function sensitiveCategoryFromDom(node: { inputType?: string; autocomplete?: string; label?: string; }): PiiCategory | undefined {
  const hint = `${node.inputType ?? ""} ${node.autocomplete ?? ""} ${node.label ?? ""}`.toLowerCase();
  if (node.inputType === "password" || /password|current-password|new-password/.test(hint)) return "PASSWORD";
  if (/email/.test(hint)) return "EMAIL";
  if (/tel|phone|mobile/.test(hint)) return "PHONE";
  if (/cc-|card/.test(hint)) return "CREDIT_CARD";
  if (/aadhaar|aadhar/.test(hint)) return "AADHAAR";
  if (/\bpan\b|permanent account/.test(hint)) return "PAN";
  if (/bank|account/.test(hint)) return "BANK_ACCOUNT";
  if (/employee.?id/.test(hint)) return "EMPLOYEE_ID";
  return undefined;
}
