# Checkliste: Alle Wertpapiere — 1:1 PP SecurityListView

Quelle: PP Source Code (SecuritiesTable.java, SecurityContextMenu.java, SecurityListView.java, alle 6 Detail-Panes)

---

## A. TOOLBAR (SecurityListView.addButtons)

- [ ] A1. Suchfeld (300px) — sucht in: Name, ISIN, Symbol, WKN, Notiz (case-insensitive)
- [ ] A2. "Neues Wertpapier anlegen" Dropdown-Button mit Plus-Icon:
  - [ ] A2a. Neues Anlageinstrument
  - [ ] A2b. Neue Kryptowährung
  - [ ] A2c. Neuer Wechselkurs
  - [ ] A2d. Neuer Verbraucherpreisindex
  - [ ] A2e. Separator
  - [ ] A2f. CSV importieren
  - [ ] A2g. Separator
  - [ ] A2h. Leeres Instrument (manuell)
- [ ] A3. Filter-Dropdown (Icon wechselt aktiv/inaktiv)
- [ ] A4. Export CSV Button
- [ ] A5. Spalten ein/ausblenden Button (Config-Icon)

---

## B. FILTER (SecurityListView.FilterDropDown)

- [ ] B1. Inaktive ausblenden (Bit 1) — exklusiv mit B2
- [ ] B2. Nur Inaktive (Bit 7) — exklusiv mit B1
- [ ] B3. Nur Wertpapiere (Bit 2) — exklusiv mit B4
- [ ] B4. Nur Wechselkurse (Bit 3) — exklusiv mit B3
- [ ] B5. Anteile ≠ 0 (Bit 4) — exklusiv mit B6
- [ ] B6. Anteile = 0 (Bit 5) — exklusiv mit B5
- [ ] B7. Kursalarm überschritten (Bit 6)

---

## C. SPALTEN — Stammdaten (SecuritiesTable.addMasterDataColumns)

- [ ] C1. Name — 400px, links, sichtbar, editierbar, mit Logo/Icon
- [ ] C2. Notiz (NoteColumn) — sichtbar, editierbar
- [ ] C3. ISIN — sichtbar, editierbar
- [ ] C4. Symbol — sichtbar, editierbar
- [ ] C5. WKN — sichtbar, editierbar
- [ ] C6. Währung — 60px, versteckt, nicht editierbar
- [ ] C7. Zielwährung — 60px, versteckt, nicht editierbar
- [ ] C8. Inaktiv — 40px, versteckt, editierbar (Checkbox)

---

## D. SPALTEN — Kurs & Änderung

- [ ] D1. Letzter Kurs — 60px, rechts, sichtbar
- [ ] D2. Δ Kurs % (Change on Previous %) — 80px, rechts, sichtbar, farbcodiert (grün/rot)
- [ ] D3. Δ Kurs absolut (Change on Previous Amount) — 80px, rechts, sichtbar, farbcodiert
- [ ] D4. Datum letzter Kurs — 80px, links, sichtbar, Warn-Hintergrund wenn >7 Tage alt
- [ ] D5. Datum letzter historischer Kurs — 80px, links, sichtbar, Warn-Hintergrund wenn >7 Tage
- [ ] D6. Quote Change (Kursänderung über Berichtszeitraum) — 80px, rechts, versteckt

---

## E. SPALTEN — Technische Analyse

- [ ] E1. Abstand vom gleitenden Durchschnitt (Distance from Moving Average)
- [ ] E2. Abstand vom Allzeithoch (Distance from All-Time High)
- [ ] E3. Kursspanne (Quote Range)

---

## F. SPALTEN — Taxonomie (dynamisch)

- [ ] F1. Für jede Taxonomie im Client eine eigene Spalte — alle versteckt, nicht editierbar

---

## G. SPALTEN — Attribute (dynamisch)

- [ ] G1. Dynamische Attribut-Spalten — editierbar (AttributeColumn.createFor)

---

## H. SPALTEN — Dividenden (dynamisch)

