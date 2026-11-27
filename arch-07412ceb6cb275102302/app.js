(function () {
  "use strict";

  // =========================================================================
  // 1. AUSFÜHRLICHE SPEZIFIKATIONEN FÜR ALLE SYSTEM-BAUSTEINE (7 BLÖCKE)
  // =========================================================================
  const NODE_DETAILS = {
    FS_QUEUE: {
      category: "Ticketsystem & Asset-CMDB • Freshservice",
      title: "Freshservice Queue „KI-Triage“ & Asset-CMDB",
      what:
        "Zentraler Eingangspunkt für alle eingehenden IT-Störungen und Serviceanfragen. Neu erstellte Tickets werden über den Workflow Automator regelbasiert in die isolierte Warteschlange „KI-Triage“ geleitet. Parallel dazu stellt die integrierte CMDB (Configuration Management Database) Stammdaten zu Computernummern, Seriennummern und zugewiesenen Endgeräten bereit.",
      tools:
        "Freshservice ITSM • Workflow Automator • Freshservice REST API v2 (/api/v2/tickets, /assets, /notes, /solutions) • Integrierte Asset-CMDB",
      where:
        "Admin-Oberfläche: Freshservice Admin → Agentengruppen (Gruppe „KI-Triage“), Workflow Automator (Regel: Ticket-Erstellung) & Assets (CMDB)",
      how: [
        "Hintergrund-Ablauf: Bei Ticket-Erstellung feuert der Workflow Automator einen HTTPS-Webhook mit ausschließlich der numerischen ticket_id an Azure Functions.",
        "Dedizierte Agentengruppe „KI-Triage“ sowie einen eingeschränkten technischen Service-Account („KI-Assistent“) anlegen und die IDs im Azure Key Vault hinterlegen.",
        "Zweistufiger CMDB-Abgleich: Primäre Suche über im Text erkannte Asset-Tags (z. B. NB-4711, PC-1024); sekundärer Fallback über die requester_id des Meldenden.",
        "On-Premises-Bedarf: Keine lokale Hardware oder On-Premises-VM erforderlich – reine Cloud-zu-Cloud-Kommunikation."
      ],
      blocked: [
        "Keine öffentlichen Kundenantworten (Public Replies): Der Service-Account besitzt technisch keine Berechtigung, E-Mails an Endanwender zu versenden.",
        "Kein eigenständiges Schließen von Tickets (Status 5 „Closed“): Tickets bleiben immer in Verantwortung eines IT-Mitarbeiters.",
        "Kein Überschreiben manueller Techniker-Zuweisungen: Sobald ein Kollege das Ticket öffnet oder übernimmt, bricht die Automation sofort ab."
      ],
      security:
        "Transportverschlüsselung über TLS 1.3. Der Freshservice API-Schlüssel ist nicht im Quellcode hinterlegt, sondern hardwaregesichert im Azure Key Vault gespeichert.",
      evolution:
        "Kosten dieses Bausteins: 0,00 € Zusatzkosten (Webhooks, REST API v2 & CMDB sind im bestehenden Freshservice-Tarif enthalten). Ausbaupotenzial: Später für Service-Katalog-Standardprozesse (Stufe 2/3) erweiterbar."
    },

    ORCHESTRATOR: {
      category: "Steuerung, Guardrails & Audit • 100 % Azure PaaS / Serverless",
      title: "Serverless Orchestrator & Kollisionsschutz (Azure Functions)",
      what:
        "Deterministische Steuerungsschicht zwischen Freshservice und den KI-Agenten. Übernimmt das atomare Sperren (Claiming) eines Tickets während der Analyse, verhindert Überschneidungen mit menschlichen Technikern, bereinigt personenbezogene Daten vor externen Suchen und protokolliert jeden Vorgang revisionssicher.",
      tools:
        "Azure Functions (Linux, Python 3.11, Consumption Plan Y1 – 100 % PaaS) • Azure Key Vault (RBAC) • Azure Table Storage",
      where:
        "Admin-Oberfläche: Azure Portal → Ressourcengruppe rg-servicedesk-ai-prod → Function App, Key Vault & Table Storage (Konfiguration per GitHub Actions)",
      how: [
        "Warum keine lokale On-Prem-VM oder IaaS-VM? Eine lokale VM (z. B. n8n + lokales LLM) benötigt 24/7-Serverbetrieb, OS-/Docker-Patching, 32–64 GB RAM/GPU-Hardware sowie Firewall-Tunnel für Freshservice-Webhooks. Azure PaaS/Serverless läuft 24/7 wartungsfrei, skaliert automatisch und kostet 0,00 € Laufzeitgebühr.",
        "Pre- & Post-Flight-Kollisionsschutz: Bearbeitung startet nur, wenn responder_id leer ist und die letzte manuelle Änderung mindestens 3 Minuten zurückliegt.",
        "Deterministischer PII-Sanitizer: Entfernt E-Mail-Adressen, IP-Adressen, Telefonnummern, Hostnamen (NB-/PC-/LAP-*) und Klarnamen vor externen Aufrufen.",
        "Admin-Alltag: Schwellenwerte werden über Azure App Settings gesteuert, Keys im Azure Key Vault rotiert und Token-Kosten in Azure Table Storage ausgewertet."
      ],
      blocked: [
        "Keine Klartext-Ticketinhalte in System-Logs: Application Insights protokolliert ausschließlich technische Statuscodes und Ticket-IDs ohne personenbezogene Daten.",
        "Keine hartkodierten Passwörter oder API-Keys im Git-Repository (blockiert durch automatisierten Gitleaks-Security-Scan).",
        "Kein OS- oder Server-Wartungsstau: 100 % PaaS-Betrieb durch Microsoft ohne eigene virtuelle Maschinen."
      ],
      security:
        "Zero-Trust-Architektur: Authentifizierung zwischen allen Azure-Diensten erfolgt passwortlos über System-Assigned Managed Identity (DefaultAzureCredential) mit minimalen RBAC-Rollen.",
      evolution:
        "Kosten dieses Bausteins: 0,00 € / Monat (1 Mio. Ausführungen gratis im Consumption Plan; Key Vault & Table Storage ca. 0,15 €/Monat) gegenüber 45–90 €/Monat für eine IaaS-VM."
    },

    AGENT_1: {
      category: "KI-Agent 1 • Azure AI Foundry (gpt-4.1-mini)",
      title: "Agent 1: Triage-, Pflichtfeld- & Routing-Agent",
      what:
        "Führt die strukturierte Erstklassifizierung jedes neuen Tickets in Echtzeit durch. Erkennt Problemkategorie, Dringlichkeit (Priorität 1–4) und zuständige IT-Fachgruppe und prüft bei Hardware-/Client-Meldungen, ob eine gültige Computernummer vorliegt oder über die CMDB ermittelt werden konnte.",
      tools:
        "Azure AI Foundry Agent Service (PaaS) • Modell: gpt-4.1-mini (Data Zone Standard EU) • CMDB-Abgleich",
      where:
        "Admin-Oberfläche: Azure AI Foundry Portal (Sweden Central) & versionierte Prompt-Datei prompts/agent1_triage.md im Git-Repo",
      how: [
        "Modell-Konfiguration: gpt-4.1-mini mit Temperatur 0.0 (maximale Deterministik), Max-Tokens 400 und striktem JSON-Schema-Output.",
        "Pflichtfeld-Validierung: Wird ein Client-/Hardware-Problem erkannt und liegt weder im Text noch in der CMDB ein Gerät vor, setzt der Orchestrator das Tag „pflichtdaten-fehlen“ und stoppt die weitere KI-Recherche.",
        "Fachgruppen-Routing: Ordnet das Ticket automatisiert den Zielgruppen 1st-Level-Support, Client-Management, Netzwerk-Infra oder M365-Admin zu."
      ],
      blocked: [
        "Prompt-Injection-Schutz: Ticket-Betreff und -Beschreibung werden in XML-Tags (<ticket_content>) gekapselt; Anweisungen innerhalb des Tickettexts werden strikt ignoriert.",
        "Kein Direktkontakt zum Anwender: Agent 1 darf weder E-Mails formulieren noch Rückfragen selbstständig an Endanwender senden.",
        "Keine Bearbeitung von Opt-out-Tickets: Tickets mit dem Tag „keine-ki“ oder „manuell“ werden vollständig übersprungen."
      ],
      security:
        "Bereits durch den bestehenden Microsoft Tenant-AVV rechtlich abgedeckt. Verarbeitung ausschließlich in der EU Data Zone (Sweden Central) ohne Modell-Training.",
      evolution:
        "Kosten dieses Bausteins: ca. 1,60 € / Monat bei 1.000 Tickets (~0,41 € pro 1 Mio. Input-Tokens – ein Bruchteil externer APIs wie Claude Code)."
    },

    AGENT_2: {
      category: "KI-Agent 2 • Azure AI Foundry (gpt-4.1)",
      title: "Agent 2: Wissens- & Lösungs-Agent (Pilot: Human-in-the-Loop)",
      what:
        "Bereitet für den zuständigen IT-Techniker eine fundierte technische Voranalyse mit konkreten Prüfschritten vor. Kombiniert interne Wissensquellen (SharePoint-Wiki, Freshservice KB, historische gelöste Tickets) mit einer anonymisierten Hersteller-Recherche bei unbekannten Fehlercodes.",
      tools:
        "Azure AI Foundry Agent Service (PaaS) • Modell: gpt-4.1 (Data Zone Standard EU) • Azure AI Search • Grounding with Bing Search",
      where:
        "Admin-Oberfläche: Azure AI Foundry Portal & versionierte Prompt-Datei prompts/agent2_knowledge.md",
      how: [
        "Modell-Konfiguration: gpt-4.1 (EU Data Zone), Temperatur 0.1, Max-Tokens 1.200 mit aktiviertem Prompt Caching (75 % Rabatt auf den System-Prompt).",
        "RAG-Priorisierung: Ruft zunächst die Top-5-Treffer aus Azure AI Search ab. Nur wenn der Relevanz-Score unter 0,78 liegt, wird eine anonymisierte Bing-Recherche ausgelöst.",
        "Struktur der internen Notiz: 1. KI-Zusammenfassung, 2. Gefundene Wissensquellen, 3. Prüfungsschritte für Techniker, 4. Antwortentwurf."
      ],
      blocked: [
        "100 % Human-in-the-Loop-Sperre im Pilot (Stufe 1): Die Ausgabe wird über die API hart codiert mit „private: true“ gespeichert. Endanwender sehen KI-Notizen niemals ungeprüft.",
        "Kein Zugriff auf aktive Systemänderungen: Agent 2 führt keine PowerShell-Skripte, Passwort-Resets oder Active-Directory-Änderungen aus.",
        "Keine Weitergabe interner Daten an Web-Suchen."
      ],
      security:
        "Tenant-AVV konform (Sweden Central, Zero-Data-Retention). Erst nach Prüfung und Freigabe durch einen IT-Mitarbeiter wird eine Antwort versendet.",
      evolution:
        "Kosten dieses Bausteins: ca. 6,20 € / Monat bei 1.000 Tickets. In Stufe 2/3 auf teilautomatisierte Standardantworten und weitere Fachbereiche (HR, ERP) erweiterbar."
    },

    VECTOR_STORE: {
      category: "Interne Wissensbasis • Azure AI Search (PaaS)",
      title: "Semantischer Wissens-Index (Azure AI Search Vector Store)",
      what:
        "Zentrales semantisches Wissensgedächtnis des IT-Servicedesks. Speichert alle internen Standard-Arbeitsanweisungen (SOPs), SharePoint-Wiki-Seiten, veröffentlichten Freshservice-KB-Artikel und anonymisierten historischen Ticketlösungen.",
      tools:
        "Azure AI Search (Basic Tier, Sweden Central) • HNSW-Vektorindex (1.536 Dimensionen) • Embedding-Modell: text-embedding-3-small (EU)",
      where:
        "Admin-Oberfläche: Azure Portal → Azure AI Search → Index „it-servicedesk-kb“ (vollautomatische Befüllung per Nacht-Sync)",
      how: [
        "Index-Schema: Schlüsselfeld (SHA-256-Hash), Quelltyp (WIKI_PAGE, KB_ARTICLE, RESOLVED_TICKET), Titel, Text-Chunk und 1.536-dimensionaler Vektor.",
        "Chunking-Strategie: Zerlegung langer Dokumente in Abschnitte à 2.400 Zeichen mit 300 Zeichen Überlappung für präzise Kontexttreffer.",
        "Hybrid-Retrieval: Kombination aus Vektor-Ähnlichkeitssuche (HNSW) und semantischem Ranking."
      ],
      blocked: [
        "Keine Speicherung ungefilterter Ticket-Klartexte: Alle Dokumente durchlaufen vor der Indexierung den PII-Sanitizer.",
        "Kein öffentlicher Internet-Zugriff auf den Suchindex."
      ],
      security:
        "Datenhaltung ausschließlich im EU-Rechenzentrum Sweden Central. Zugriff durch die Function App erfolgt passwortlos über RBAC.",
      evolution:
        "Kosten dieses Bausteins: ca. 1,35 € / Monat. Erweiterbar um getrennte Wissens-Indizes für weitere Unternehmensbereiche (HR, Einkauf, Facility Management)."
    },

    BING_GROUNDING: {
      category: "Externe Recherche • Microsoft Bing Grounding",
      title: "Anonymisierte Web-Recherche (Grounding with Bing Search)",
      what:
        "Ergänzt das interne Firmenwissen bei neuen oder seltenen technischen Fehlercodes durch gezielte Recherche in offiziellen Hersteller-Dokumentationen (z. B. Microsoft Learn, Windows- oder M365-Fehlercodes).",
      tools:
        "Azure AI Foundry Connected Resource: Grounding with Bing Search • Vorgeschalteter Python PII-Sanitizer",
      where:
        "Admin-Oberfläche: Azure AI Foundry Portal → Management Center → Connected Resources → Grounding with Bing Search",
      how: [
        "Trigger-Bedingung: Wird nur aufgerufen, wenn der interne Vector Store keinen ausreichenden Treffer (Score < 0,78) liefert.",
        "Query-Extraktion: Der PII-Filter entfernt vorab sämtliche Namen, E-Mail-Adressen, IPs, Telefonnummern sowie Hostnamen und reduziert die Anfrage auf max. 120 Zeichen."
      ],
      blocked: [
        "Strikte PII-Ausgangssperre: Mitarbeiternamen, E-Mail-Adressen, Durchwahlen, interne IP-Adressen und Computernummern werden deterministisch herausgefiltert.",
        "Kein Volltext-Upload von Tickets: Es gelangen niemals ganze Ticketbeschreibungen an externe Suchmaschinen."
      ],
      security:
        "Strikte Datentrennung: Nach außen gelangen ausschließlich abstrakte technische Fehlercodes, keinerlei Unternehmens- oder Personendaten.",
      evolution:
        "Kosten dieses Bausteins: ca. 1,80 € / Monat bei 1.000 Tickets (~20–25 % Web-Recherche-Quote)."
    },

    AGENT_3: {
      category: "KI-Agent 3 • Azure AI Foundry + Microsoft Graph",
      title: "Agent 3: Doku- & Aktualitäts-Agent (KB-Governance)",
      what:
        "Automatisiert die Pflege der IT-Knowledge-Base in zwei Richtungen: Erstellt nach Ticket-Abschluss strukturierte Lösungsartikel-Entwürfe für noch nicht dokumentierte Probleme und überwacht bestehende Artikel auf Aktualität.",
      tools:
        "Azure AI Foundry (gpt-4.1 & gpt-4.1-mini) • Freshservice Solutions API (/api/v2/solutions/articles) • Microsoft Graph Mail API",
      where:
        "Admin-Oberfläche: Azure AI Foundry & Azure Functions (ticket_closed_hook / weekly_kb_audit)",
      how: [
        "Dubletten-Prüfung bei Ticket-Abschluss: Prüft im Vector Store (Score ≥ 0,85), ob bereits ein passender Artikel existiert, bevor ein Entwurf erzeugt wird.",
        "Verbindliche 4-Punkte-Artikelstruktur: 1. Symptom & Fehlermeldung, 2. Betroffene Systeme, 3. Schritt-für-Schritt-Lösung, 4. Verifikation.",
        "Wöchentlicher Aktualitäts-Audit (Montag 07:00 Uhr): Erkennt Artikel älter als 180 Tage und versendet eine Prüf-E-Mail an den Artikel-Owner."
      ],
      blocked: [
        "Keine Direktveröffentlichung von KB-Artikeln: Artikel werden über die API zwingend mit „status: 1“ (Draft / Entwurf) angelegt und müssen manuell freigegeben werden.",
        "Keine Übernahme von Personen- oder Gerätenamen."
      ],
      security:
        "Volle redaktionelle Kontrolle durch das IT-Team; E-Mail-Benachrichtigungen laufen passwortlos über Microsoft Graph API.",
      evolution:
        "Kosten dieses Bausteins: ca. 2,40 € / Monat (Microsoft Graph Mail ist in bestehenden M365-Lizenzen enthalten = 0,00 €)."
    },

    NIGHTLY_SYNC: {
      category: "Hintergrund-Pipeline • Kein eigener KI-Agent",
      title: "Nächtlicher Wissens-Sync (SharePoint & Freshservice → Vector Store)",
      what:
        "Vollautomatischer ETL-Hintergrundprozess, der jede Nacht außerhalb der Geschäftszeiten neue oder geänderte SharePoint-Wiki-Seiten, veröffentlichte KB-Artikel und abgeschlossene Tickets in den Vector Store übernimmt.",
      tools:
        "Azure Functions Timer Trigger (CRON: 0 0 2 * * *) • Microsoft Graph API (Sites.Read.All) • Freshservice API • Azure OpenAI Embeddings",
      where:
        "Admin-Oberfläche: Azure Functions → Timer Trigger „nightly_rag_sync“ (täglich 02:00 Uhr UTC)",
      how: [
        "Inkrementelles Delta-Fenster: Ruft gezielt nur Änderungen der letzten 26 Stunden ab, um API-Kontingente und Embedding-Tokens minimal zu halten.",
        "Anonymisierungs- & Chunking-Pipeline: Bereinigt alle Texte vor der Vektorisierung und aktualisiert bestehende Vektor-IDs idempotent per Upsert.",
        "On-Premises-Bedarf: Keine lokale Hardware nötig (SharePoint Online & Freshservice Cloud)."
      ],
      blocked: [
        "Keine Schreibrechte auf SharePoint Online: Die Managed Identity besitzt ausschließlich Leserechte (Sites.Read.All).",
        "Keine Importe offener oder privater HR-/Security-Tickets."
      ],
      security:
        "Passwortlose Authentifizierung gegen Microsoft Graph über Managed Identity mit minimalen Leserechten.",
      evolution:
        "Kosten dieses Bausteins: < 0,10 € / Monat (text-embedding-3-small EU kostet ca. 0,02 € pro 1 Mio. Tokens)."
    },

    VOICE_HOTLINE: {
      category: "Ausbaustufe 2 (Optional) • Azure Speech & Communication Services",
      title: "Voice- & TTS-Hotline-Agent (Telefonie-Erweiterung)",
      what:
        "Optionale Ausbaustufe für den telefonischen IT-Support. Nimmt eingehende Anrufe rund um die Uhr in natürlicher deutscher Sprache entgegen, beantwortet Standardfragen direkt aus dem Wissens-Index oder erstellt ein vorqualifiziertes Freshservice-Ticket.",
      tools:
        "Azure Communication Services (SIP-Trunk & Call Automation) • Azure AI Speech Services (STT & Neural TTS) • Azure AI Foundry",
      where:
        "Admin-Oberfläche: Azure Portal → Azure Communication Services & Azure AI Speech (Sweden Central)",
      how: [
        "SIP-Trunk-Integration: Anbindung an die bestehende Unternehmens-Telefonanlage (z. B. für Überlauf, Mittagszeit oder Rufbereitschaft).",
        "Echtzeit-Sprachpipeline: Streaming Speech-to-Text kombiniert mit neuronaler deutscher Sprachausgabe (de-DE-KatjaNeural / ConradNeural) unter 800 ms Latenz.",
        "Eskalations-Garantie: Auf Wunsch des Anrufers („Mitarbeiter sprechen“) sofortige Durchstellung an den 1st-Level-Support inklusive Gesprächsprotokoll."
      ],
      blocked: [
        "Keine dauerhafte Aufzeichnung von Sprachmitschnitten: Audio-Streams werden ausschließlich flüchtig im Arbeitsspeicher verarbeitet.",
        "Keine Sackgassen-Menüs: Ein menschlicher Mitarbeiter ist jederzeit per Sprachbefehl erreichbar."
      ],
      security:
        "100 % EU-Datenverarbeitung in Sweden Central unter denselben Tenant-AVV- und DSGVO-Richtlinien wie der Ticket-Betrieb.",
      evolution:
        "Kosten dieses Bausteins: ca. 201,50 € / Monat bei 750 Anrufen à 4 Min. (0,00 € bei 0 Anrufen; sekundengenaue Abrechnung)."
    }
  };

  // =========================================================================
  // 2. TECHNISCHE DETAILS FÜR ALLE SCHNITTSTELLEN & DATENFLÜSSE (7 BLÖCKE)
  // =========================================================================
  const EDGE_DETAILS = {
    E1: {
      label: "1. Ticket-Trigger: Freshservice → Orchestrator",
      category: "Schnittstelle 1 • Echtzeit-Webhook",
      title: "Ereignisgesteuerte Übergabe neuer Tickets aus „KI-Triage“",
      what: "Löst beim Eintreffen eines neuen Tickets in der Queue „KI-Triage“ sofort die Verarbeitung in Azure aus, ohne dass ein dauerhaftes Polling notwendig ist.",
      tools: "Freshservice Workflow Automator → HTTPS POST Webhook → Azure Function (freshservice_webhook)",
      where: "Freshservice Admin → Workflow Automator → Ticket-Regeln & Azure Function App",
      how: [
        "Authentifizierung über dedizierten Azure Function Host-/Function-Key (authLevel: function).",
        "Minimale Payload: Es wird ausschließlich die numerische ticket_id übertragen; die vollständigen Ticketdaten ruft Azure anschließend direkt per TLS-1.3-API ab."
      ],
      blocked: [
        "Keine unauthentifizierten HTTP-Aufrufe: Ohne gültigen Function-Schlüssel weist Azure jede Anfrage sofort mit HTTP 401 ab.",
        "Keine Übertragung von Ticket-Klartexten in der Webhook-URL."
      ],
      security: "TLS-1.3-Transportverschlüsselung zwischen Freshworks EU-Cloud und Azure Sweden Central.",
      evolution: "Kosten: 0,00 € (im Freshservice-Tarif und Azure Functions Free-Kontingent enthalten)."
    },
    E2: {
      label: "2. Asset-Abgleich: Orchestrator ↔ Freshservice CMDB",
      category: "Schnittstelle 2 • CMDB & Pflichtfeldprüfung",
      title: "Automatisierter Abgleich von Computernummer und Benutzer-Hardware",
      what: "Verifiziert, ob eine im Ticket genannte Computernummer in der CMDB existiert, oder ermittelt automatisch das dem Meldenden zugewiesene Notebook.",
      tools: "Python Requests Session → Freshservice Assets REST API v2 (/api/v2/assets)",
      where: "Azure Functions (shared/freshservice_client.py) ↔ Freshservice CMDB",
      how: [
        "Zweistufige Suche: 1. Abfrage nach erkannter Asset-Nummer (NB-/PC-/LAP-*), 2. Fallback-Abfrage über die user_id des Ticket-Erstellers.",
        "Liegt bei einem Hardware-Problem kein gültiges Asset vor, wird das Ticket mit „pflichtdaten-fehlen“ getaggt und an den 1st-Level geleitet."
      ],
      blocked: [
        "Keine Schreib- oder Löschrechte auf CMDB-Assets: Die Schnittstelle arbeitet rein lesend.",
        "Keine Speicherung von CMDB-Stammdaten außerhalb des Tickets."
      ],
      security: "API-Zugangsdaten werden zur Laufzeit per Managed Identity aus dem Azure Key Vault gelesen.",
      evolution: "Kosten: 0,00 € (im bestehenden Freshservice-Tarif enthalten)."
    },
    E3: {
      label: "3. Triage & Routing: Orchestrator ↔ Agent 1",
      category: "Schnittstelle 3 • Klassifizierung (gpt-4.1-mini)",
      title: "Strukturierte Ticket-Klassifizierung & Fachgruppen-Zuordnung",
      what: "Übergibt Ticketinhalt und CMDB-Kontext an Agent 1 zur Bestimmung von Priorität, Kategorie, Pflichtfeld-Vollständigkeit und Ziel-Fachgruppe.",
      tools: "Azure OpenAI SDK (Python) → Azure AI Foundry Deployment gpt-4-1-mini-eu",
      where: "Azure Functions ↔ Azure AI Foundry (Sweden Central)",
      how: [
        "Striktes JSON-Response-Format für fehlerfreie Weiterverarbeitung im Code.",
        "Bei fehlenden Pflichtdaten stoppt die Pipeline hier bewusst, um unnötige Token-Kosten in Agent 2 zu vermeiden."
      ],
      blocked: [
        "Keine Ausführung von Befehlen aus dem Tickettext (XML-Kapselung als Untrusted Input).",
        "Kein Verlassen der EU Data Zone."
      ],
      security: "Durch bestehenden Microsoft Tenant-AVV abgedeckt; Authentifizierung über Entra ID Bearer Token.",
      evolution: "Kosten: ca. 1,60 € / Monat bei 1.000 Tickets."
    },
    E4: {
      label: "4. Wissenssuche: Agent 2 ↔ Azure AI Search",
      category: "Schnittstelle 4 • Interne RAG-Abfrage",
      title: "Semantische Suche in internen SOPs, Wiki & Alttickets",
      what: "Ermittelt zu jedem vorqualifizierten Ticket die 5 relevantesten Lösungsdokumente aus dem unternehmenseigenen Wissens-Index.",
      tools: "Azure Search Documents SDK → Azure AI Search Index (it-servicedesk-kb)",
      where: "Azure Functions / Agent 2 ↔ Azure AI Search (Sweden Central)",
      how: [
        "Abruf der Top-5-Chunks inklusive Relevanz-Bewertung (@search.score).",
        "Schwellenwert-Logik: Bei Score ≥ 0,78 wird die Lösung direkt aus dem internen Firmenwissen abgeleitet."
      ],
      blocked: [
        "Kein Zugriff auf nicht freigegebene Abteilungs-Laufwerke oder vertrauliche HR-Dokumente."
      ],
      security: "Passwortloser Zugriff per System-Assigned Managed Identity.",
      evolution: "Kosten: in der Azure AI Search Pauschale (~1,35 €/Monat) enthalten."
    },
    E5: {
      label: "5. Fehlercode-Suche: Agent 2 ↔ Bing Grounding",
      category: "Schnittstelle 5 • Anonymisierte Web-Recherche",
      title: "DSGVO-bereinigte Recherche unbekannter Fehlercodes",
      what: "Recherchiert bei unbekannten Fehlern (interner Score < 0,78) nach offiziellen Hersteller-Lösungen, ohne interne Daten preiszugeben.",
      tools: "pii_sanitizer.py → Azure AI Foundry → Grounding with Bing Search",
      where: "Azure Functions → Azure AI Foundry Connected Resource",
      how: [
        "Deterministische Bereinigung aller Namen, E-Mail-Adressen, IPs und Gerätenummern vor der Suchanfrage.",
        "Begrenzung auf maximal 120 Zeichen für präzise Fehlercode-Treffer."
      ],
      blocked: [
        "Keine ungefilterten Suchanfragen: Ohne Durchlauf des PII-Filters wird kein externer API-Call ausgeführt.",
        "Keine Übermittlung von Firmennamen, Benutzernamen oder internen Hostnamen."
      ],
      security: "100 % anonymisierte Suchanfrage ohne Rückschluss auf Unternehmen oder Mitarbeiter.",
      evolution: "Kosten: ca. 1,80 € / Monat bei 1.000 Tickets."
    },
    E6: {
      label: "6. Ergebnis-Rückgabe: Agent 2 → Freshservice Note",
      category: "Schnittstelle 6 • Human-in-the-Loop Schreibschutz",
      title: "Speichern der internen Notiz & Zuweisung an Fachgruppe",
      what: "Schreibt Zusammenfassung, Prüfschritte und Antwortentwurf als interne Notiz ins Ticket, entfernt die KI-Zuweisung und routet an die Zielgruppe.",
      tools: "Freshservice REST API v2 (/api/v2/tickets/{id}/notes & PUT /tickets/{id})",
      where: "Azure Functions (freshservice_client.py) → Freshservice",
      how: [
        "Post-Flight-Kollisionscheck unmittelbar vor dem POST-Request.",
        "Notiz wird hart codiert mit {\"private\": true} angelegt; responder_id wird anschließend wieder auf null gesetzt."
      ],
      blocked: [
        "Technisch unmöglich, öffentliche Kundenantworten (\"private\": false) zu senden (zusätzlich durch CI/CD-Security-Check abgesichert).",
        "Kein Überschreiben, falls zwischenzeitlich ein Techniker das Ticket übernommen hat."
      ],
      security: "100 % Human-in-the-Loop im Pilot durch erzwungene interne Notiz.",
      evolution: "Kosten: 0,00 €; in Stufe 2/3 für ausgewählte Standardfälle erweiterbar."
    },
    E7: {
      label: "7. Doku & Audit: Ticket Closed / Timer → Agent 3",
      category: "Schnittstelle 7 • KB-Entwürfe & Graph E-Mails",
      title: "Erstellung neuer Lösungsartikel-Entwürfe & 180-Tage-Audit",
      what: "Erzeugt nach Ticket-Abschluss einen anonymisierten KB-Entwurf und erinnert Artikel-Verantwortliche wöchentlich an fällige Aktualitätsprüfungen.",
      tools: "Freshservice Webhook (Ticket Closed) • Timer Trigger • Microsoft Graph Mail API",
      where: "Azure Functions (ticket_closed_hook & weekly_kb_audit) → Freshservice & Exchange Online",
      how: [
        "Dubletten-Schutz: Abgleich mit Vector Store (Score < 0,85) vor Erstellung eines neuen Entwurfs.",
        "Anlage strikt als Entwurf (status: 1); E-Mail-Versand an Owner per Microsoft Graph API."
      ],
      blocked: [
        "Keine direkte Veröffentlichung von Artikeln (status: 2 ist im Code ausgeschlossen).",
        "Keine Übernahme von Klarnamen oder Computernummern in Entwürfe."
      ],
      security: "Vollständige Entfernung aller Personen- und Gerätedaten vor Erstellung des Artikel-Entwurfs.",
      evolution: "Kosten: ca. 2,40 € / Monat (Graph Mail = 0,00 €)."
    },
    E8: {
      label: "8. Nacht-Sync: SharePoint & Tickets → Vector Store",
      category: "Schnittstelle 8 • Automatisierter Wissens-Import",
      title: "Nächtliche Delta-Synchronisation der Wissensbasis (02:00 Uhr)",
      what: "Hält den Vector Store aktuell, indem nachts geänderte SharePoint-Wiki-Seiten und abgeschlossene Tickets importiert werden.",
      tools: "Azure Timer Trigger → Microsoft Graph API & Freshservice API → Azure AI Search",
      where: "Azure Functions (nightly_rag_sync) → Azure AI Search",
      how: [
        "Delta-Abruf der letzten 26 Stunden minimiert API-Last und Embedding-Kosten.",
        "Anonymisierung und Vektorisierung in Sweden Central."
      ],
      blocked: [
        "Kein schreibender Zugriff auf SharePoint-Dokumente.",
        "Keine Beeinträchtigung der Live-Performance tagsüber."
      ],
      security: "Passwortloser Lesezugriff über Entra ID Managed Identity (Sites.Read.All).",
      evolution: "Kosten: < 0,10 € / Monat."
    },
    E9: {
      label: "9. Ausbaustufe 2: Voice-Hotline ↔ Agent 1 & 2",
      category: "Schnittstelle 9 • Echtzeit-Sprachkanal",
      title: "Anbindung der KI-Telefonhotline an Wissensbasis & Ticketsystem",
      what: "Verbindet eingehende Telefonanrufe über Azure Speech Services mit dem bestehenden Wissens-Index und legt vorqualifizierte Tickets an.",
      tools: "Azure Communication Services (SIP) ↔ Azure AI Speech (STT/TTS) ↔ Azure AI Foundry",
      where: "Azure Portal → Communication Services & AI Foundry (Sweden Central)",
      how: [
        "Bidirektionales Echtzeit-Audio-Streaming (< 800 ms Latenz).",
        "Automatische Ticket-Anlage in Freshservice inklusive Gesprächszusammenfassung als Private Note."
      ],
      blocked: [
        "Keine Speicherung von Sprachmitschnitten.",
        "Keine Blockade der Durchstellung an menschliche Techniker."
      ],
      security: "DSGVO-konforme Verarbeitung in der EU ohne dauerhafte Speicherung von Sprachaufnahmen.",
      evolution: "Kosten: sekundengenau nach Gesprächsdauer (0,00 € bei 0 Anrufen)."
    }
  };

  // =========================================================================
  // 3. DETAILLIERTE KOSTENPOSITIONEN (7 BLÖCKE INKL. KAUFMÄNNISCHER LOGIK)
  // =========================================================================
  const COST_ITEM_DETAILS = {
    COST_FS: {
      category: "Kostenposition • Freshservice ITSM",
      title: "Freshservice REST API, Webhooks & Asset-CMDB",
      what: "Nutzung der bestehenden Freshservice-Plattform für Webhook-Trigger, Ticket-Routing, CMDB-Abfragen, interne Notizen und KB-Entwürfe.",
      tools: "Freshservice REST API v2 • Workflow Automator • Asset-CMDB",
      where: "Freshservice Admin → Tarifplan & Kontoeinstellungen",
      how: [
        "0,00 € Zusatzkosten: REST API v2, Workflow Automator Webhooks und CMDB-Abfragen sind in den bestehenden Freshservice-Tarifen (Growth / Pro / Enterprise) enthalten.",
        "Vermeidung teurer Sitzplatz-Add-ons: Native Hersteller-KI-Add-ons kosten oft 29 € – 49 € pro Agent und Monat – durch unsere eigene Azure-Architektur entfallen diese laufenden Pro-Kopf-Gebühren komplett.",
        "Hinweis: Für das Ticket-Claiming wird ein technischer Service-Account oder ein bestehender freier Agenten-Platz genutzt."
      ],
      blocked: [
        "Keine automatische Buchung kostenpflichtiger Freshworks-Marketplace-Apps oder Pro-Seat-KI-Lizenzen."
      ],
      security: "Alle Zugriffe laufen über den bestehenden Auftragsverarbeitungsvertrag (AVV) mit Freshworks sowie TLS-1.3-Verschlüsselung.",
      evolution: "0,00 € Zusatzkosten – skaliert ohne weitere Lizenzgebühren bei steigendem Ticketvolumen."
    },
    COST_AGENT1: {
      category: "Kostenposition • Azure AI Foundry (gpt-4.1-mini)",
      title: "Agent 1: Triage, Pflichtfeldprüfung & Routing",
      what: "Verbrauchsabhängige Token-Kosten für die Echtzeit-Klassifizierung jedes eingehenden Tickets in der EU Data Zone.",
      tools: "Azure AI Foundry (PaaS) • Modell: gpt-4.1-mini (Data Zone Standard EU)",
      where: "Azure Portal → Azure AI Foundry → Deployments → gpt-4-1-mini-eu",
      how: [
        "EU-Listenpreis (Stand 2026): ca. 0,41 € pro 1 Mio. Input-Tokens und 1,63 € pro 1 Mio. Output-Tokens.",
        "Deutlich günstiger als Claude Code API: Nur rund 1/7 der Kosten vergleichbarer externer Frontier-APIs bei voller EU-Datenresidenz.",
        "Kalkulation für 1.000 Tickets/Monat: ca. 1,60 € (inklusive CMDB-Tool-Call-Runde und Sicherheitsreserve)."
      ],
      blocked: [
        "Kein unbegrenzter Token-Abruf: Das Deployment ist durch ein hartes Rate-Limit (15.000 TPM) sowie Max-Tokens (400) gedeckelt."
      ],
      security: "Bereits durch den bestehenden Microsoft Tenant-AVV rechtlich abgedeckt; Daten verlassen niemals die EU-Region.",
      evolution: "Selbst bei 5.000 Tickets/Monat liegen die Kosten für Agent 1 unter 8,00 €."
    },
    COST_AGENT2: {
      category: "Kostenposition • Azure AI Foundry (gpt-4.1)",
      title: "Agent 2: Wissens-Synthese, Lösungsweg & Antwortentwurf",
      what: "Verbrauchskosten für das leistungsstarke Analyse-Modell „gpt-4.1“ (EU Data Zone), das aus RAG-Treffern und Fehlercodes die interne Techniker-Notiz erstellt.",
      tools: "Azure AI Foundry (PaaS) • Modell: gpt-4.1 (Data Zone Standard EU)",
      where: "Azure Portal → Azure AI Foundry → Deployments → gpt-4-1-eu",
      how: [
        "EU-Listenpreis (Stand 2026): ca. 2,05 € pro 1 Mio. Input-Tokens und 8,15 € pro 1 Mio. Output-Tokens.",
        "Durchschnittlicher Verbrauch pro Ticket: ca. 2.200 Input-Tokens (inkl. 5 Wiki-Chunks) + 450 Output-Tokens ≈ 0,008 € (0,8 Cent pro Ticket).",
        "Durch Azure Prompt Caching wird der wiederkehrende System-Prompt um 75 % rabattiert; Tickets ohne Pflichtdaten stoppen bereits vor Agent 2."
      ],
      blocked: [
        "Kein Aufruf bei unvollständigen Pflichtfeldern (spart ca. 15–20 % unnötige Modellkosten).",
        "Ausgabelänge hart auf max. 1.200 Tokens begrenzt."
      ],
      security: "Durch bestehenden Microsoft Tenant-AVV abgeprüft; Zero-Data-Retention & kein Modell-Training.",
      evolution: "Kosten wachsen streng linear mit dem tatsächlichen Ticketaufkommen."
    },
    COST_AGENT3: {
      category: "Kostenposition • Azure AI Foundry + Microsoft Graph",
      title: "Agent 3: KB-Artikelentwürfe & Wöchentlicher Aktualitäts-Audit",
      what: "Token-Kosten für die automatische Erstellung neuer Lösungsartikel-Entwürfe sowie die wöchentliche Qualitätsprüfung bestehender Artikel.",
      tools: "Azure AI Foundry (gpt-4.1 & gpt-4.1-mini) • Microsoft Graph Mail API",
      where: "Azure AI Foundry & Microsoft 365 Exchange Online",
      how: [
        "Artikelentwürfe werden nur für abgeschlossene Tickets ohne bestehenden KB-Treffer (ca. 15–20 % Quote) generiert.",
        "E-Mail-Erinnerungen an Artikel-Verantwortliche über Microsoft Graph sind in bestehenden Microsoft-365-Lizenzen enthalten (0,00 € Zusatzkosten).",
        "Gesamtkosten bei 1.000 Tickets/Monat: ca. 2,40 €."
      ],
      blocked: [
        "Keine doppelten Artikelentwürfe: Dubletten-Check (Score ≥ 0,85) verhindert redundante KI-Generierungen."
      ],
      security: "DSGVO-Anonymisierung aller Tickettexte vor Generierung des Entwurfs.",
      evolution: "Reduziert langfristig die Ticket-Bearbeitungszeit, da die interne Wissensbasis kontinuierlich wächst."
    },
    COST_COMPLIANCE_BING: {
      category: "Kostenposition • Compliance, Bing Grounding & Security",
      title: "Anonymisiertes Bing Grounding, Key Vault & Audit-Log",
      what: "Laufende Kosten für externe Fehlercode-Recherchen über Bing Grounding, kryptografische Schlüsselverwaltung im Key Vault sowie das Compliance-Protokoll.",
      tools: "Grounding with Bing Search • Azure Key Vault (Standard) • Azure Table Storage",
      where: "Azure Portal → Ressourcengruppe rg-servicedesk-ai-prod",
      how: [
        "Grounding with Bing Search wird nur bei unbekannten Fehlercodes ausgelöst (ca. 20–25 % der Tickets) → ca. 1,80 € bei 1.000 Tickets.",
        "Azure Key Vault: ca. 0,03 € pro 10.000 Secret-Abrufe (durch In-Memory-Caching unter 0,10 €/Monat).",
        "Azure Table Storage (revisionssicheres FinOps- & Audit-Log): ca. 0,05 €/Monat."
      ],
      blocked: [
        "Kein unkontrollierter Bing-Aufruf bei bekannten Problemen (Score ≥ 0,78 blockiert externe Web-Suchen)."
      ],
      security: "Vorgeschalteter PII-Filter verhindert jeden Abfluss personenbezogener Daten bei Bing-Anfragen.",
      evolution: "Transparentes Controlling aller Token- und API-Kosten pro Ticket und Agent in Echtzeit."
    },
    COST_INFRA_RAG: {
      category: "Kostenposition • 100 % Azure PaaS / Serverless Runtime",
      title: "Azure AI Search Vector Store, EU-Embeddings & Azure Functions",
      what: "Betriebskosten für den semantischen Vektor-Index, die nächtliche Embedding-Erstellung und die serverlose Code-Ausführung (100 % PaaS ohne VMs).",
      tools: "Azure AI Search • text-embedding-3-small (EU) • Azure Functions (Consumption PaaS)",
      where: "Azure Portal → Azure AI Search & Function App (Sweden Central)",
      how: [
        "Azure Functions (100 % PaaS / Serverless): Die ersten 1.000.000 Ausführungen und 400.000 GB-Sekunden pro Monat sind dauerhaft kostenlos (0,00 €).",
        "Ersparnis gegenüber lokaler VM / Azure IaaS-VM: Eine 24/7 laufende VM kostet ca. 45 € – 90 €/Monat plus Wartungszeit für OS-Patching.",
        "EU-Embeddings (text-embedding-3-small): < 0,10 €/Monat; Vector Store Index-Betrieb: ca. 1,35 €/Monat."
      ],
      blocked: [
        "Keine dauerhaft laufenden virtuellen Maschinen (0 % IaaS-Wartung, 100 % Managed PaaS)."
      ],
      security: "Passwortloser Betrieb über Managed Identity in der EU-Region.",
      evolution: "Skaliert automatisch von 0 auf hunderte gleichzeitige Anfragen und lässt sich auf weitere Abteilungen ausweiten."
    },
    COST_VOICE_SPEECH: {
      category: "Kostenposition • Ausbaustufe 2 (Voice & TTS)",
      title: "Azure AI Speech Services (Speech-to-Text & Neural TTS)",
      what: "Echtzeit-Spracherkennung des Anrufers (STT) und natürliche deutsche Sprachsynthese (Neural TTS) in Sweden Central.",
      tools: "Azure AI Speech Services (Real-Time STT + Neural Text-to-Speech)",
      where: "Azure Portal → Azure AI Speech Services (Sweden Central)",
      how: [
        "Kalkulationsbasis: Ø 4 Minuten Gesprächsdauer pro Hotline-Call (750 Anrufe = 50 Gesprächsstunden/Monat).",
        "Echtzeit Speech-to-Text: ca. 0,95 € pro Audiostunde.",
        "Neural Text-to-Speech (deutsche Stimme): ca. 0,70 € pro Gesprächsstunde (basierend auf aktivem Redeanteil der KI).",
        "Gesamt für 750 Anrufe (50 Std.): ca. 82,50 €/Monat."
      ],
      blocked: [
        "Keine festen Grundgebühren bei 0 Anrufen (reine nutzungsabhängige Abrechnung)."
      ],
      security: "Flüchtige Verarbeitung der Audio-Streams im EU-Rechenzentrum ohne Aufzeichnung.",
      evolution: "Jederzeit zu- oder abschaltbar, z. B. zunächst nur außerhalb der regulären Servicezeiten."
    },
    COST_VOICE_SIP: {
      category: "Kostenposition • Ausbaustufe 2 (Telefonie)",
      title: "Azure Communication Services (SIP-Trunk & Telefonminuten)",
      what: "Anbindung der Unternehmens-Telefonanlage an Azure für eingehende Hotline-Anrufe und Weiterleitungen an menschliche Techniker.",
      tools: "Azure Communication Services • Direct Routing / SIP-Trunk",
      where: "Azure Portal → Azure Communication Services → Voice",
      how: [
        "Keine festen monatlichen Callcenter-Agentenlizenzen – Abrechnung rein nach Gesprächsminuten.",
        "Kalkulation für 750 Anrufe à 4 Minuten (3.000 Minuten/Monat) inkl. Rufnummern-Routing: ca. 68,00 €/Monat."
      ],
      blocked: [
        "Keine ausgehenden Werbe- oder Massenanrufe (Outbound-Sperre auf Rufnummernebene)."
      ],
      security: "Verschlüsselte Sprachübertragung (SRTP / TLS) nach Enterprise-Standard.",
      evolution: "Nahtlose Integration in bestehende Microsoft-Teams- oder SIP-Telefonie-Umgebungen."
    },
    COST_VOICE_LLM: {
      category: "Kostenposition • Ausbaustufe 2 (Dialog-KI)",
      title: "Echtzeit-Dialog-KI für telefonische Problemlösung",
      what: "LLM-Tokenverbrauch während des aktiven Telefongesprächs für Dialogführung, Wissensabgleich und Ticket-Zusammenfassung.",
      tools: "Azure AI Foundry (gpt-4.1-mini für schnelle Antworten + gpt-4.1 für Wissensabgleich)",
      where: "Azure AI Foundry (Sweden Central)",
      how: [
        "Mehrstufiger Gesprächsverlauf (ca. 6–8 Dialogrunden pro 4-Minuten-Anruf).",
        "Kalkulation für 750 Anrufe/Monat: ca. 51,00 €/Monat."
      ],
      blocked: [
        "Maximale Gesprächsdauer pro Session begrenzt (automatische Übergabe an Techniker bei komplexen Störungen)."
      ],
      security: "Identische EU-Datenschutz- und Tenant-AVV-Garantien wie im Ticket-Betrieb.",
      evolution: "Kann später für standardisierte Self-Service-Vorgänge (z. B. Statusabfrage offener Tickets) genutzt werden."
    }
  };

  // =========================================================================
  // 4. MERMAID ARCHITEKTUR-DEFINITION
  // =========================================================================
  const MERMAID_DEF = `
flowchart LR
    subgraph EXT["1. Eingangs- & Quellsysteme (Unternehmen)"]
        direction TB
        FS_QUEUE["<b>Freshservice ITSM &amp; CMDB</b><br/>Queue: KI-Triage • Assets &amp; KB<br/><i>Freshservice REST API v2</i>"]
        VOICE_HOTLINE["<b>Ausbaustufe 2: KI-Telefonhotline</b><br/>24/7 Sprachannahme &amp; Weiterleitung<br/><i>Azure Comm. Services + Speech STT/TTS</i>"]
        NIGHTLY_SYNC["<b>Nächtlicher Wissens-Sync (02:00 Uhr)</b><br/>SharePoint IT-Wiki &amp; gelöste Tickets<br/><i>Azure Timer + Microsoft Graph API</i>"]
    end

    subgraph CORE["2. Steuerung, Guardrails &amp; Compliance (100 % Azure PaaS)"]
        direction TB
        ORCHESTRATOR["<b>Serverless Orchestrator &amp; Kollisionsschutz</b><br/>Pre-/Post-Flight-Check • PII-Filter • Audit-Log<br/><i>Azure Functions (Python 3.11) + Key Vault + Table Storage</i>"]
    end

    subgraph AGENTS["3. Spezialisierte KI-Agenten (Azure AI Foundry • Tenant-AVV EU)"]
        direction TB
        AGENT_1["<b>Agent 1: Triage, Pflichtfeld &amp; Routing</b><br/>Prio 1–4 • PC-Nr.-Check • Fachgruppen-Routing<br/><i>Modell: gpt-4.1-mini (Data Zone EU)</i>"]
        AGENT_2["<b>Agent 2: Wissens- &amp; Lösungs-Agent</b><br/>Interne Recherche • Fehlercode-Analyse • Private Note<br/><i>Modell: gpt-4.1 (Data Zone EU)</i>"]
        AGENT_3["<b>Agent 3: Doku- &amp; Aktualitäts-Agent</b><br/>Anonymisierte KB-Drafts • 180-Tage-Audit-Mails<br/><i>Modelle: gpt-4.1 + gpt-4.1-mini + MS Graph</i>"]
    end

    subgraph KNOWLEDGE["4. Wissen &amp; Externe Recherche"]
        direction TB
        VECTOR_STORE[("<b>Interner Wissens-Index (Vector Store)</b><br/>SOPs, IT-Wiki &amp; historische Lösungen<br/><i>Azure AI Search + text-embedding-3-small</i>")]
        BING_GROUNDING["<b>Anonymisierte Web-Recherche</b><br/>Nur neutrale Fehlercodes (PII-gefiltert)<br/><i>Grounding with Bing Search</i>"]
    end

    FS_QUEUE -->|"1. Webhook Trigger"| ORCHESTRATOR
    ORCHESTRATOR <-->|"2. CMDB-Abgleich"| FS_QUEUE
    ORCHESTRATOR <-->|"3. Triage &amp; Pflichtfelder"| AGENT_1
    ORCHESTRATOR <-->|"4. Lösungs-Synthese"| AGENT_2
    AGENT_2 <-->|"5. RAG-Wissenssuche"| VECTOR_STORE
    AGENT_2 <-->|"6. Fehlercode-Suche"| BING_GROUNDING
    ORCHESTRATOR -->|"7. Nur Private Note"| FS_QUEUE
    FS_QUEUE -->|"8. Ticket Closed / Audit"| AGENT_3
    AGENT_3 -->|"8b. KB-Draft &amp; Review-Mail"| FS_QUEUE
    NIGHTLY_SYNC -->|"9. Nacht-Indexierung"| VECTOR_STORE
    VOICE_HOTLINE <-->|"10. Echtzeit-Voice-Stream"| AGENT_2

    classDef fsStyle fill:#f0f6ff,stroke:#0f62fe,stroke-width:1.8px,color:#0f172a;
    classDef azStyle fill:#f0f9ff,stroke:#0284c7,stroke-width:1.8px,color:#0f172a;
    classDef secStyle fill:#f0fdf4,stroke:#0d6832,stroke-width:1.8px,color:#0f172a;
    classDef voiceStyle fill:#f5f3ff,stroke:#5b21b6,stroke-width:1.8px,stroke-dasharray: 5 4,color:#0f172a;

    class FS_QUEUE,ORCHESTRATOR fsStyle;
    class AGENT_1,AGENT_2,AGENT_3 azStyle;
    class VECTOR_STORE,BING_GROUNDING,NIGHTLY_SYNC secStyle;
    class VOICE_HOTLINE voiceStyle;
  `;

  // =========================================================================
  // 5. KARTENSTEUERUNG (PAN, ZOOM & VOLLBILD-MODUS)
  // =========================================================================
  let scale = 0.9;
  let panX = 16;
  let panY = 20;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let movedDistance = 0;

  const archFrame = document.getElementById("architectureFrame");
  const viewport = document.getElementById("mapViewport");
  const canvas = document.getElementById("mapCanvas");
  const zoomLabel = document.getElementById("zoomLevelLabel");
  const fullscreenBtn = document.getElementById("fullscreenBtn");

  function applyTransform() {
    if (!canvas) return;
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    if (zoomLabel) {
      zoomLabel.textContent = `${Math.round(scale * 100)} %`;
    }
  }

  function setZoom(newScale, centerX, centerY) {
    const clamped = Math.min(2.2, Math.max(0.45, newScale));
    if (viewport && typeof centerX === "number" && typeof centerY === "number") {
      const ratio = clamped / scale;
      panX = centerX - (centerX - panX) * ratio;
      panY = centerY - (centerY - panY) * ratio;
    }
    scale = clamped;
    applyTransform();
  }

  function toggleFullscreen() {
    if (!archFrame) return;
    const isNowFull = !archFrame.classList.contains("is-fullscreen");
    if (isNowFull) {
      archFrame.classList.add("is-fullscreen");
      document.body.style.overflow = "hidden";
      if (fullscreenBtn) fullscreenBtn.textContent = "✕ Vollbild beenden";
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else {
      archFrame.classList.remove("is-fullscreen");
      document.body.style.overflow = "";
      if (fullscreenBtn) fullscreenBtn.textContent = "⛶ Vollbild";
      if (document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  function setupMapInteractions() {
    if (!viewport || !canvas) return;
    applyTransform();

    viewport.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      movedDistance = 0;
      dragStartX = e.clientX - panX;
      dragStartY = e.clientY - panY;
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const nextX = e.clientX - dragStartX;
      const nextY = e.clientY - dragStartY;
      movedDistance += Math.abs(nextX - panX) + Math.abs(nextY - panY);
      panX = nextX;
      panY = nextY;
      applyTransform();
    });

    window.addEventListener("mouseup", () => {
      isDragging = false;
    });

    viewport.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const rect = viewport.getBoundingClientRect();
        setZoom(scale + (e.deltaY < 0 ? 0.1 : -0.1), e.clientX - rect.left, e.clientY - rect.top);
      },
      { passive: false }
    );

    document.getElementById("zoomInBtn").addEventListener("click", () => {
      const r = viewport.getBoundingClientRect();
      setZoom(scale + 0.15, r.width / 2, r.height / 2);
    });

    document.getElementById("zoomOutBtn").addEventListener("click", () => {
      const r = viewport.getBoundingClientRect();
      setZoom(scale - 0.15, r.width / 2, r.height / 2);
    });

    document.getElementById("zoomResetBtn").addEventListener("click", () => {
      scale = 0.9;
      panX = 16;
      panY = 20;
      applyTransform();
    });

    if (fullscreenBtn) {
      fullscreenBtn.addEventListener("click", toggleFullscreen);
    }

    document.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement && archFrame && archFrame.classList.contains("is-fullscreen")) {
        archFrame.classList.remove("is-fullscreen");
        document.body.style.overflow = "";
        if (fullscreenBtn) fullscreenBtn.textContent = "⛶ Vollbild";
      }
    });
  }

  function mapEdgeTextToKey(txt) {
    const clean = (txt || "").trim();
    if (clean.startsWith("1.")) return "E1";
    if (clean.startsWith("2.")) return "E2";
    if (clean.startsWith("3.")) return "E3";
    if (clean.startsWith("4.")) return "E4";
    if (clean.startsWith("5.")) return "E5";
    if (clean.startsWith("6.") || clean.startsWith("7.")) return "E6";
    if (clean.startsWith("8")) return "E7";
    if (clean.startsWith("9.")) return "E8";
    if (clean.startsWith("10.")) return "E9";
    return null;
  }

  async function renderDiagram() {
    const container = document.getElementById("mermaidContainer");
    if (!container || typeof mermaid === "undefined") return;

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: "base",
      themeVariables: {
        fontFamily: '"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: "15px",
        primaryColor: "#f0f6ff",
        primaryBorderColor: "#0f62fe",
        lineColor: "#64748b",
        clusterBkg: "#ffffff",
        clusterBorder: "#cbd5e1"
      },
      flowchart: {
        useMaxWidth: false,
        htmlLabels: true,
        nodeSpacing: 56,
        rankSpacing: 90,
        curve: "basis"
      }
    });

    const { svg } = await mermaid.render("enterpriseArchSvg", MERMAID_DEF);
    container.innerHTML = svg;
    applyTransform();

    const svgEl = container.querySelector("svg");
    if (!svgEl) return;

    svgEl.querySelectorAll(".node").forEach((nodeEl) => {
      const id = nodeEl.id || "";
      const key = Object.keys(NODE_DETAILS).find(
        (k) => id.includes(`-${k}-`) || id.endsWith(`-${k}`) || id === k
      );
      if (key) {
        nodeEl.addEventListener("click", (e) => {
          if (movedDistance > 6) return;
          e.stopPropagation();
          openModal(NODE_DETAILS[key]);
        });
      }
    });

    svgEl.querySelectorAll(".edgeLabel").forEach((labelEl) => {
      const edgeKey = mapEdgeTextToKey(labelEl.textContent);
      if (edgeKey && EDGE_DETAILS[edgeKey]) {
        labelEl.addEventListener("click", (e) => {
          if (movedDistance > 6) return;
          e.stopPropagation();
          openModal(EDGE_DETAILS[edgeKey]);
        });
      }
    });
  }

  function renderEdgeMatrix() {
    const grid = document.getElementById("edgeButtonsGrid");
    if (!grid) return;
    grid.innerHTML = "";
    Object.keys(EDGE_DETAILS).forEach((key) => {
      const item = EDGE_DETAILS[key];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "edge-btn";
      btn.innerHTML = `<span>${item.label}</span><span class="edge-pill">Spezifikation →</span>`;
      btn.addEventListener("click", () => openModal(item));
      grid.appendChild(btn);
    });
  }

  // =========================================================================
  // 6. DETAIL-MODAL (7 STRUKTURIERTE BEREICHE AUF REINWEISSEM HINTERGRUND)
  // =========================================================================
  const modal = document.getElementById("infoModal");

  function openModal(data) {
    if (!data || !modal) return;
    document.getElementById("modalCategory").textContent = data.category;
    document.getElementById("modalTitle").textContent = data.title;
    document.getElementById("modalWhat").textContent = data.what;
    document.getElementById("modalTools").textContent = data.tools || "Microsoft Azure & Freshservice";
    document.getElementById("modalWhere").textContent = data.where;
    document.getElementById("modalSecurity").textContent = data.security;
    document.getElementById("modalEvolution").textContent =
      data.evolution || "Pilot: 100 % Human-in-the-Loop; schrittweise auf Stufe 2 & 3 erweiterbar.";

    const ulHow = document.getElementById("modalHow");
    ulHow.innerHTML = "";
    data.how.forEach((step) => {
      const li = document.createElement("li");
      li.textContent = step;
      ulHow.appendChild(li);
    });

    const ulBlocked = document.getElementById("modalBlocked");
    ulBlocked.innerHTML = "";
    const blockedItems = data.blocked || [
      "Keine unkontrollierten Schreibaktionen ohne vorherige Berechtigungsprüfung."
    ];
    blockedItems.forEach((rule) => {
      const li = document.createElement("li");
      li.textContent = rule;
      ulBlocked.appendChild(li);
    });

    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    if (!archFrame || !archFrame.classList.contains("is-fullscreen")) {
      document.body.style.overflow = "";
    }
  }

  document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (modal && !modal.hidden) {
        closeModal();
      } else if (archFrame && archFrame.classList.contains("is-fullscreen")) {
        toggleFullscreen();
      }
    }
  });

  // =========================================================================
  // 7. FINOPS-SIMULATOR MIT KLICKBAREN EINZELPOSITIONEN
  // =========================================================================
  function formatEuro(val) {
    return (
      val.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }) + " €"
    );
  }

  function createCostButton(title, sub, amountStr, detailKey) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cost-item-btn";
    btn.innerHTML = `
      <div class="cost-item-left">
        <span class="cost-item-title">${title}</span>
        <span class="cost-item-sub">${sub}</span>
      </div>
      <div class="cost-item-right">
        <span class="cost-item-val">${amountStr}</span>
        <span class="cost-info-icon">Details →</span>
      </div>
    `;
    btn.addEventListener("click", () => openModal(COST_ITEM_DETAILS[detailKey]));
    return btn;
  }

  function updateFinancialDashboard() {
    const tickets = Number(document.getElementById("ticketSlider").value);
    const calls = Number(document.getElementById("callSlider").value);
    const rate = Number(document.getElementById("rateSlider").value);

    document.getElementById("ticketCountLabel").textContent = `${tickets.toLocaleString("de-DE")} Tickets`;
    document.getElementById("callCountLabel").textContent = `${calls.toLocaleString("de-DE")} Anrufe`;
    document.getElementById("rateLabel").textContent = `${rate} € / Std.`;

    const ft = tickets / 1000;
    const fc = calls / 750;

    const costA1 = 1.60 * ft;
    const costA2 = 6.20 * ft;
    const costA3 = 2.40 * ft;
    const costBingComp = 1.80 * ft + 0.15;
    const costRagInfra = 1.35;
    const totalStage1 = costA1 + costA2 + costA3 + costBingComp + costRagInfra;

    document.getElementById("costStage1Total").innerHTML = `${formatEuro(totalStage1)} <span>/ Monat (Zusatzkosten)</span>`;

    const s1Container = document.getElementById("breakdownStage1");
    s1Container.innerHTML = "";
    s1Container.appendChild(
      createCostButton(
        "Freshservice REST API, Webhooks & CMDB",
        "Bestehender Tarifplan • Keine teuren KI-Seat-Add-ons",
        "0,00 € (inkl.)",
        "COST_FS"
      )
    );
    s1Container.appendChild(
      createCostButton(
        "Azure AI Foundry: Agent 1 (gpt-4.1-mini)",
        "Triage & Routing • Tenant-AVV geprüft • Günstiger als Claude API",
        formatEuro(costA1),
        "COST_AGENT1"
      )
    );
    s1Container.appendChild(
      createCostButton(
        "Azure AI Foundry: Agent 2 (gpt-4.1)",
        "Wissens-Synthese & interne Notiz (EU Data Zone)",
        formatEuro(costA2),
        "COST_AGENT2"
      )
    );
    s1Container.appendChild(
      createCostButton(
        "Azure AI Foundry: Agent 3 + Microsoft Graph",
        "Anonymisierte KB-Drafts & wöchentlicher Aktualitäts-Audit",
        formatEuro(costA3),
        "COST_AGENT3"
      )
    );
    s1Container.appendChild(
      createCostButton(
        "Compliance, Bing Grounding & Key Vault",
        "Anonymisierte Web-Suche, Secret-Tresor & Audit-Log",
        formatEuro(costBingComp),
        "COST_COMPLIANCE_BING"
      )
    );
    s1Container.appendChild(
      createCostButton(
        "100 % Azure PaaS: AI Search & Serverless Functions",
        "Kein VM-Betrieb nötig • 1 Mio. Aufrufe gratis",
        formatEuro(costRagInfra),
        "COST_INFRA_RAG"
      )
    );

    const costSpeech = 82.50 * fc;
    const costSip = 68.00 * fc;
    const costVoiceLlm = 51.00 * fc;
    const totalStage2 = totalStage1 + costSpeech + costSip + costVoiceLlm;

    document.getElementById("costStage2Total").innerHTML = `${formatEuro(totalStage2)} <span>/ Monat (Gesamtkosten)</span>`;

    const s2Container = document.getElementById("breakdownStage2");
    s2Container.innerHTML = "";
    s2Container.appendChild(
      createCostButton(
        "Basis-Betrieb Stufe 1 (Alle 3 Ticket-Agenten & RAG)",
        `Kompletter Ticket- & Wissensbetrieb (${tickets.toLocaleString("de-DE")} Tickets)`,
        formatEuro(totalStage1),
        "COST_AGENT2"
      )
    );
    s2Container.appendChild(
      createCostButton(
        "Azure AI Speech Services (STT & Neural TTS)",
        `Echtzeit-Spracherkennung & deutsche Stimme (${calls.toLocaleString("de-DE")} Calls)`,
        formatEuro(costSpeech),
        "COST_VOICE_SPEECH"
      )
    );
    s2Container.appendChild(
      createCostButton(
        "Azure Communication Services (SIP-Telefonie)",
        "Telefonie-Anbindung & Rufnummern-Routing (Minutenbasis)",
        formatEuro(costSip),
        "COST_VOICE_SIP"
      )
    );
    s2Container.appendChild(
      createCostButton(
        "Echtzeit-Dialog-KI für Telefon-Support",
        "Gesprächsführung & automatische Ticket-Zusammenfassung",
        formatEuro(costVoiceLlm),
        "COST_VOICE_LLM"
      )
    );

    const savedHours = (tickets * 5 + calls * 4) / 60;
    const activeCost = calls > 0 ? totalStage2 : totalStage1;
    const netSavings = Math.max(0, savedHours * rate - activeCost);
    const breakEvenTickets = Math.max(1, Math.ceil(totalStage1 / ((5 / 60) * rate)));
    const dailyNet = netSavings / 21;
    const paybackDays = dailyNet > 0 ? Math.max(1, Math.ceil((16 * rate) / dailyNet)) : 0;

    document.getElementById("savedHoursValue").textContent = `${savedHours.toLocaleString("de-DE", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })} Std. / Mon.`;

    document.getElementById("savedHoursDetail").textContent =
      calls > 0
        ? `Ø 5 Min./Ticket (${tickets.toLocaleString("de-DE")}) + 4 Min./Call (${calls.toLocaleString("de-DE")})`
        : `Ø 5 Min. Zeitersparnis pro Ticket (${tickets.toLocaleString("de-DE")} Tickets)`;

    document.getElementById("netSavingsValue").textContent = `${Math.round(netSavings).toLocaleString("de-DE")} € / Mon.`;
    document.getElementById("breakEvenTicketsValue").textContent = `Ab dem ${breakEvenTickets}. Ticket`;
    document.getElementById("setupPaybackValue").textContent =
      paybackDays > 0 ? `Nach ca. ${paybackDays} Arbeitstagen` : "Sofort";
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupMapInteractions();
    renderEdgeMatrix();
    renderDiagram();
    updateFinancialDashboard();

    ["ticketSlider", "callSlider", "rateSlider"].forEach((id) => {
      document.getElementById(id).addEventListener("input", updateFinancialDashboard);
    });
  });
})();
/* =========================================================================
   TOUCH-UNTERSTÜTZUNG FÜR SMARTPHONE & TABLET (PAN & PINCH-TO-ZOOM)
   ========================================================================= */
