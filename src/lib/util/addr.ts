export function norm(addr: string | undefined | null): string {
  return (addr || "").trim().toLowerCase();
}
