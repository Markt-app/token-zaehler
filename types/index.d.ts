export type Stats = {
  sessions: number
  messages: number
  tokens: number
  /** Alte Zählweise: jede Verlaufszeile einzeln, rund 2,7-mal so viel. */
  rawTokens: number
  cost: number
  activeDays: number
  peakHour: number | null
  models: [string, number][]
}

export type Usage = { days: Record<string, number>; all: Stats; d30: Stats }

export type View = 'overview' | 'models'

export type Range = 'all' | 'd30'

declare module 'claude-code' {
  interface PluginState {
    'token-zaehler': {
      usage: Usage | null
      view: View
      range: Range
      isCollapsed: boolean
    }
  }
}
