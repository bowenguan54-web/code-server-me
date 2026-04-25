import { Router } from "express"
import { promises as fs } from "fs"
import * as path from "path"
import { HttpCode, HttpError } from "../../common/http"
import {
  AlgorithmFolderPayload,
  AlgorithmPayload,
  AlgorithmReviewPayload,
  AlgorithmSubmissionPayload,
  CategoryPayload,
  createAlgoLibService,
  resolveAlgoLibActor,
  SnippetFolderPayload,
  SnippetPayload,
  TemplatePayload,
} from "../algo-lib/service"
import { rootPath } from "../constants"
import { ensureAuthenticated, replaceTemplates } from "../http"

const pageRoutes = ["/algo-lib", "/vscode/algo-lib"]
const apiBaseRoutes = ["/api/algo-lib", "/vscode/api/algo-lib"]

const parseId = (value: string): number => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    throw new HttpError("Invalid numeric identifier", HttpCode.BadRequest)
  }
  return parsed
}

const getRouteParam = (params: Record<string, string | string[] | undefined>, key: string): string => {
  const value = params[key]
  if (Array.isArray(value)) {
    return value[0] || ""
  }
  return value || ""
}

const renderPage = async (req: Parameters<typeof replaceTemplates>[0]): Promise<string> => {
  const content = await fs.readFile(path.join(rootPath, "src/browser/pages/algo-lib.html"), "utf8")
  return replaceTemplates(req, content, {
    pageTitle: "算法管理平台",
  })
}

export const router = Router()

router.get(pageRoutes, async (req, res) => {
  res.send(await renderPage(req))
})

for (const baseRoute of apiBaseRoutes) {
  router.get(`${baseRoute}/bootstrap`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    res.json(await service.getBootstrap(actor))
  })

  router.post(`${baseRoute}/categories`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    res.json(await service.createCategory(actor, req.body as CategoryPayload))
  })

  router.patch(`${baseRoute}/categories/:id`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    res.json(await service.updateCategory(actor, parseId(getRouteParam(req.params, "id")), req.body as CategoryPayload))
  })

  router.delete(`${baseRoute}/categories/:id`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    await service.deleteCategory(actor, parseId(getRouteParam(req.params, "id")))
    res.json({ ok: true })
  })

  router.post(`${baseRoute}/templates`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    res.json(await service.createTemplate(actor, req.body as TemplatePayload))
  })

  router.patch(`${baseRoute}/templates/:id`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    res.json(await service.updateTemplate(actor, parseId(getRouteParam(req.params, "id")), req.body as TemplatePayload))
  })

  router.delete(`${baseRoute}/templates/:id`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    await service.deleteTemplate(actor, parseId(getRouteParam(req.params, "id")))
    res.json({ ok: true })
  })

  router.post(`${baseRoute}/templates/:id/restore`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    res.json(
      await service.restoreTemplateVersion(
        actor,
        parseId(getRouteParam(req.params, "id")),
        String(req.body.version || ""),
        String(req.body.reason || ""),
        String(req.body.summary || ""),
      ),
    )
  })

  router.post(`${baseRoute}/templates/:id/publish`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    res.json(
      await service.publishTemplateAsAlgorithm(actor, parseId(getRouteParam(req.params, "id")), req.body as {
        name?: string
        zhName?: string
        packageId?: string
        namespace?: string
        folderId?: number
        description?: string
      }),
    )
  })

  router.post(`${baseRoute}/snippet-folders`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    res.json(await service.createSnippetFolder(actor, req.body as SnippetFolderPayload))
  })

  router.patch(`${baseRoute}/snippet-folders/:id`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    res.json(
      await service.updateSnippetFolder(
        actor,
        parseId(getRouteParam(req.params, "id")),
        req.body as SnippetFolderPayload,
      ),
    )
  })

  router.delete(`${baseRoute}/snippet-folders/:id`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    await service.deleteSnippetFolder(actor, parseId(getRouteParam(req.params, "id")))
    res.json({ ok: true })
  })

  router.post(`${baseRoute}/snippets`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    res.json(await service.createSnippet(actor, req.body as SnippetPayload))
  })

  router.patch(`${baseRoute}/snippets/:id`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    res.json(await service.updateSnippet(actor, parseId(getRouteParam(req.params, "id")), req.body as SnippetPayload))
  })

  router.delete(`${baseRoute}/snippets/:id`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    await service.deleteSnippet(actor, parseId(getRouteParam(req.params, "id")))
    res.json({ ok: true })
  })

  router.post(`${baseRoute}/snippets/:id/restore`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    res.json(
      await service.restoreSnippetVersion(
        actor,
        parseId(getRouteParam(req.params, "id")),
        String(req.body.version || ""),
        String(req.body.reason || ""),
        String(req.body.summary || ""),
      ),
    )
  })

  router.post(`${baseRoute}/algorithm-folders`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    res.json(await service.createAlgorithmFolder(actor, req.body as AlgorithmFolderPayload))
  })

  router.patch(`${baseRoute}/algorithm-folders/:id`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    res.json(
      await service.updateAlgorithmFolder(
        actor,
        parseId(getRouteParam(req.params, "id")),
        req.body as AlgorithmFolderPayload,
      ),
    )
  })

  router.delete(`${baseRoute}/algorithm-folders/:id`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    await service.deleteAlgorithmFolder(actor, parseId(getRouteParam(req.params, "id")))
    res.json({ ok: true })
  })

  router.post(`${baseRoute}/algorithms`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    res.json(await service.createAlgorithm(actor, req.body as AlgorithmPayload))
  })

  router.patch(`${baseRoute}/algorithms/:id`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    res.json(
      await service.updateAlgorithm(actor, parseId(getRouteParam(req.params, "id")), req.body as AlgorithmPayload),
    )
  })

  router.delete(`${baseRoute}/algorithms/:id`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    await service.deleteAlgorithm(actor, parseId(getRouteParam(req.params, "id")))
    res.json({ ok: true })
  })

  router.post(`${baseRoute}/algorithms/:id/restore`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    res.json(
      await service.restoreAlgorithmVersion(
        actor,
        parseId(getRouteParam(req.params, "id")),
        String(req.body.version || ""),
        String(req.body.reason || ""),
        String(req.body.summary || ""),
      ),
    )
  })

  router.post(`${baseRoute}/algorithms/:id/submit`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    res.json(
      await service.submitAlgorithm(
        actor,
        parseId(getRouteParam(req.params, "id")),
        req.body as AlgorithmSubmissionPayload,
      ),
    )
  })

  router.post(`${baseRoute}/algorithms/:id/review`, ensureAuthenticated, async (req, res) => {
    const actor = resolveAlgoLibActor(req)
    const service = createAlgoLibService(req.args["user-data-dir"])
    res.json(
      await service.reviewAlgorithm(
        actor,
        parseId(getRouteParam(req.params, "id")),
        req.body as AlgorithmReviewPayload,
      ),
    )
  })
}
