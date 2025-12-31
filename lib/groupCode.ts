export function makeGroupCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function normalizeCode(s: string) {
  return s.trim().toUpperCase().replace(/\s+/g, "");
}
