# Orts- und Kartendatenflüsse

Stand: 26. August 2026

PflegeShift speichert ausgewählte Ortsnamen, Adressen und Koordinaten verschlüsselt
in der lokalen SQLCipher-Datenbank. Es gibt keinen PflegeShift-Server für diese
Daten. Die optionale Suche und Kartendarstellung benötigen jedoch Dienste von
Apple, Google oder dem systemseitigen Android-Geocoder.

## Verbindlicher Produktvertrag

- PflegeShift liest keine aktuelle GPS-Position und betreibt weder Vordergrund-
  noch Hintergrundtracking.
- Auf Android kann das Betriebssystem trotzdem eine Vordergrund-
  Standortberechtigung verlangen, bevor eine Adresse geocodiert wird. Expo
  dokumentiert diese Voraussetzung ausdrücklich.
- Eine Eingabe ab drei Zeichen startet nach einer kurzen Verzögerung die
  Online-Adresssuche. Die Eingabe ist deshalb nicht rein lokal.
- Die Auswahl speichert den angezeigten Ortsnamen, optional die Adresse und die
  Koordinaten lokal. Freie Orte können ohne Koordinaten gespeichert werden.
- PflegeShift sendet keine Ortsdaten an einen eigenen Server.

## Datenfluss nach Plattform

| Aktion                        | iOS                                                                                                                                                                 | Android                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Adresse suchen                | Suchtext geht an Apple MapKit (`MKLocalSearchCompleter` und bei Auswahl `MKLocalSearch`).                                                                           | Suchtext geht über `expo-location` an den systemseitigen Geocoder; Ergebnisse werden zur Adressdarstellung rückwärts geocodiert.                 |
| Karte in PflegeShift anzeigen | `react-native-maps` verwendet ohne Google-Provider das native Apple MapKit. Der Kartenbereich und die Zielkoordinaten werden für die Kartendarstellung verarbeitet. | `react-native-maps` verwendet Google Maps. Zielkoordinaten und für den SDK-Betrieb erforderliche technische Daten werden von Google verarbeitet. |
| In Karten-App öffnen          | Nach bewusster Auswahl öffnet PflegeShift Apple Karten mit Ortsname und Koordinaten oder Google Maps mit Koordinaten.                                               | Nach bewusster Auswahl öffnet PflegeShift Google Maps mit Koordinaten.                                                                           |

Google dokumentiert für das Maps SDK auf Android unter anderem die automatische
Erhebung von Geräte-/Request-Metadaten, Crashdaten, IP-Adresse und einem
pseudonymen Maps-SDK-Identifier. Apple dokumentiert für Maps unter anderem
Suchbegriffe, sichtbare Kartengrenzen, Interaktionen sowie Geräte- und
Netzwerkinformationen. Diese Anbieterflüsse sind von der rein lokalen
PflegeShift-Datenhaltung zu unterscheiden.

## Technische Grenzen

- Kein Aufruf von `getCurrentPositionAsync`, Location-Watching, Geofencing oder
  Hintergrund-Location.
- Kein Google-Maps-Provider und kein Google-Maps-API-Key im iOS-Build; die
  eingebettete iOS-Karte verwendet Apple MapKit.
- Die Android-Kartenfunktion bleibt bis zur ausdrücklichen Wiederaufnahme und
  Geräteabnahme pausiert.
- Das Öffnen einer externen Karten-App ist eine bewusste Nutzeraktion und kein
  automatischer Export im Hintergrund.

## Release- und Store-Pflichten

Vor jeder Store-Freigabe müssen die Apple-App-Privacy- und Google-Play-
Data-Safety-Angaben gegen den tatsächlich signierten Binärstand geprüft werden.
Diese technische Dokumentation ersetzt keine öffentliche Datenschutzerklärung
und keine rechtliche Prüfung.

Aktuelle Primärquellen:

- [Expo SDK 57: Location](https://docs.expo.dev/versions/v57.0.0/sdk/location/)
- [Apple Maps & Privacy](https://www.apple.com/legal/privacy/data/en/apple-maps/)
- [Apple MapKit: `queryFragment`](https://developer.apple.com/documentation/mapkit/mklocalsearchcompleter/queryfragment)
- [react-native-maps: Provider-Vertrag](https://github.com/react-native-maps/react-native-maps/blob/master/docs/mapview.md)
- [Google Maps SDK for Android: Data disclosure](https://developers.google.com/maps/documentation/android-sdk/play-data-disclosure)
- [Google Privacy Policy](https://policies.google.com/privacy)
