"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

type BaseOptions = {
  title?: string
  description?: ReactNode
}

export type ConfirmOptions = BaseOptions & {
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

export type AlertOptions = BaseOptions & {
  okLabel?: string
}

export type PromptOptions = BaseOptions & {
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  inputMode?: "text" | "numeric"
  validate?: (value: string) => string | null
}

type DialogApi = {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  alert: (options: AlertOptions) => Promise<void>
  prompt: (options: PromptOptions) => Promise<string | null>
}

type ActiveRequest =
  | ({ kind: "confirm" } & ConfirmOptions)
  | ({ kind: "alert" } & AlertOptions)
  | ({ kind: "prompt" } & PromptOptions)

const DialogContext = createContext<DialogApi | null>(null)

export function useDialog() {
  const ctx = useContext(DialogContext)
  if (!ctx) {
    throw new Error("useDialog deve ser usado dentro de <DialogProvider>")
  }
  return ctx
}

export default function DialogProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveRequest | null>(null)
  const [promptValue, setPromptValue] = useState("")
  const [promptError, setPromptError] = useState<string | null>(null)
  const resolverRef = useRef<((value: unknown) => void) | null>(null)

  const openRequest = useCallback((request: ActiveRequest) => {
    return new Promise<unknown>((resolve) => {
      resolverRef.current = resolve
      if (request.kind === "prompt") {
        setPromptValue(request.defaultValue ?? "")
      }
      setPromptError(null)
      setActive(request)
    })
  }, [])

  const settle = useCallback((value: unknown) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setActive(null)
    setPromptError(null)
    if (resolve) resolve(value)
  }, [])

  const cancelValueFor = (request: ActiveRequest | null) => {
    if (!request) return undefined
    if (request.kind === "confirm") return false
    if (request.kind === "prompt") return null
    return undefined
  }

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) settle(cancelValueFor(active))
    },
    [active, settle]
  )

  const handleConfirm = useCallback(() => {
    if (!active) return
    if (active.kind === "prompt") {
      const trimmed = promptValue.trim()
      const error = active.validate?.(trimmed) ?? null
      if (error) {
        setPromptError(error)
        return
      }
      settle(trimmed)
      return
    }
    if (active.kind === "confirm") {
      settle(true)
      return
    }
    settle(undefined)
  }, [active, promptValue, settle])

  const handleCancel = useCallback(() => {
    settle(cancelValueFor(active))
  }, [active, settle])

  const api = useMemo<DialogApi>(
    () => ({
      confirm: (options) =>
        openRequest({ kind: "confirm", ...options }) as Promise<boolean>,
      alert: (options) =>
        openRequest({ kind: "alert", ...options }) as Promise<void>,
      prompt: (options) =>
        openRequest({ kind: "prompt", ...options }) as Promise<string | null>,
    }),
    [openRequest]
  )

  const isPrompt = active?.kind === "prompt"
  const isConfirm = active?.kind === "confirm"
  const destructive = isConfirm && active.destructive

  return (
    <DialogContext.Provider value={api}>
      {children}
      <Dialog open={active !== null} onOpenChange={handleOpenChange}>
        {active ? (
          <DialogContent
            showClose={false}
            onKeyDown={(event) => {
              if (event.key === "Enter" && isPrompt) {
                event.preventDefault()
                handleConfirm()
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>{active.title ?? "Aviso"}</DialogTitle>
              {active.description ? (
                <DialogDescription>{active.description}</DialogDescription>
              ) : null}
            </DialogHeader>

            {isPrompt ? (
              <div className="flex flex-col gap-1.5">
                <Input
                  autoFocus
                  value={promptValue}
                  inputMode={active.inputMode === "numeric" ? "numeric" : "text"}
                  placeholder={active.placeholder}
                  onChange={(event) => {
                    setPromptValue(event.target.value)
                    if (promptError) setPromptError(null)
                  }}
                />
                {promptError ? (
                  <p className="text-xs font-medium text-destructive">
                    {promptError}
                  </p>
                ) : null}
              </div>
            ) : null}

            <DialogFooter>
              {active.kind !== "alert" ? (
                <Button variant="outline" onClick={handleCancel}>
                  {(isConfirm || isPrompt) && active.cancelLabel
                    ? active.cancelLabel
                    : "Cancelar"}
                </Button>
              ) : null}
              <Button
                variant={destructive ? "destructive" : "default"}
                onClick={handleConfirm}
              >
                {active.kind === "alert"
                  ? active.okLabel ?? "Entendi"
                  : active.confirmLabel ?? "Confirmar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </DialogContext.Provider>
  )
}