(function () {
  const vp = document.getElementById("mapViewport");
  const cv = document.getElementById("mapCanvas");
  const lbl = document.getElementById("zoomLevelLabel");
  if (!vp || !cv) return;

  let touchMode = null;
  let lastX = 0;
  let lastY = 0;
  let lastDist = 0;

  function parseTransform() {
    const m = (cv.style.transform || "").match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/);
    if (!m) return { x: 16, y: 20, s: 0.9 };
    return { x: parseFloat(m[1]), y: parseFloat(m[2]), s: parseFloat(m[3]) };
  }

  function writeTransform(x, y, s) {
    cv.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    if (lbl) lbl.textContent = `${Math.round(s * 100)} %`;
  }

  vp.addEventListener("touchstart", function (e) {
    if (e.touches.length === 1) {
      touchMode = "pan";
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      touchMode = "pinch";
      lastDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }, { passive: true });

  vp.addEventListener("touchmove", function (e) {
    if (touchMode === "pan" && e.touches.length === 1) {
      e.preventDefault();
      const dx = e.touches[0].clientX - lastX;
      const dy = e.touches[0].clientY - lastY;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
      const cur = parseTransform();
      writeTransform(cur.x + dx, cur.y + dy, cur.s);
    } else if (touchMode === "pinch" && e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (lastDist > 0) {
        const cur = parseTransform();
        const nextScale = Math.min(2.2, Math.max(0.35, cur.s * (dist / lastDist)));
        writeTransform(cur.x, cur.y, nextScale);
      }
      lastDist = dist;
    }
  }, { passive: false });

  vp.addEventListener("touchend", function () {
    touchMode = null;
    lastDist = 0;
  });

  if (window.innerWidth < 768) {
    window.addEventListener("load", function () {
      setTimeout(() => writeTransform(8, 12, 0.45), 250);
    });
  }
})();
