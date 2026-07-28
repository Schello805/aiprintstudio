# Checkliste für eine Veröffentlichung im Mac App Store

Diese Übersicht ist eine technische Projektcheckliste und keine Rechtsberatung.
Pflichten hängen unter anderem vom Sitz des Anbieters, dem Vertriebsgebiet und
dem Geschäftsmodell ab. Rechtlich verbindliche Texte sollten vor dem Verkauf
fachkundig geprüft werden.

## Vor einer Einreichung zwingend klären

- **Impressum vervollständigen:** Die App enthält derzeit nur einen Platzhalter.
  Vor einem öffentlichen oder kommerziellen Release müssen die zutreffenden
  Anbieter- und Kontaktdaten eingesetzt werden.
- **Datenschutzerklärung veröffentlichen:** In App Store Connect ist eine
  öffentlich erreichbare Datenschutz-URL erforderlich. Die Erklärung muss die
  lokale Verarbeitung, die optionale OpenAI-Übertragung, die Updateprüfung über
  GitHub und alle eingebundenen Drittanbieter korrekt beschreiben.
- **App-Privacy-Angaben ausfüllen:** Apples Datenschutzfragen müssen auch das
  Verhalten eingebundener Bibliotheken und externer Partner berücksichtigen.
  Die Antworten müssen mit App und Datenschutzerklärung übereinstimmen.
- **EU-Händlerstatus erklären:** Für die Verfügbarkeit in der EU verlangt Apple
  eine Einstufung nach dem Digital Services Act. Bei einem kostenpflichtigen
  Angebot ist regelmäßig mit einem Händlerstatus zu rechnen. Apple verlangt
  dann verifizierte und im EU-Store angezeigte Kontaktdaten.
- **Lizenzen und Hinweise beilegen:** Die Hinweise zu Electron, React, Three.js,
  Sharp, JSZip, Lucide, Zod und Depth Anything V2 müssen im Release zugänglich
  bleiben. Produktnamen anderer Hersteller dürfen nur sachlich zur
  Kompatibilitätsbeschreibung verwendet werden.
- **Export-Compliance beantworten:** Der lokale API-Key-Tresor verwendet
  `scrypt` und AES-256-GCM. Deshalb müssen die Verschlüsselungsfragen in App
  Store Connect geprüft und wahrheitsgemäß beantwortet werden.
- **KI-Nutzung transparent halten:** Vor einer OpenAI-Übertragung müssen
  Empfänger, Zweck, übertragene Inhalte und mögliche API-Kosten erkennbar sein.
  Modellgrenzen und die notwendige Slicer-/Druckprüfung dürfen nicht als
  Erfolgsgarantie dargestellt werden.
- **Verträge, Steuern und Preise einrichten:** Für eine kostenpflichtige App
  müssen in App Store Connect die Verträge sowie Bank- und Steuerdaten
  vollständig sein. Zusätzliche digitale Funktionen innerhalb der App sind
  gesondert gegen Apples Regeln zu In-App-Käufen zu prüfen.
- **Support, Altersfreigabe und Metadaten:** Support-URL, Beschreibung,
  Screenshots, Altersfreigabe und Datenschutzangaben müssen den tatsächlichen
  Funktionsumfang korrekt wiedergeben.

## Technische Arbeiten für den Mac App Store

Der aktuelle DMG-Build ist ein außerhalb des Stores verteilter ARM64-Build. Ein
Mac-App-Store-Paket ist ein eigener Auslieferungsweg:

1. aktive Apple-Developer-Mitgliedschaft und gültige Zertifikate herstellen;
2. einen Electron-`mas`-Build statt des DMG-Targets konfigurieren;
3. App Sandbox und minimale Entitlements für Netzwerk sowie vom Benutzer
   ausgewählte Dateien einrichten;
4. alle benötigten Zugriffe und Drittanbieter-SDKs gegen Apples aktuelle
   Datenschutzmanifest- und Required-Reason-API-Regeln prüfen;
5. `PrivacyInfo.xcprivacy` mit den tatsächlich verwendeten APIs und
   Datenkategorien in das App-Bundle aufnehmen;
6. Signierung, Provisioning, Archiv und Upload mit Apples Werkzeugen testen;
7. die GitHub-Selbstaktualisierung im Store-Build deaktivieren, weil
   Aktualisierungen dort über den App Store erfolgen;
8. Kauf, Erststart, Dateizugriff, OpenAI-Netzwerkzugriff und Exporte in einem
   sandboxierten Store-Testbuild vollständig prüfen.

## Offizielle Apple-Quellen

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)
- [Datenschutzangaben verwalten](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)
- [EU-DSA-Händleranforderungen](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/)
- [Privacy Manifest hinzufügen](https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk)
- [App Encryption Declarations](https://developer.apple.com/documentation/appstoreconnectapi/app-encryption-declarations)

