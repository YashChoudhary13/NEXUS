import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useSetAtom } from 'jotai'
import { LoaderCircle } from 'lucide-react'
import type { LlmConnectionWithStatus } from '@config/llm-connections'
import { ConnectionIcon } from '@/components/icons/ConnectionIcon'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { navigate, routes } from '@/lib/navigate'
import { addSessionAtom } from '@/atoms/sessions'
import { toast } from 'sonner'
import {
  chooseInitialHandoffConnection,
  getConnectionModelOptions,
  groupConnectionsByProviderAccount,
} from './input/model-picker-helpers'

interface ContinueWithAgentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId: string
  parentTitle: string
  connections: readonly LlmConnectionWithStatus[]
  currentConnection?: string
}

export function ContinueWithAgentDialog({
  open,
  onOpenChange,
  sessionId,
  parentTitle,
  connections,
  currentConnection,
}: ContinueWithAgentDialogProps) {
  const { t } = useTranslation()
  const addSession = useSetAtom(addSessionAtom)
  const authenticatedConnections = React.useMemo(
    () => connections.filter(connection => connection.isAuthenticated),
    [connections],
  )
  const groupedConnections = React.useMemo(
    () => groupConnectionsByProviderAccount(authenticatedConnections),
    [authenticatedConnections],
  )
  const [connectionSlug, setConnectionSlug] = React.useState('')
  const [model, setModel] = React.useState('')
  const [continuing, setContinuing] = React.useState(false)

  const selectedConnection = React.useMemo(
    () => authenticatedConnections.find(connection => connection.slug === connectionSlug),
    [authenticatedConnections, connectionSlug],
  )
  const modelOptions = React.useMemo(
    () => selectedConnection ? getConnectionModelOptions(selectedConnection) : [],
    [selectedConnection],
  )
  const selectedIdentity = React.useMemo(() => {
    if (!selectedConnection) return null
    const parts = [selectedConnection.oauthAccountEmail, selectedConnection.oauthOrganizationName]
      .map(value => value?.trim())
      .filter((value): value is string => !!value)
    return parts.length > 0 ? parts.join(' · ') : null
  }, [selectedConnection])

  React.useEffect(() => {
    if (!open) return
    const initial = chooseInitialHandoffConnection(authenticatedConnections, currentConnection)
    setConnectionSlug(initial?.slug ?? '')
    setModel(initial ? (getConnectionModelOptions(initial)[0]?.id ?? '') : '')
    setContinuing(false)
  }, [open, authenticatedConnections, currentConnection])

  const handleConnectionChange = React.useCallback((slug: string) => {
    const connection = authenticatedConnections.find(candidate => candidate.slug === slug)
    setConnectionSlug(slug)
    setModel(connection ? (getConnectionModelOptions(connection)[0]?.id ?? '') : '')
  }, [authenticatedConnections])

  const handleContinue = React.useCallback(async () => {
    if (!connectionSlug || !model || continuing) return
    setContinuing(true)
    try {
      const result = await window.electronAPI.continueSessionWithAgent(sessionId, {
        llmConnection: connectionSlug,
        model,
      })

      // The server emits session_created before resolving this RPC, but the
      // renderer handles that event asynchronously. Hydrate the child here so
      // route reconciliation cannot reject navigation while the event's
      // getSessionMessages() request is still in flight. addSessionAtom is
      // idempotent for the session ID, so the lifecycle event may safely win
      // or lose this race.
      const childSession = await window.electronAPI.getSessionMessages(result.sessionId)
      if (childSession) addSession(childSession)

      onOpenChange(false)
      toast.success(t('handoff.success'))
      navigate(routes.view.allSessions(result.sessionId))
    } catch (error) {
      const description = error instanceof Error ? error.message : String(error)
      toast.error(t('handoff.failed'), { description })
    } finally {
      setContinuing(false)
    }
  }, [addSession, connectionSlug, continuing, model, onOpenChange, sessionId, t])

  return (
    <Dialog open={open} onOpenChange={continuing ? undefined : onOpenChange}>
      <DialogContent
        className="sm:max-w-[460px]"
        onInteractOutside={event => { if (continuing) event.preventDefault() }}
        onEscapeKeyDown={event => { if (continuing) event.preventDefault() }}
      >
        <DialogHeader>
          <DialogTitle>{t('handoff.title')}</DialogTitle>
          <DialogDescription>
            {t('handoff.description', { name: parentTitle })}
          </DialogDescription>
        </DialogHeader>

        {authenticatedConnections.length === 0 ? (
          <div className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-4 py-3 text-sm text-muted-foreground">
            {t('handoff.noAccounts')}
          </div>
        ) : (
          <div className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium">
              <span>{t('handoff.account')}</span>
              <Select value={connectionSlug} onValueChange={handleConnectionChange} disabled={continuing}>
                <SelectTrigger aria-label={t('handoff.account')}>
                  <SelectValue>
                    {selectedConnection && (
                      <span className="flex items-center gap-2">
                        <ConnectionIcon connection={selectedConnection} size={14} />
                        <span>{selectedConnection.name}</span>
                      </span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {groupedConnections.map(group => (
                    <SelectGroup key={group.id}>
                      <SelectLabel className="text-xs text-muted-foreground">
                        {group.labelKey ? t(group.labelKey) : group.label}
                      </SelectLabel>
                      {group.accounts.map(({ connection, identityLine }) => (
                        <SelectItem key={connection.slug} value={connection.slug}>
                          <span className="flex min-w-0 items-center gap-2">
                            <ConnectionIcon connection={connection} size={14} />
                            <span className="min-w-0">
                              <span className="block truncate">{connection.name}</span>
                              {identityLine && (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {identityLine}
                                </span>
                              )}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {selectedIdentity && (
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {selectedIdentity}
                </span>
              )}
            </label>

            <label className="grid gap-1.5 text-sm font-medium">
              <span>{t('handoff.model')}</span>
              <Select value={model} onValueChange={setModel} disabled={continuing || modelOptions.length === 0}>
                <SelectTrigger aria-label={t('handoff.model')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map(option => (
                    <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <p className="text-xs text-muted-foreground">
              {t('handoff.parentUnchanged')}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={continuing}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => void handleContinue()}
            disabled={!connectionSlug || !model || continuing}
          >
            {continuing && <LoaderCircle className="animate-spin" />}
            {continuing ? t('handoff.generating') : t('handoff.continue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
