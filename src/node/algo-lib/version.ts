import { BumpType } from "./types"

export const bumpVersion = (current: string, type: BumpType): string => {
  const [major = 1, minor = 0, patch = 0] = current.split(".").map((value) => Number(value) || 0)

  switch (type) {
    case "major":
      return `${major + 1}.0.0`
    case "minor":
      return `${major}.${minor + 1}.0`
    case "patch":
      return `${major}.${minor}.${patch + 1}`
    default:
      return current
  }
}