- [ ] H1. Dynamische Dividenden-Spalten (DividendPaymentColumns.createFor)

---

## I. SPALTEN — Kursfeed (SecuritiesTable.addQuoteFeedColumns)

- [ ] I1. Historischer Kursfeed — 200px, versteckt
- [ ] I2. Aktueller Kursfeed — 200px, versteckt
- [ ] I3. Feed-URL Historisch — 200px, versteckt
- [ ] I4. Feed-URL Aktuell — 200px, versteckt

---

## J. SPALTEN — Datenqualität (SecuritiesTable.addDataQualityColumns)

- [ ] J1. Datum erster historischer Kurs — 80px, sichtbar
- [ ] J2. Vollständigkeit (%) — 80px, rechts, versteckt
- [ ] J3. Erwartete Anzahl Kurse — 80px, rechts, versteckt
- [ ] J4. Tatsächliche Anzahl Kurse — 80px, rechts, versteckt
- [ ] J5. Fehlende Kurse — 80px, rechts, versteckt

---

## K. KONTEXTMENÜ (SecurityContextMenu — exakte Reihenfolge)

- [ ] K1. Kaufen...
- [ ] K2. Verkaufen...
- [ ] K3. Dividende...
- [ ] K4. Steuern...
- [ ] K5. Steuererstattung...
- [ ] K6. Aktiensplit
- [ ] K7. Ereignis hinzufügen
- [ ] K8. --- Separator (nur wenn >1 aktive Depots) ---
- [ ] K9. Umbuchung (nur wenn >1 aktive Depots)
- [ ] K10. --- Separator ---
- [ ] K11. Einlieferung...
- [ ] K12. Auslieferung...
- [ ] K13. Sparplan anlegen
- [ ] K14. --- Separator ---
- [ ] K15. Wertpapier bearbeiten (Strg+E)
- [ ] K16. --- Separator ---
- [ ] K17. Lesezeichen (Bookmarks Untermenü)
- [ ] K18. --- Separator (nur wenn Wertpapier ausgewählt) ---
- [ ] K19. Aktivieren / Deaktivieren (Toggle)
- [ ] K20. Löschen (nur wenn keine Transaktionen)

---

## L. KEYBOARD SHORTCUTS

- [ ] L1. Strg+E → Wertpapier bearbeiten Dialog öffnen
- [ ] L2. Tabellensuche mit Tippen (SWT native)

---

## M. TABELLE — Allgemeine Features

- [ ] M1. Mehrzeilenauswahl (Multi-Select)
- [ ] M2. Spalten sortieren (Klick auf Header, ASC/DESC Toggle)
- [ ] M3. Spalten ein/ausblenden (Rechtsklick auf Header)
- [ ] M4. Spaltenbreite anpassen (Drag am Separator)
- [ ] M5. Spaltenreihenfolge ändern (Drag & Drop)
- [ ] M6. Spalten-Sichtbarkeit persistent (localStorage)
- [ ] M7. Copy/Paste Support
- [ ] M8. Tooltips auf Zellen
- [ ] M9. Inaktive Wertpapiere grau dargestellt

---

## N. DETAIL-TAB 1: Diagramm (SecurityPriceChartPane)

- [ ] N1. Tab-Label: "Diagramm"
- [ ] N2. Kurs-Chart (Linie) mit Zeitachse
- [ ] N3. Intervall-Optionen (1M, 3M, 6M, 1J, 2J, 5J, 10J, Max)
- [ ] N4. Intervall-Auswahl persistent
- [ ] N5. Detail-Sidebar rechts (Wertpapierdetails)

---

## O. DETAIL-TAB 2: Historische Kurse (HistoricalPricesPane)

