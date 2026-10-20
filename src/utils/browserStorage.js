/** localStorage, ou null quando o browser o recusa (modo privado, cookies bloqueados). */
export function browserStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}
