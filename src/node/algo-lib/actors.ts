import type * as express from "express"
import { sanitizeString } from "../util"
import { AlgoLibActor } from "./types"

const actorHeaders = ["x-forwarded-user", "x-auth-request-user", "remote-user", "x-remote-user", "x-user"]

const getConfiguredAdmins = (): string[] => {
  const raw = process.env.CODE_SERVER_ALGO_LIB_ADMINS || "local-user"
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

export const resolveAlgoLibActor = (req: express.Request): AlgoLibActor => {
  let actorId = ""
  for (const header of actorHeaders) {
    const value = req.header(header)
    if (value) {
      actorId = sanitizeString(value)
      if (actorId) {
        break
      }
    }
  }

  if (!actorId) {
    actorId = "local-user"
  }

  const normalizedActorId = actorId.toLowerCase()
  const admins = getConfiguredAdmins()

  return {
    id: actorId,
    displayName: actorId,
    isAdmin: admins.includes("*") || admins.includes(normalizedActorId),
  }
}
