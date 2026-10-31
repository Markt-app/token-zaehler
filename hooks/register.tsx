import type { EngineInterface, Register } from 'claude-code'

import type { Stats, Usage } from '../types'

const REFRESH_MS = 30 * 1000
const USAGE = { plugin: 'token-zaehler', key: 'usage' } as const
const VIEW = { plugin: 'token-zaehler', key: 'view' } as const
const RANGE = { plugin: 'token-zaehler', key: 'range' } as const
const COLLAPSED = { plugin: 'token-zaehler', key: 'isCollapsed' } as const

const WIDTH = 560
// 43 Wochen à 13 px füllen die 560 px Breite.
const WEEKS = 43
const CELL = 10
const GAP = 3

const groupDigits = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

// 6_150_000_000 -> "6.15B", 123_600_000 -> "123.6M".
const short = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : `${(n / 1e6).toFixed(1)}M`

const localDay = (ms: number) => {
  const d = new Date(ms)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// "2026-10-31" -> "Sat, Oct 31"
const dayLabel = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
    new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).getDay()
  ]
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    (m ?? 1) - 1
  ]
  return `${weekday}, ${month} ${d}`
}

// 19 -> "7 PM"
const hourLabel = (hour: number) => `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`

// "claude-opus-5-5" -> "Opus 5.5"
const modelName = (id: string) => {
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-|$)/.exec(id)
  if (!match) return id
  const [, family = '', major, minor] = match
  return `${family[0]?.toUpperCase()}${family.slice(1)} ${major}${minor ? `.${minor}` : ''}`
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const STYLE =
  '<style>text{font-family:-apple-system,system-ui,sans-serif}' +
  '.tile{fill:#2f2f2f}.lab{fill:#a3a3a3;font-size:11px}.val{fill:#f2f2f2;font-size:16px;font-weight:600}' +
  '.bar{fill:#35a3f0}' +
  '.cap{fill:#8c8c8c;font-size:9.5px;font-weight:500;letter-spacing:.08em}.div{stroke:#3d3d3d}' +
  '.g1{stop-color:#1f6fd6}.g2{stop-color:#7fdcff}' +
  '.l0{fill:#353535}.l1{fill:#1d4f7a}.l2{fill:#2479c2}.l3{fill:#35a3f0}.l4{fill:#7cd4ff}' +
  '.today{stroke:#fff;stroke-width:1.5}' +
  '@media (prefers-color-scheme: light){.tile{fill:#f0f0f0}.lab{fill:#666}.val{fill:#111}' +
  '.bar{fill:#2f95e6}.l0{fill:#e3e3e3}.l1{fill:#b9dcf7}.l2{fill:#78bdf0}' +
  '.l3{fill:#2f95e6}.l4{fill:#0b6cc2}.today{stroke:#111}' +
  '.cap{fill:#777}.div{stroke:#d6d6d6}.g1{stop-color:#0b6cc2}.g2{stop-color:#4fb6f5}}</style>'

// Das Svg-Element bekommt Breite und Höhe ausdrücklich: ohne sie zeichnet die App es winzig.
const svg = (height: number, body: string, width = WIDTH) => ({
  source:
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">${STYLE}${body}</svg>`,
  width,
  height,
})

// 2543.68 -> "$2,543.68"
const dollars = (n: number) => {
  const cents = Math.round(n * 100)
  return `$${groupDigits(Math.floor(cents / 100))}.${String(cents % 100).padStart(2, '0')}`
}

