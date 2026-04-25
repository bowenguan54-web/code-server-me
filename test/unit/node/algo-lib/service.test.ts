import { promises as fs } from "fs"
import * as os from "os"
import * as path from "path"
import { AlgoLibService } from "../../../../src/node/algo-lib/service"
import { AlgoLibStore } from "../../../../src/node/algo-lib/store"
import { AlgoLibActor } from "../../../../src/node/algo-lib/types"

describe("AlgoLibService", () => {
  const admin: AlgoLibActor = {
    id: "local-user",
    isAdmin: true,
    displayName: "local-user",
  }
  const user: AlgoLibActor = {
    id: "alice",
    isAdmin: false,
    displayName: "alice",
  }

  let tempDir: string
  let service: AlgoLibService

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "algo-lib-service-"))
    service = new AlgoLibService(new AlgoLibStore(tempDir))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it("creates and versions templates", async () => {
    const bootstrap = await service.getBootstrap(admin)
    const categoryId = bootstrap.categories[0].id

    const created = await service.createTemplate(admin, {
      name: "FFT starter",
      categoryId,
      difficulty: 2,
      language: "python",
      description: "A starter template",
      content: "print('fft')",
      example: "run_fft()",
      changeReason: "Initial seed",
      changeSummary: "Created starter template",
    })

    expect(created.currentVersion).toBe("1.0.0")

    const updated = await service.updateTemplate(admin, created.id, {
      name: created.name,
      categoryId,
      difficulty: 3,
      language: "python",
      description: "Updated starter template",
      content: "print('fft-v2')",
      example: "run_fft_v2()",
      changeReason: "Improve starter",
      changeSummary: "Expanded the template",
      bumpType: "minor",
    })

    expect(updated.currentVersion).toBe("1.1.0")

    const refreshed = await service.getBootstrap(admin)
    const versions = refreshed.templateVersions.filter((item) => item.templateId === created.id)
    expect(versions).toHaveLength(2)
  })

  it("keeps shared snippets admin-only", async () => {
    await expect(
      service.createSnippet(user, {
        name: "Shared helper",
        visibility: "shared",
        language: "typescript",
        description: "Shared helper",
        content: "export const x = 1",
        changeReason: "Create",
        changeSummary: "Create shared helper",
      }),
    ).rejects.toThrow("Administrator access is required")
  })

  it("submits and approves algorithms", async () => {
    const folder = await service.createAlgorithmFolder(user, {
      name: "My folder",
    })

    const algorithm = await service.createAlgorithm(user, {
      name: "Crowd score",
      folderId: folder.id,
      type: "analytics",
      description: "Scores crowd movement",
      inputSpec: '{"series":"number[]"}',
      outputSpec: '{"score":"number"}',
      content: "export const score = () => 1",
      changeReason: "Initial",
      changeSummary: "Create algorithm",
    })

    const submitted = await service.submitAlgorithm(user, algorithm.id, {
      reason: "Ready for review",
      summary: "Initial submission",
    })
    expect(submitted.status).toBe("submitted")
    expect(submitted.packageFile).toMatch(/algorithm-/)

    const approved = await service.reviewAlgorithm(admin, algorithm.id, {
      decision: "approved",
      reason: "Meets the bar",
      summary: "Approved for shared use",
      applications: ["meeting-ops"],
    })

    expect(approved.status).toBe("approved")
    expect(approved.linkedApplications).toEqual(["meeting-ops"])
  })
})
