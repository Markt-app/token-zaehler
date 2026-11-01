# Wertet alle Claude-Code-Verläufe aus (~/.claude/projects/**/*.jsonl).
# Jede API-Antwort wird einmal gezählt (nach message.id) und im Ledger gemerkt,
# damit sie auch nach dem automatischen Löschen alter Verläufe mitzählt.
# Ausgabe: {"days": {"YYYY-MM-DD": n}, "all": Stats, "d30": Stats} (lokale Zeit).
import collections, datetime, fcntl, glob, json, os

LEDGER = os.path.expanduser('~/.claude/token-zaehler/ledger.json')

# Mehrere Chats zählen gleichzeitig: immer nur ein Lauf auf einmal, sonst schreiben
# sich die Läufe gegenseitig halbe Dateien und das Ledger geht verloren.
os.makedirs(os.path.dirname(LEDGER), exist_ok=True)
lock = open(LEDGER + '.lock', 'w')
fcntl.flock(lock, fcntl.LOCK_EX)
FIELDS = ('input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens')

# API-Preise in $ pro 1 Mio Tokens: Input, Output, Cache-Lesen (claude-api-Skill,
# Stand 2026-10-06). Cache-Schreiben kostet 1,25x Input (5 Min) bzw. 2x (1 Std).
# Ein Modell, das hier fehlt, zählt mit 0 $.
PRICES = {
    'claude-fable-5-1': (10, 50, 0.25),
    'claude-fable-5': (10, 50, 1.00),
    'claude-opus-5-5': (4, 20, 0.20),
    'claude-opus-5': (5, 25, 0.50),
    'claude-opus-4-8': (5, 25, 0.50),
    'claude-opus-4-7': (5, 25, 0.50),
    'claude-opus-4-6': (5, 25, 0.50),
    'claude-sonnet-5-5': (2, 10, 0.20),
    'claude-sonnet-5': (2, 10, 0.20),
    'claude-sonnet-4-6': (3, 15, 0.30),
    'claude-haiku-5-5': (0.10, 0.50, 0.01),
    'claude-haiku-4-5': (1, 5, 0.10),
}


def cost(model, usage):
    if model not in PRICES:
        return 0.0
    price_in, price_out, price_read = PRICES[model]
    created = usage.get('cache_creation') or {}
    write_1h = created.get('ephemeral_1h_input_tokens') or 0
    write_5m = (usage.get('cache_creation_input_tokens') or 0) - write_1h
    dollars = ((usage.get('input_tokens') or 0) * price_in
               + (usage.get('output_tokens') or 0) * price_out
               + (usage.get('cache_read_input_tokens') or 0) * price_read
               + write_1h * 2 * price_in
               + write_5m * 1.25 * price_in) / 1e6
    return dollars * (2 if usage.get('speed') == 'fast' else 1)


# Eintrag pro Antwort: [Tag, Tokens, Stunde, Modell, Sitzung, Kosten in $, Zeilen].
# Zeilen: wie oft die Antwort im Verlauf steht; die alte Anzeige zählte jede Zeile.
try:
    with open(LEDGER) as f:
        stored = json.load(f)
    ledger = {k: v for k, v in stored.items() if isinstance(v, list) and len(v) == 7}
except (OSError, ValueError):
    stored, ledger = None, {}

# Pro Datei die schon gelesene Länge merken: jeder Lauf liest nur Neues.
OFFSETS = os.path.expanduser('~/.claude/token-zaehler/offsets.json')
try:
    with open(OFFSETS) as f:
        offsets = json.load(f)
except (OSError, ValueError):
    offsets = {}
# Ohne lesbares Ledger fehlt alles schon Gelesene: alle Verläufe von vorn lesen.
if stored is None:
    stored, offsets = {}, {}
# Alte Einträge ohne Kosten oder Zeilen: alles noch einmal von vorn lesen.
# Einträge mit Kosten bleiben (auch aus gelöschten Verläufen), ihre Zeilen zählen neu.
if len(ledger) < len(stored):
    ledger = {k: v[:6] + [0] for k, v in stored.items() if isinstance(v, list) and len(v) >= 6}
    offsets = {}

for path in glob.glob(os.path.expanduser('~/.claude/projects/**/*.jsonl'), recursive=True):
    start = offsets.get(path, 0)
    if os.path.getsize(path) < start:
        start = 0
    with open(path, 'rb') as f:
        f.seek(start)
        chunk = f.read()
    # Nur ganze Zeilen; eine halb geschriebene kommt beim nächsten Lauf dran.
    chunk = chunk[:chunk.rfind(b'\n') + 1]
    offsets[path] = start + len(chunk)
    for line in chunk.decode('utf-8', errors='ignore').splitlines():
        if '"usage"' not in line:
            continue
        try:
            entry = json.loads(line)
            message = entry.get('message')
            if not isinstance(message, dict) or not message.get('usage') or not message.get('id'):
                continue
            if message['id'] in ledger:
                ledger[message['id']][6] += 1
                continue
            stamp = datetime.datetime.fromisoformat(entry['timestamp'].replace('Z', '+00:00')).astimezone()
        except (ValueError, KeyError, AttributeError):
            continue
        ledger[message['id']] = [
            stamp.date().isoformat(),
            sum(message['usage'].get(k) or 0 for k in FIELDS),
            stamp.hour,
            message.get('model') or '',
            entry.get('sessionId') or '',
            round(cost(message.get('model') or '', message['usage']), 6),
            1,
        ]

with open(LEDGER + '.tmp', 'w') as f:
    json.dump(ledger, f, separators=(',', ':'))
os.replace(LEDGER + '.tmp', LEDGER)
with open(OFFSETS + '.tmp', 'w') as f:
    json.dump({p: n for p, n in offsets.items() if os.path.exists(p)}, f)
os.replace(OFFSETS + '.tmp', OFFSETS)


def stats(entries):
    days, hours, models, sessions = collections.Counter(), collections.Counter(), collections.Counter(), set()
    for day, tokens, hour, model, session, *_ in entries:
        days[day] += tokens
        hours[hour] += tokens
        if model and not model.startswith('<'):
            models[model] += tokens
        if session:
            sessions.add(session)
    return {
        'sessions': len(sessions),
        'messages': len(entries),
        'tokens': sum(days.values()),
        'rawTokens': sum(e[1] * max(e[6], 1) for e in entries),
        'cost': round(sum(e[5] for e in entries), 2),
        'activeDays': len(days),
        'peakHour': hours.most_common(1)[0][0] if hours else None,
        'models': models.most_common(),
    }


cutoff = (datetime.date.today() - datetime.timedelta(days=29)).isoformat()
entries = list(ledger.values())
days = collections.Counter()
for day, tokens, *_ in entries:
    days[day] += tokens
print(json.dumps({
    'days': dict(sorted(days.items())),
    'all': stats(entries),
    'd30': stats([e for e in entries if e[0] >= cutoff]),
}))