// Übersicht wie früher, kompakt: Kacheln in zwei Reihen (4 + 3), darunter Kästchen
// (Spalten = Wochen, Mo oben) über die volle Breite.
const overview = (stats: Stats, days: Record<string, number>, nowMs: number) => {
  const rows: [string, string][][] = [
    [
      ['Sessions', groupDigits(stats.sessions)],
      ['Messages', groupDigits(stats.messages)],
      ['Total tokens', short(stats.tokens)],
      ['Cost (API prices)', dollars(stats.cost)],
    ],
    [
      ['Active days', groupDigits(stats.activeDays)],
      ['Peak hour', stats.peakHour === null ? '–' : hourLabel(stats.peakHour)],
      ['Favorite model', stats.models[0] ? modelName(stats.models[0][0]) : '–'],
    ],
  ]
  let body = rows
    .map((tiles, row) => {
      const tileWidth = (WIDTH - (tiles.length - 1) * 8) / tiles.length
      return tiles
        .map(([label, value], i) => {
          const x = i * (tileWidth + 8)
          const y = row * 44
          return (
            `<rect class="tile" x="${x}" y="${y}" width="${tileWidth}" height="38" rx="8"/>` +
            `<text class="lab" x="${x + 12}" y="${y + 15}">${label}</text>` +
            `<text class="val" x="${x + 12}" y="${y + 32}">${escape(value)}</text>`
          )
        })
        .join('')
    })
    .join('')

  const now = new Date(nowMs)
  const today = localDay(nowMs)
  const weekday = (now.getDay() + 6) % 7
  const max = Math.max(1, ...Object.values(days))
  const top = 92
    for (let week = 0; week < WEEKS; week++) {
    for (let row = 0; row < 7; row++) {
      const back = (WEEKS - 1 - week) * 7 + weekday - row
      if (back < 0) continue
      const day = localDay(
        new Date(now.getFullYear(), now.getMonth(), now.getDate() - back).getTime(),
      )
      const n = days[day] ?? 0
      const level = n === 0 ? 0 : Math.max(1, Math.ceil((n / max) * 4))
      const ring = day === today ? ' today' : ''
      body +=
        `<rect class="l${level}${ring}" x="${week * (CELL + GAP)}" ` +
        `y="${top + row * (CELL + GAP)}" width="${CELL}" height="${CELL}" rx="2">` +
        `<title>${dayLabel(day)}: ${short(n)} tokens</title></rect>`
    }
  }


  return svg(top + 7 * (CELL + GAP) - GAP, body)
}

// Modelle: ein Balken pro Modell, Anteil an allen Tokens.
const models = (stats: Stats) => {
  const rows = stats.models.length ? stats.models : [['–', 0] as [string, number]]
  const body = rows
    .map(([id, n], i) => {
      const y = i * 34
      const share = stats.tokens ? n / stats.tokens : 0
      return (
        `<rect class="tile" x="0" y="${y}" width="${WIDTH}" height="28" rx="7"/>` +
        `<rect class="bar" x="0" y="${y}" width="${Math.max(4, share * WIDTH)}" height="28" rx="7" opacity="0.35"/>` +
        `<text class="val" style="font-size:14px" x="12" y="${y + 19}">${escape(modelName(id))}</text>` +
        `<text class="lab" x="${WIDTH - 12}" y="${y + 19}" text-anchor="end">` +
        `${short(n)} · ${share > 0 && share < 0.01 ? '&lt;1' : Math.round(share * 100)} %</text>`
      )
    })
    .join('')

  return svg(rows.length * 34 - 6, body)
}

// Zugeklappte Leiste: leuchtende Balken der letzten 14 Tage, daneben Tokens, alte Zählweise,
// Kosten, heute.
const STRIP_DAYS = 14
const strip = (stats: Stats, days: Record<string, number>, nowMs: number) => {
  const now = new Date(nowMs)
  const recent = Array.from({ length: STRIP_DAYS }, (_, i) =>
    localDay(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - (STRIP_DAYS - 1 - i)).getTime(),
    ),
  )
  const max = Math.max(1, ...recent.map(day => days[day] ?? 0))
  let body =
    '<defs><linearGradient id="bars" x1="0" y1="1" x2="0" y2="0">' +
    '<stop offset="0" class="g1"/><stop offset="1" class="g2"/></linearGradient>' +
    '<filter id="glow" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="2" result="b"/>' +
    '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'
  body += recent
    .map((day, i) => {
      const n = days[day] ?? 0
      const x = 2 + i * 9
      const title = `<title>${dayLabel(day)}: ${short(n)} tokens</title>`
      if (n === 0) return `<rect class="l0" x="${x}" y="27" width="6" height="3" rx="1.5">${title}</rect>`
      const height = Math.max(4, Math.round((n / max) * 24))
      const isToday = i === STRIP_DAYS - 1
      return (
        `<rect x="${x}" y="${30 - height}" width="6" height="${height}" rx="2" fill="url(#bars)" ` +
        `opacity="${(0.4 + 0.6 * (n / max)).toFixed(2)}"${isToday ? ' filter="url(#glow)"' : ''}>` +
        `${title}</rect>`
      )
    })
    .join('')

  const groups: [string, string][] = [
    ['TOKENS', short(stats.tokens)],
    ['OLD COUNT', short(stats.rawTokens)],
    ['COST', dollars(stats.cost)],
    ['TODAY', short(days[localDay(nowMs)] ?? 0)],
  ]
  let x = STRIP_DAYS * 9 + 16
  body += `<line class="div" x1="${x - 8}" y1="4" x2="${x - 8}" y2="30"/>`
  for (const [label, value] of groups) {
    body +=
      `<text class="cap" x="${x}" y="12">${label}</text>` +
      `<text class="val" style="font-size:15px" x="${x}" y="30">${escape(value)}</text>`
    // Breite geschätzt: Satzzeichen und Leerzeichen sind schmal, Großbuchstaben mit Sperrung breit.
    const valueWidth = [...value].reduce((w, c) => w + ('.,  '.includes(c) ? 4.5 : 9), 0)
    x += Math.max(label.length * 7.2, valueWidth) + 18
  }

  return svg(34, body, Math.round(x))
}

