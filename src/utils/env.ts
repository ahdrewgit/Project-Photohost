export function getRequiredEnv(name: string): string {
  const value = import.meta.env[name]
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

