/** Lower-case text without Vietnamese tone and vowel marks, so that "hop nhom" finds "Họp nhóm". */
export function searchKey(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replaceAll("đ", "d");
}

/** Whether every word of `query` occurs somewhere in `text`. */
export function matchesSearch(text: string, query: string): boolean {
  const key = searchKey(text);
  return searchKey(query).split(/\s+/).every(word => key.includes(word));
}