async function refresh($: EngineInterface) {
  const script = `${$.plugin.root}/bin/count.py`
  const { exitCode, stdout } = await $.process.run(['/usr/bin/python3', '-I', script], {
    timeoutMs: 120_000,
  })
  if (exitCode === 0) {
    await $.state.set(USAGE, JSON.parse(stdout) as Usage)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'tokens',
      description: 'Show the token stats above the prompt again',
    })
    void refresh($)
    $.clock.every(REFRESH_MS, () => void refresh($))

    return started
  })

  on('command.run', { command: 'tokens' }, async $ => {
    await $.state.set(COLLAPSED, false)

    return { text: 'Token stats expanded.' }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    void refresh($)

    return done
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { value: usage } = await $.state.get(USAGE)
    // Ohne `all` oder `rawTokens` stammt der Wert noch von der Version davor: neu zählen abwarten.
    if (e.props.hasSurvey || usage == null || !('all' in usage) || !('rawTokens' in usage.all)) {
      return next(e)
    }

    const { value: view = 'overview' } = await $.state.get(VIEW)
    const { value: range = 'all' } = await $.state.get(RANGE)
    const { value: isCollapsed = false } = await $.state.get(COLLAPSED)
    const now = await $.clock.now()
    const today = usage.days[localDay(now)] ?? 0
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui

    if (!('Svg' in ui)) {
      return (
        <Box>
          <Text bold>Σ {short(usage.all.tokens)} Tokens </Text>
          <Text dimColor>({groupDigits(usage.all.tokens)}) · today {short(today)}</Text>
        </Box>
      )
    }

    const { Svg } = ui

    if (isCollapsed) {
      const bar = strip(usage.all, usage.days, now)
      return (
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Svg
            source={bar.source}
            width={bar.width}
            height={bar.height}
            isInteractive
            alt={`${short(usage.all.tokens)} tokens (old count ${short(usage.all.rawTokens)}), ${dollars(usage.all.cost)}, today ${short(today)}`}
          />
          <Button key="open" label="Stats" onPress={() => $.state.set(COLLAPSED, false)} />
        </Box>
      )
    }

    const stats = range === 'all' ? usage.all : usage.d30
    const card = view === 'overview' ? overview(stats, usage.days, now) : models(stats)

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="row" gap={1}>
            <Button
              key="overview"
              label="Overview"
              variant={view === 'overview' ? 'primary' : 'secondary'}
              onPress={() => $.state.set(VIEW, 'overview')}
            />
            <Button
              key="models"
              label="Models"
              variant={view === 'models' ? 'primary' : 'secondary'}
              onPress={() => $.state.set(VIEW, 'models')}
            />
          </Box>
          <Box flexDirection="row" gap={1}>
            <Button
              key="all"
              label="All"
              variant={range === 'all' ? 'primary' : 'secondary'}
              onPress={() => $.state.set(RANGE, 'all')}
            />
            <Button
              key="d30"
              label="30d"
              variant={range === 'd30' ? 'primary' : 'secondary'}
              onPress={() => $.state.set(RANGE, 'd30')}
            />
            <Button key="close" label="–" onPress={() => $.state.set(COLLAPSED, true)} />
          </Box>
        </Box>
        <Box flexDirection="row" justifyContent="center" marginTop="md">
          <Svg
            source={card.source}
            width={card.width}
            height={card.height}
            isInteractive
            alt={`${short(stats.tokens)} tokens, ${stats.sessions} sessions, ${stats.activeDays} active days`}
          />
        </Box>
      </Box>
    )
  })
}
