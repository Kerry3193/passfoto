# PassFoto – Passfoto-App fürs Handy

Web-App (PWA) für iPhone und Android. Biometrische Passfotos aufnehmen, automatisch zuschneiden und drucken.
Standardformat: **Türkei 50 × 60 mm** (Pasaport/Kimlik). Alle Fotos werden nur auf dem Gerät verarbeitet.

## Funktionen
- **Formate:** Türkei 50×60 (Pass/Kimlik, Führerschein/Aufenthalt), Deutschland/EU 35×45, Schengen, UK, USA 2×2″, Kanada, China, Indien, eigenes Format
- **Kamera mit Live-Führung:** Rahmen und Kopf-Oval im Zielformat, Hinweise wie „Näher“, „Kopf gerade“ oder „Mehr Licht“, Timer 3/10 s, Auto-Auslöser, Front-/Rückkamera
- **Galerie-Import**
- **KI-Zuschnitt:** Gesichtserkennung, Augen werden waagerecht ausgerichtet, Kopfhöhe und Position nach Norm
- **Hintergrund ersetzen:** Weiß (Türkei), Hellgrau, Hellblau oder eine eigene Farbe, mit einstellbarer Kantenweichheit
- **Bearbeiten:** Verschieben, Pinch-Zoom und Drehen mit zwei Fingern, Regler, Hilfslinien (Scheitel/Kinn/Mitte)
- **Bildanpassung:** Helligkeit, Kontrast, Sättigung, Wärme, Schärfe, Schwarz-Weiß, Auto-Optimierung
- **Automatische Prüfung:** Kopfhöhe in mm, Zentrierung, Neigung, Blickrichtung, Augen offen, Mund geschlossen, Ausleuchtung, Belichtung, Hintergrund, Druckauflösung
- **Export:** Einzelfoto als JPG (300/600 dpi), Druckbogen 10×15, 13×18, A5 und A4 als JPG oder PDF in Originalgröße mit Schnittlinien, Teilen, direkt drucken
- **Verlauf** (lokal gespeichert), **Deutsch/Türkisch**, **offline nutzbar**, installierbar auf dem Home-Bildschirm

## Lokal starten
```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Aufs Handy bringen
Die Kamera funktioniert im Browser nur über **HTTPS**. Den Ordner auf einen beliebigen statischen Hoster legen:
- **Netlify Drop:** https://app.netlify.com/drop – Ordner per Drag & Drop hochladen
- **GitHub Pages:** Repo anlegen, Dateien pushen, Pages aktivieren
- **Vercel / Cloudflare Pages:** ebenfalls ohne Build-Schritt möglich

Dann die URL am Handy öffnen:
- **iPhone (Safari):** Teilen → „Zum Home-Bildschirm“
- **Android (Chrome):** „App installieren“

Beim ersten Foto werden die KI-Modelle (ca. 30 MB) geladen und danach offline zwischengespeichert.

## Drucken
Den **Bogen 10×15 cm als JPG** im Fotoautomaten, in der Drogerie oder online bestellen. Beim Drucken am Drucker immer **„Originalgröße / 100 %“** wählen.
Die Fotos auf Fotopapier drucken und an den Schnittlinien ausschneiden.

> Hinweis: Die automatische Prüfung ist eine Hilfe. Die endgültige Entscheidung über die Annahme trifft die Behörde (z. B. Nüfus Müdürlüğü, Konsulat).

## Technik
Reines HTML/CSS/JS ohne Build. MediaPipe Tasks Vision (Face Landmarker und Selfie-Multiclass-Segmentierung) liegt lokal in `vendor/`.

## Funktionsliste und Teststand
Getestet am 24.11.2026 in Chrome (Handy-Emulation), WebKit und Mobile Safari (iOS 18.6, Simulator), lokal und über die GitHub-Pages-Adresse.

| # | Funktion | Status |
|---|---|---|
| 1 | Türkei 50×60 mm (Pass/Kimlik, Führerschein/Aufenthalt) als Standard | ✅ getestet (Kopf 45 mm, Soll 42–48 mm) |
| 2 | Weitere Formate (DE/EU, Schengen, UK, USA, CA, CN, IN) und eigenes Format | ✅ eingebaut |
| 3 | Galerie-Import | ✅ getestet |
| 4 | Kamera vorne/hinten mit Rahmen und Kopf-Oval | ✅ getestet (simulierte Kamera) |
| 5 | Live-Hinweise (näher, weiter weg, links, rechts, höher, tiefer, gerade, Blick, Licht) | ✅ getestet (simulierte Kamera) |
| 6 | Auto-Auslöser und Timer 3/10 s | ✅ getestet (simulierte Kamera) |
| 7 | KI-Gesichtserkennung und automatischer Zuschnitt mit Augen-Ausrichtung | ✅ getestet |
| 8 | Hintergrund ersetzen (Weiß, Farben, eigene Farbe, Kantenweichheit) | ✅ getestet |
| 9 | Verschieben, Pinch-Zoom und Drehen per Touch, Regler, Hilfslinien | ✅ getestet |
| 10 | Helligkeit, Kontrast, Sättigung, Wärme, Schärfe, Schwarz-Weiß, Auto-Optimierung | ✅ getestet |
| 11 | Automatische Prüfung (12 Kriterien) | ✅ getestet |
| 12 | Einzelfoto-JPG mit 300/600 dpi (DPI im Header) | ✅ getestet (1181×1417 px, 600 dpi) |
| 13 | Druckbogen 10×15, 13×18, A5, A4 als JPG/PDF mit Schnittlinien und Anzahl | ✅ getestet (PDF exakt 4×6″) |
| 14 | Teilen und Drucken in Originalgröße | ✅ eingebaut |
| 15 | Verlauf (lokal, IndexedDB) | ✅ getestet (Chrome und Safari) |
| 16 | Deutsch / Türkisch | ✅ getestet |
| 17 | Offline-Nutzung inklusive KI | ✅ getestet |
| 18 | Installierbar (PWA-Manifest, Icons) | ✅ Manifest fehlerfrei |
| – | Test auf einem echten Handy mit echter Kamera | ⏳ steht aus (durch Nutzer) |
