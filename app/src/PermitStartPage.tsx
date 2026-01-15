import { useEffect, useState } from "react"
import type { ReactNode } from "react"

import "./App.css"
import { ProcessInformationDetails } from "./components/ProcessInformationDetails"
import { loadPermitflowProcessInformation } from "./utils/permitflow"
import { ProjectPersistenceError, type ProcessInformation } from "./utils/projectPersistence"

const BASIC_PERMIT_PROCESS_MODEL_ID = 1

type ProcessInformationState =
  | { status: "idle" | "loading" }
  | { status: "success"; info: ProcessInformation }
  | { status: "error"; message: string }

export default function PermitStartPage() {
  const [processState, setProcessState] = useState<ProcessInformationState>({ status: "idle" })

  useEffect(() => {
    let isCancelled = false
    setProcessState({ status: "loading" })

    loadPermitflowProcessInformation(BASIC_PERMIT_PROCESS_MODEL_ID)
      .then((info) => {
        if (isCancelled) {
          return
        }
        setProcessState({ status: "success", info })
      })
      .catch((error) => {
        if (isCancelled) {
          return
        }
        const message =
          error instanceof ProjectPersistenceError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unable to load permit information."
        setProcessState({ status: "error", message })
      })

    return () => {
      isCancelled = true
    }
  }, [])

  let content: ReactNode
  if (processState.status === "loading" || processState.status === "idle") {
    content = (
      <p className="permit-start-page__status" role="status" aria-live="polite">
        Loading permit process information…
      </p>
    )
  } else if (processState.status === "error") {
    content = (
      <div className="permit-start-page__error" role="alert">
        <p>{processState.message}</p>
      </div>
    )
  } else if (processState.status === "success") {
    content = <ProcessInformationDetails info={processState.info} />
  } else {
    const _never: never = processState
    content = _never
  }

  return (
    <article className="app permit-start-page">
      <div className="app__inner">
        <header className="permit-start-page__header">
          <p className="permit-start-page__eyebrow">Basic permit</p>
          <h1>Start this permit.</h1>
          <p>
            Use this checklist item to kick off the PermitFlow workflow. Review the process
            model and decision elements below before advancing the application.
          </p>
        </header>
        <section className="permit-start-page__content">{content}</section>
      </div>
    </article>
  )
}
