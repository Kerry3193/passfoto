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
