const RU_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
  з: "z", и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function transliterate(value: string): string {
  return value.toLowerCase().split("")
    .map((character) => RU_TO_LATIN[character] ?? character)
    .join("")
    .replace(/[^a-z0-9]+/g, "");
}

export function emailLocalMatchesPerson(email: string, fullName: string): boolean {
  const local = email.toLowerCase().split("@")[0]?.replace(/[^a-z0-9]+/g, "") ?? "";
  const parts = fullName.split(/\s+/).map(transliterate).filter((part) => part.length >= 3);
  if (!local || parts.length < 2) return false;
  if (parts.some((part) => part.length >= 4 && local.includes(part))) return true;
  const initials = parts.map((part) => part[0]).join("");
  return initials.length >= 2 && local.includes(initials);
}
