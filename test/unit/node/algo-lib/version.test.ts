import { bumpVersion } from "../../../../src/node/algo-lib/version"

describe("algo-lib versioning", () => {
  it("bumps patch versions", () => {
    expect(bumpVersion("1.2.3", "patch")).toBe("1.2.4")
  })

  it("bumps minor versions", () => {
    expect(bumpVersion("1.2.3", "minor")).toBe("1.3.0")
  })

  it("bumps major versions", () => {
    expect(bumpVersion("1.2.3", "major")).toBe("2.0.0")
  })
})
