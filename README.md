# Token-Zähler

Ein Mod für Claude Code (Desktop-App und Terminal), der über dem Eingabefeld deinen gesamten Token-Verbrauch zeigt – wie die alte Claude-Statistik.

- **Leiste:** leuchtende Balken der letzten 14 Tage, dazu Tokens gesamt, alte Zählweise, Kosten zu API-Preisen und heute.
- **Statistik-Karte:** Sitzungen, Nachrichten, Tokens, Kosten, aktive Tage, Spitzenstunde, Lieblingsmodell und eine Tages-Kästchen-Ansicht. Umschalten zwischen Übersicht/Modelle und Alle/30 Tage.
- Aktualisiert sich alle 30 Sekunden und nach jeder Antwort. `/tokens` klappt die Statistik wieder auf.

## Installieren

In einer Terminal-Sitzung von Claude Code:

```
/plugin install token-zaehler --marketplace Markt-app/token-zaehler
```

Aus der Shell:

```bash
claude plugin install token-zaehler --marketplace Markt-app/token-zaehler
```

In der Desktop-App (dort läuft `/plugin` nicht): auf **+** neben dem Eingabefeld klicken, dann **Plugins**, **Add marketplace** mit `Markt-app/token-zaehler`, dann **Add plugin**.

Danach in einem neuen Chat öffnen.

## Wie gezählt wird

`bin/count.py` liest die lokalen Verläufe in `~/.claude/projects/` und zählt jede API-Antwort genau einmal (nach ihrer ID): Input, Output, Cache-Schreiben und Cache-Lesen. Gemerkt wird alles in `~/.claude/token-zaehler/`, damit auch Antworten aus später gelöschten Verläufen weiter mitzählen.

**ALT** ist die frühere Zählweise: Claude Code schreibt eine Antwort als mehrere Zeilen in den Verlauf, und jede Zeile wurde einzeln gezählt – rund 2,7-mal so viel.

Die Kosten sind mit den öffentlichen API-Preisen gerechnet, nicht mit einem Abo. Es wird nichts verschickt; alles bleibt auf deinem Rechner.

Braucht macOS mit `/usr/bin/python3`.