- [ ] O1. Tab-Label: "Historische Kurse"
- [ ] O2. Spalte: Datum — 80px, sortierbar (default absteigend), editierbar
- [ ] O3. Spalte: Kurs — 80px, rechts, sortierbar, editierbar
- [ ] O4. Warn-Hintergrund bei Lücken (fehlende Handelstage zwischen Datumswerten)
- [ ] O5. Toolbar: Export-Button
- [ ] O6. Kontextmenü: Kurs hinzufügen
- [ ] O7. Kontextmenü: Separator
- [ ] O8. Kontextmenü: Kurs löschen
- [ ] O9. Kontextmenü: Alle Kurse löschen
- [ ] O10. Kontextmenü: Separator + weitere Optionen (QuotesContextMenu)

---

## P. DETAIL-TAB 3: Umsätze (TransactionsPane)

- [ ] P1. Tab-Label: "Umsätze"
- [ ] P2. Toolbar: Suche (Text)
- [ ] P3. Toolbar: Separator
- [ ] P4. Toolbar: Typ-Filter Dropdown
- [ ] P5. Toolbar: Export CSV
- [ ] P6. Toolbar: Spalten ein/ausblenden
- [ ] P7. Spalten: Datum, Typ, Betrag, Gebühren (versteckt), Steuern (versteckt), Saldo, Wertpapier, ISIN (versteckt), Symbol (versteckt), WKN (versteckt), Stück, Kurs, Gegenkonto, Notiz, Ex-Datum (versteckt), Quelle
- [ ] P8. Kontextmenü: Bearbeiten (Strg+E), Duplizieren (Strg+D), Separator, Löschen

---

## Q. DETAIL-TAB 4: Trades (TradesPane)

- [ ] Q1. Tab-Label: "Trades"
- [ ] Q2. Toolbar: Export CSV
- [ ] Q3. Toolbar: Spalten ein/ausblenden
- [ ] Q4. Spalten: Startdatum, Enddatum, Stück, Einstandswert, Verkaufswert, Gewinn/Verlust, Gewinn %, Haltedauer, IRR (interner Zinsfuß)
- [ ] Q5. Offene Trades (ohne Enddatum) vs. geschlossene Trades
- [ ] Q6. FIFO-basierte Trade-Berechnung
- [ ] Q7. Währungsumrechnung

---

## R. DETAIL-TAB 5: Ereignisse (SecurityEventsPane)

- [ ] R1. Tab-Label: "Ereignisse"
- [ ] R2. Spalte: Datum — 80px, editierbar (nur user-editierbare Events)
- [ ] R3. Spalte: Typ — 120px, nicht editierbar
- [ ] R4. Spalte: Zahltag — 80px (nur für DividendEvent)
- [ ] R5. Spalte: Betrag — 80px (nur für DividendEvent)
- [ ] R6. Spalte: Details — 300px, editierbar (nur user-editierbare Events)
- [ ] R7. Toolbar: Export-Button
- [ ] R8. Kontextmenü: Ereignis hinzufügen
- [ ] R9. Kontextmenü: Separator
- [ ] R10. Kontextmenü: Löschen

---

## S. DETAIL-TAB 6: Datenqualität (HistoricalPricesDataQualityPane)

- [ ] S1. Tab-Label: "Datenqualität"
- [ ] S2. Metrik: Vollständigkeit (Prozent)
- [ ] S3. Metrik: Handelskalender
- [ ] S4. Metrik: Prüfzeitraum (von–bis)
- [ ] S5. Tabelle links: Fehlende Kurse (Datum-Spalte, 300px, Feiertags-Annotation)
- [ ] S6. Tabelle rechts: Unerwartete Kurse (Datum-Spalte, 300px, Feiertags-Annotation)
- [ ] S7. Kontextmenü beider Tabellen: Kurs hinzufügen

---

## GESAMT: 100+ Einzelpunkte

### Priorität für Implementierung:
1. Spalten C1–J5 (alle Spalten komplett)
2. Kontextmenü K1–K20 (vollständig)
3. Toolbar A1–A5 (komplett)
4. Filter B1–B7 (komplett)
5. Tabellen-Features M1–M9
6. Detail-Tabs N–S (alle 6 komplett)
7. Keyboard Shortcuts L1–L2
