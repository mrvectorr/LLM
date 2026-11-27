(function () {
  "use strict";

  // =========================================================================
  // 1. TIEFGEHENDE TECHNISCHE SPEZIFIKATIONEN FÜR ALLE SYSTEM-BAUSTEINE
  // =========================================================================
  const NODE_DETAILS = {
    FS_QUEUE: {
      category: "Ticketsystem & Asset-CMDB • Freshservice",
      title: "Freshservice Queue „KI-Triage“ & Asset-CMDB",
      what:
        "Zentraler Eingangspunkt für alle eingehenden IT-Störungen und Serviceanfragen. Neu erstellte Tickets werden regelbasiert in die isolierte Warteschlange „KI-Triage“ geleitet. Parallel dazu stellt die integrierte CMDB (Configuration Management Database) Stammdaten zu Computernummern, Seriennummern und zugewiesenen Endgeräten bereit.",
      tools:
        "Freshservice ITSM • Workflow Automator • Freshservice REST API v2 (/api/v2/tickets, /assets, /notes) • Integrierte CMDB",
      where:
        "Freshservice Admin → Agentengruppen (Gruppe „KI-Triage“), Workflow Automator (Ticket-Erstellung) & Assets (CMDB)",
      how: [
        "Dedizierte Agentengruppe „KI-Triage“ sowie einen eingeschränkten technischen Service-Account („KI-Assistent“) anlegen.",
        "Automatisierungsregel: Jedes neu eingehende Ticket ohne Opt-out-Tag („keine-ki“ / „manuell“) wird der Queue „KI-Triage“ zugewiesen.",
        "CMDB-Abfrage-Logik: Primäre Suche über erkannte Asset-Tags im Tickettext (z. B. NB-4711, PC-1024); sekundärer Fallback über die Requester-ID des Meldenden.",
        "API-Rate-Limit-Steuerung: HTTP-Session mit automatischem Retry-Backoff bei HTTP 429 und festem Timeout von 15 Sekunden."
      ],
      security:
        "Transportverschlüsselung über TLS 1.3. Dem API-Account sind auf Rollenebene ausschließlich Lese- und interne Notizrechte zugewiesen – öffentliche Kundenantworten (Public Replies) und Ticket-Abschlüsse (Status 5) sind technisch gesperrt.",
      evolution:
        "Aktuell reine Eingangsprüfung und interne Anreicherung. Später kann der Workflow Automator für definierte Service-Katalog-Items (z. B. Software-Standardpakete) automatische Genehmigungs- oder Bereitstellungsschritte anstoßen."
    },

    ORCHESTRATOR: {
      category: "Steuerung, Guardrails & Audit • Azure Serverless",
      title: "Serverless Orchestrator, Kollisionsschutz & PII-Filter",
      what:
        "Deterministische Steuerungsschicht zwischen Freshservice und den KI-Agenten. Sie übernimmt das atomare Sperren (Claiming) eines Tickets während der Analyse, verhindert Überschneidungen mit menschlichen Technikern, bereinigt personenbezogene Daten vor externen Suchen und protokolliert jeden Vorgang revisionssicher.",
      tools:
        "Azure Functions (Linux, Python 3.11, Consumption Plan Y1) • Azure Key Vault (RBAC) • Azure Table Storage • Pydantic v2",
      where:
        "Azure Portal → Ressourcengruppe rg-servicedesk-ai-prod → Function App, Key Vault & Storage Account",
      how: [
        "Pre-Flight-Kollisionsschutz: Bearbeitung startet nur, wenn responder_id leer ist, das Ticket in „KI-Triage“ liegt und die letzte Änderung mindestens 3 Minuten zurückliegt.",
        "Atomares Claiming & Post-Flight-Check: Während der KI-Laufzeit wird der KI-Service-Account als Bearbeiter eingetragen; unmittelbar vor dem Schreiben der Notiz wird erneut geprüft, ob inzwischen ein Techniker übernommen hat.",
        "Deterministischer PII-Sanitizer (Regex-Pipeline): Entfernt E-Mail-Adressen, IPv4-Adressen, Telefonnummern, Hostnamen (NB-/PC-/LAP-/SRV-*) und Grußformeln mit Klarnamen vor externen Aufrufen.",
        "Revisionssicheres FinOps-Log: Jede Ausführung schreibt PartitionKey (YYYY-MM), Agentenname, Input-/Output-Tokens und exakte Cent-Kosten in Azure Table Storage."
      ],
      security:
        "Zero-Trust-Modell ohne Secrets im Quellcode: Authentifizierung zwischen Azure-Diensten per System-Assigned Managed Identity (DefaultAzureCredential); externe Freshservice-Keys werden ausschließlich zur Laufzeit aus dem Azure Key Vault geladen.",
      evolution:
        "Die Guardrail-Engine steuert zentral den Autonomiegrad. Über Konfigurations-Flags pro Ticket-Kategorie lassen sich einzelne Ticketarten schrittweise von „Nur interne Notiz“ auf „Teilautomatisierte Rückfrage“ umstellen."
    },

    AGENT_1: {
      category: "KI-Agent 1 • Azure AI Foundry (gpt-4.1-mini)",
      title: "Agent 1: Triage-, Pflichtfeld- & Routing-Agent",
      what:
        "Führt die strukturierte Erstklassifizierung jedes neuen Tickets durch. Erkennt Problemkategorie, Dringlichkeit (Priorität 1–4) und zuständige IT-Fachgruppe und prüft bei Hardware-/Client-Meldungen, ob eine gültige Computernummer vorliegt oder über die CMDB ermittelt werden konnte.",
      tools:
        "Azure AI Foundry Agent Service • Modell: gpt-4.1-mini (Data Zone Standard EU) • Function Calling (lookup_cmdb_asset)",
      where:
        "Azure AI Foundry Portal → Projekt Servicedesk (Sweden Central) → Agents → servicedesk-agent-1-triage",
      how: [
        "Modell-Konfiguration: gpt-4.1-mini mit Temperatur 0.0 (maximale Deterministik), Max-Tokens 400 und striktem JSON-Schema-Output.",
        "Pflichtfeld-Validierung: Wird ein Client-/Hardware-Problem erkannt (is_pc_issue: true) und liegt weder im Text noch in der CMDB ein Gerät vor, setzt der Orchestrator das Tag „pflichtdaten-fehlen“ und stoppt die weitere KI-Recherche.",
        "Fachgruppen-Routing: Ordnet das Ticket automatisiert den Zielgruppen 1st-Level-Support, Client-Management, Netzwerk-Infra oder M365-Admin zu."
      ],
      security:
        "Prompt-Injection-Schutz: Ticket-Betreff und -Beschreibung werden in XML-Tags (<ticket_content>) als nicht vertrauenswürdige Nutzereingabe gekapselt. Der System-Prompt verbietet die Ausführung von Anweisungen aus dem Tickettext.",
      evolution:
        "Aktuell setzt Agent 1 Tags und Zielgruppen für das Support-Team. In einer nächsten Ausbaustufe kann bei fehlender Computernummer automatisiert eine standardisierte Rückfrage-Vorlage an den Meldenden versendet werden."
    },

    AGENT_2: {
      category: "KI-Agent 2 • Azure AI Foundry (gpt-4.1)",
      title: "Agent 2: Wissens- & Lösungs-Agent (Human-in-the-Loop)",
      what:
        "Erstellt für den zuständigen IT-Techniker eine strukturierte Voranalyse mit konkreten Lösungswegen. Kombiniert interne Wissensquellen (SharePoint-Wiki, Freshservice KB, historische gelöste Tickets) mit einer anonymisierten Hersteller-Recherche bei unbekannten Fehlercodes.",
      tools:
        "Azure AI Foundry Agent Service • Modell: gpt-4.1 (Data Zone Standard EU) • Azure AI Search • Grounding with Bing Search",
      where:
        "Azure AI Foundry Portal → Projekt Servicedesk → Agents → servicedesk-agent-2-knowledge",
      how: [
        "Modell-Konfiguration: gpt-4.1 (EU Data Zone), Temperatur 0.1, Max-Tokens 1.200 mit aktiviertem Prompt Caching für den System-Prompt.",
        "RAG-Priorisierung: Ruft zunächst die Top-5-Treffer aus Azure AI Search ab. Nur wenn der Relevanz-Score unter 0,78 liegt, wird eine anonymisierte Bing-Recherche ausgelöst.",
        "Standardisierte HTML-Struktur der internen Notiz: 1. KI-Zusammenfassung, 2. Gefundene Wissensquellen, 3. Empfohlene Prüfungsschritte für Techniker, 4. Antwortentwurf für Endanwender."
      ],
      security:
        "100 % Human-in-the-Loop: Die Ausgabe wird über den Freshservice-Connector hart codiert mit „private: true“ gespeichert. Endanwender erhalten niemals ungeprüfte KI-Texte.",
      evolution:
        "Aktuell reiner Co-Pilot für Techniker. Bei wiederkehrenden Standardproblemen mit hohem Wissens-Score (≥ 0,92) kann das System später direkt einen vorausgefüllten Antwortentwurf im Ticket-Editor öffnen."
    },

    VECTOR_STORE: {
      category: "Interne Wissensbasis • Azure AI Search",
      title: "Semantischer Wissens-Index (Azure AI Search Vector Store)",
      what:
        "Zentrales semantisches Wissensgedächtnis des IT-Servicedesks. Speichert alle internen Standard-Arbeitsanweisungen (SOPs), SharePoint-Wiki-Seiten, veröffentlichten Freshservice-KB-Artikel und anonymisierten historischen Ticketlösungen.",
      tools:
        "Azure AI Search (Basic Tier, Sweden Central) • HNSW-Vektorindex (1.536 Dimensionen) • Embedding-Modell: text-embedding-3-small (EU)",
      where:
        "Azure Portal → Azure AI Search → Index „it-servicedesk-kb“",
      how: [
        "Index-Schema: Schlüsselfeld (SHA-256-Hash), Quelltyp (WIKI_PAGE, KB_ARTICLE, RESOLVED_TICKET), Titel, Text-Chunk, Zeitstempel und 1.536-dimensionaler Vektor.",
        "Chunking-Strategie: Zerlegung langer Dokumente in Abschnitte à 2.400 Zeichen mit 300 Zeichen Überlappung für präzise Kontexttreffer.",
        "Hybrid-Retrieval: Kombination aus Vektor-Ähnlichkeitssuche (HNSW) und semantischem Ranking."
      ],
      security:
        "Datenhaltung ausschließlich im EU-Rechenzentrum Sweden Central. Zugriff durch die Function App erfolgt passwortlos über RBAC (Search Index Data Contributor).",
      evolution:
        "Erweiterbar um zusätzliche Fachbereichs-Dokumentationen (z. B. ERP-/SAP-Handbücher oder Hardware-Rollout-Leitfäden) durch einfache Anbindung weiterer SharePoint-Sites."
    },

    BING_GROUNDING: {
      category: "Externe Recherche • Microsoft Bing Grounding",
      title: "Anonymisierte Web-Recherche (Grounding with Bing Search)",
      what:
        "Ergänzt das interne Firmenwissen bei neuen oder seltenen technischen Fehlercodes durch gezielte Recherche in offiziellen Hersteller-Dokumentationen (z. B. Microsoft Learn, Windows- oder M365-Fehlercodes).",
      tools:
        "Azure AI Foundry Connected Resource: Grounding with Bing Search • Vorgeschalteter Python PII-Sanitizer",
      where:
        "Azure AI Foundry Portal → Management Center → Connected Resources → Grounding with Bing Search",
      how: [
        "Trigger-Bedingung: Wird nur aufgerufen, wenn der interne Vector Store keinen ausreichenden Treffer (Score < 0,78) liefert.",
        "Query-Extraktion: Der PII-Filter entfernt vorab sämtliche Namen, E-Mail-Adressen, IPs, Telefonnummern sowie Hostnamen und reduziert die Anfrage auf max. 120 Zeichen.",
        "Kosten- und Audit-Tracking: Jeder externe Suchaufruf wird im Audit-Log mit „WebSearchTriggered = true“ markiert."
      ],
      security:
        "Strikte Datentrennung: Nach außen gelangen ausschließlich abstrakte technische Fehlercodes (z. B. „Intune Enrollment Error 0x80180014“), keinerlei Unternehmens- oder Personendaten.",
      evolution:
        "Kann bei Bedarf über Domain-Filter zusätzlich auf kuratierte Hersteller-Quellen (z. B. learn.microsoft.com) eingegrenzt werden."
    },

    AGENT_3: {
      category: "KI-Agent 3 • Azure AI Foundry + Microsoft Graph",
      title: "Agent 3: Doku- & Aktualitäts-Agent (KB-Governance)",
      what:
        "Automatisiert die Pflege der IT-Knowledge-Base in zwei Richtungen: Erstellt nach Ticket-Abschluss strukturierte Lösungsartikel-Entwürfe für noch nicht dokumentierte Probleme und überwacht bestehende Artikel auf Aktualität.",
      tools:
        "Azure AI Foundry (gpt-4.1 & gpt-4.1-mini) • Freshservice Solutions API (/api/v2/solutions/articles) • Microsoft Graph Mail API",
      where:
        "Azure AI Foundry (servicedesk-agent-3-docs) & Azure Functions (ticket_closed_hook / weekly_kb_audit)",
      how: [
        "Dubletten-Prüfung bei Ticket-Abschluss: Prüft im Vector Store (Score ≥ 0,85), ob bereits ein passender Artikel existiert, bevor ein Entwurf erzeugt wird.",
        "Verbindliche 4-Punkte-Artikelstruktur: 1. Symptom & Fehlermeldung, 2. Betroffene Systeme / Voraussetzungen, 3. Schritt-für-Schritt-Lösung, 4. Verifikation.",
        "Wöchentlicher Aktualitäts-Audit (Montag 07:00 Uhr): Prüft in Azure Table Storage (KbGovernance) alle Artikel mit LastVerifiedAt > 180 Tage und versendet eine Prüf-E-Mail an den Artikel-Owner."
      ],
      security:
        "Artikel werden über die Freshservice API zwingend mit „status: 1“ (Draft / Entwurf) angelegt und niemals ohne menschliche Freigabe veröffentlicht. Alle Ticketdaten werden vorab anonymisiert.",
      evolution:
        "Aktuell reine Entwurfserstellung und E-Mail-Erinnerung. Später können freigegebene Artikel per Knopfdruck synchron ins SharePoint-Mitarbeiterportal gespiegelt werden."
    },

    NIGHTLY_SYNC: {
      category: "Hintergrund-Pipeline • Kein eigener KI-Agent",
      title: "Nächtlicher Wissens-Sync (SharePoint & Freshservice → Vector Store)",
      what:
        "Vollautomatischer ETL-Hintergrundprozess, der jede Nacht außerhalb der Geschäftszeiten neue oder geänderte SharePoint-Wiki-Seiten, veröffentlichte KB-Artikel und abgeschlossene Tickets in den Vector Store übernimmt.",
      tools:
        "Azure Functions Timer Trigger (CRON: 0 0 2 * * *) • Microsoft Graph API (Sites.Read.All) • Freshservice API • Azure OpenAI Embeddings",
      where:
        "Azure Functions → Funktion „nightly_rag_sync“ (Ausführung täglich um 02:00 Uhr UTC)",
      how: [
        "Inkrementelles Delta-Fenster: Ruft gezielt nur Änderungen der letzten 26 Stunden ab, um API-Kontingente und Embedding-Tokens minimal zu halten.",
        "Anonymisierungs- & Chunking-Pipeline: Bereinigt alle Texte vor der Vektorisierung und aktualisiert bestehende Vektor-IDs idempotent per Upsert.",
        "Vollständige Entkopplung vom Live-Ticketbetrieb (keine Latenz-Auswirkungen tagsüber)."
      ],
      security:
        "Passwortlose Authentifizierung gegen Microsoft Graph über Managed Identity mit minimalen Leserechten (Sites.Read.All).",
      evolution:
        "Kann bei höherer Änderungsfrequenz im IT-Wiki problemlos von nächtlicher auf stündliche Delta-Synchronisation umgestellt werden."
    },

    VOICE_HOTLINE: {
      category: "Ausbaustufe 2 (Optional) • Azure Speech & Communication Services",
      title: "Voice- & TTS-Hotline-Agent (Telefonie-Erweiterung)",
      what:
        "Optionale Ausbaustufe für den telefonischen IT-Support. Nimmt eingehende Anrufe rund um die Uhr in natürlicher deutscher Sprache entgegen, beantwortet Standardfragen direkt aus dem Wissens-Index oder erstellt ein vorqualifiziertes Freshservice-Ticket.",
      tools:
        "Azure Communication Services (SIP-Trunk & Call Automation) • Azure AI Speech Services (STT & Neural TTS) • Azure AI Foundry",
      where:
        "Azure Portal → Azure Communication Services & Azure AI Speech (Region: Sweden Central)",
      how: [
        "SIP-Trunk-Integration: Anbindung an die bestehende Unternehmens-Telefonanlage (z. B. für Überlauf, Mittagszeit oder Rufbereitschaft).",
        "Echtzeit-Sprachpipeline: Streaming Speech-to-Text kombiniert mit neuronaler deutscher Sprachausgabe (z. B. de-DE-KatjaNeural / ConradNeural) unter 800 ms Latenz.",
        "Eskalations-Garantie: Auf Wunsch des Anrufers („Mitarbeiter sprechen“) sofortige Durchstellung an den 1st-Level-Support inklusive Übergabe des Gesprächsprotokolls."
      ],
      security:
        "100 % EU-Datenverarbeitung in Sweden Central. Sprach-Streams werden flüchtig im Arbeitsspeicher verarbeitet und nicht als Audiodatei gespeichert.",
      evolution:
        "Startet optional als Überlauf- und Nacht-Assistent (Stufe 2a) und kann später für Passwort-Reset-Self-Service (mit MFA-Verifizierung) ausgebaut werden (Stufe 2b)."
    }
  };

  // =========================================================================
  // 2. TECHNISCHE DETAILS FÜR ALLE SCHNITTSTELLEN & DATENFLÜSSE (EDGES)
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
      security: "Anfragen ohne gültigen kryptografischen Function-Key werden vom Azure-Frontend sofort mit HTTP 401 abgewiesen.",
      evolution: "Kann um zusätzliche Trigger-Events (z. B. bei erneuter Rückmeldung eines Anwenders) erweitert werden."
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
      security: "Reiner Lesezugriff auf Asset-Stammdaten; API-Zugangsdaten werden zur Laufzeit aus dem Azure Key Vault gelesen.",
      evolution: "Später erweiterbar um Abfrage von Garantie-Status, Betriebssystem-Version oder Intune-Compliance-Status."
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
      security: "Authentifizierung über Entra ID Bearer Token Provider (kein statischer OpenAI-API-Key nötig).",
      evolution: "Feinjustierung der Routing-Regeln jederzeit über die versionierte Prompt-Datei agent1_triage.md im Git-Repository."
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
      security: "Passwortloser Zugriff per System-Assigned Managed Identity.",
      evolution: "Erweiterbar um rollenbasierte Filter (z. B. trennbar nach IT-Infrastruktur, ERP oder Produktions-IT)."
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
      security: "100 % anonymisierte Suchanfrage ohne Rückschluss auf Unternehmen oder Mitarbeiter.",
      evolution: "Optional eingrenzbar auf definierte Hersteller-Dokumentationen."
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
      security: "Technisch ausgeschlossen, dass eine KI-Antwort ungesehen an Endanwender gesendet wird.",
      evolution: "Später für ausgewählte Standard-Tickets auf teilautomatisierte Antwort-Vorbereitung erweiterbar."
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
      security: "Vollständige Entfernung aller Personen- und Gerätedaten vor Erstellung des Artikel-Entwurfs.",
      evolution: "Kann künftig um automatische Verlinkung verwandter Artikel ergänzt werden."
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
      security: "Passwortloser Lesezugriff über Entra ID Managed Identity (Sites.Read.All).",
      evolution: "Frequenz bei Bedarf auf stündliche Aktualisierung anpassbar."
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
      security: "DSGVO-konforme Verarbeitung in der EU ohne dauerhafte Speicherung von Sprachaufnahmen.",
      evolution: "Start als Überlauf-/Nacht-Hotline; später ausbaubar um automatisierte Identitätsprüfung."
    }
  };

  // =========================================================================
  // 3. DETAILLIERTE KOSTENPOSITIONEN (MIT TECHNISCHER & KAUFMÄNNISCHER LOGIK)
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
        "Keine teuren Pro-Agent-KI-Add-ons (spart ca. 29 € – 49 € pro IT-Mitarbeiter und Monat).",
        "Hinweis: Für das Ticket-Claiming wird ein technischer Service-Account oder ein bestehender freier Agenten-Platz genutzt."
      ],
      security: "Alle Zugriffe laufen über den bestehenden Auftragsverarbeitungsvertrag (AVV) mit Freshworks sowie TLS-1.3-Verschlüsselung.",
      evolution: "Skaliert ohne zusätzliche Lizenzgebühren bei steigendem Ticketvolumen."
    },
    COST_AGENT1: {
      category: "Kostenposition • Azure AI Foundry (gpt-4.1-mini)",
      title: "Agent 1: Triage, Pflichtfeldprüfung & Routing",
      what: "Verbrauchsabhängige Token-Kosten für die Echtzeit-Klassifizierung jedes eingehenden Tickets in der EU Data Zone.",
      tools: "Azure AI Foundry • Modell: gpt-4.1-mini (Data Zone Standard EU)",
      where: "Azure Portal → Azure AI Foundry → Deployments → gpt-4-1-mini-eu",
      how: [
        "EU-Listenpreis (Stand 2026): ca. 0,41 € pro 1 Mio. Input-Tokens und 1,63 € pro 1 Mio. Output-Tokens.",
        "Durchschnittlicher Verbrauch pro Ticket: ca. 1.200 Input-Tokens + 250 Output-Tokens ≈ 0,0009 € (unter 0,1 Cent pro Ticket).",
        "Kalkulation für 1.000 Tickets/Monat: ca. 1,60 € (inklusive CMDB-Tool-Call-Runde und Sicherheitsreserve)."
      ],
      security: "Deployment in Sweden Central (Data Zone EU) mit TPM-Rate-Limit (15.000 Tokens/Min.) zum Schutz vor Kosten-Spitzen.",
      evolution: "Selbst bei 5.000 Tickets/Monat liegen die Kosten für Agent 1 unter 8,00 €."
    },
    COST_AGENT2: {
      category: "Kostenposition • Azure AI Foundry (gpt-4.1)",
      title: "Agent 2: Wissens-Synthese, Lösungsweg & Antwortentwurf",
      what: "Verbrauchskosten für das leistungsstarke Analyse-Modell „gpt-4.1“ (EU Data Zone), das aus RAG-Treffern und Fehlercodes die interne Techniker-Notiz erstellt.",
      tools: "Azure AI Foundry • Modell: gpt-4.1 (Data Zone Standard EU)",
      where: "Azure Portal → Azure AI Foundry → Deployments → gpt-4-1-eu",
      how: [
        "EU-Listenpreis (Stand 2026): ca. 2,05 € pro 1 Mio. Input-Tokens und 8,15 € pro 1 Mio. Output-Tokens.",
        "Durchschnittlicher Verbrauch pro Ticket: ca. 2.200 Input-Tokens (inkl. 5 Wiki-Chunks) + 450 Output-Tokens ≈ 0,008 € (0,8 Cent pro Ticket).",
        "Durch Azure Prompt Caching wird der wiederkehrende System-Prompt um 75 % rabattiert; Tickets ohne Pflichtdaten stoppen bereits vor Agent 2."
      ],
      security: "Zero-Data-Retention & kein Modell-Training durch Microsoft im Enterprise-Standard-Tarif.",
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
      security: "Vorgeschalteter PII-Filter verhindert jeden Abfluss personenbezogener Daten bei Bing-Anfragen.",
      evolution: "Transparentes Controlling aller Token- und API-Kosten pro Ticket und Agent in Echtzeit."
    },
    COST_INFRA_RAG: {
      category: "Kostenposition • Wissensspeicher & Serverless Runtime",
      title: "Azure AI Search Vector Store, EU-Embeddings & Nacht-Sync",
      what: "Betriebskosten für den semantischen Vektor-Index, die nächtliche Embedding-Erstellung und die serverlose Code-Ausführung.",
      tools: "Azure AI Search • text-embedding-3-small (EU) • Azure Functions (Consumption)",
      where: "Azure Portal → Azure AI Search & Function App (Sweden Central)",
      how: [
        "Azure Functions (Consumption Plan): Die ersten 1.000.000 Ausführungen und 400.000 GB-Sekunden pro Monat sind dauerhaft kostenlos (0,00 €).",
        "EU-Embeddings (text-embedding-3-small): ca. 0,02 € pro 1 Mio. Tokens (unter 0,10 €/Monat für den nächtlichen Delta-Sync).",
        "Vector Store Speicher & Index-Betrieb (kompaktes IT-Wiki-Volumen): ca. 1,35 € – 1,50 €/Monat."
      ],
      security: "Passwortloser Betrieb über Managed Identity in der EU-Region.",
      evolution: "Skaliert automatisch von 0 auf hunderte gleichzeitige Anfragen ohne Server-Wartung."
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
      security: "Identische EU-Datenschutz- und Compliance-Garantien wie im Ticket-Betrieb.",
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

    subgraph CORE["2. Steuerung, Guardrails &amp; Compliance (Azure EU)"]
        direction TB
        ORCHESTRATOR["<b>Serverless Orchestrator &amp; Kollisionsschutz</b><br/>Pre-/Post-Flight-Check • PII-Filter • Audit-Log<br/><i>Azure Functions (Python 3.11) + Key Vault + Table Storage</i>"]
    end

    subgraph AGENTS["3. Spezialisierte KI-Agenten (Azure AI Foundry • EU Data Zone)"]
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

    classDef fsStyle fill:#f4f8ff,stroke:#0f62fe,stroke-width:1.8px,color:#09090b;
    classDef azStyle fill:#f4f9fc,stroke:#0284c7,stroke-width:1.8px,color:#09090b;
    classDef secStyle fill:#f3faf6,stroke:#116638,stroke-width:1.8px,color:#09090b;
    classDef voiceStyle fill:#f8f5ff,stroke:#5b21b6,stroke-width:1.8px,stroke-dasharray: 5 4,color:#09090b;

    class FS_QUEUE,ORCHESTRATOR fsStyle;
    class AGENT_1,AGENT_2,AGENT_3 azStyle;
    class VECTOR_STORE,BING_GROUNDING,NIGHTLY_SYNC secStyle;
    class VOICE_HOTLINE voiceStyle;
  `;

  // =========================================================================
  // 5. GOOGLE-MAPS-ARTIGE KARTENSTEUERUNG (PAN & ZOOM)
  // =========================================================================
  let scale = 0.88;
  let panX = 16;
  let panY = 20;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let movedDistance = 0;

  const viewport = document.getElementById("mapViewport");
  const canvas = document.getElementById("mapCanvas");
  const zoomLabel = document.getElementById("zoomLevelLabel");

  function applyTransform() {
    if (!canvas) return;
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    if (zoomLabel) {
      zoomLabel.textContent = `${Math.round(scale * 100)} %`;
    }
  }

  function setZoom(newScale, centerX, centerY) {
    const clamped = Math.min(2.0, Math.max(0.5, newScale));
    if (viewport && typeof centerX === "number" && typeof centerY === "number") {
      const ratio = clamped / scale;
      panX = centerX - (centerX - panX) * ratio;
      panY = centerY - (centerY - panY) * ratio;
    }
    scale = clamped;
    applyTransform();
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
      scale = 0.88;
      panX = 16;
      panY = 20;
      applyTransform();
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
        fontSize: "14px",
        primaryColor: "#f4f8ff",
        primaryBorderColor: "#0f62fe",
        lineColor: "#71717a",
        clusterBkg: "#ffffff",
        clusterBorder: "#d4d4d8"
      },
      flowchart: {
        useMaxWidth: false,
        htmlLabels: true,
        nodeSpacing: 52,
        rankSpacing: 85,
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
  // 6. DETAIL-MODAL (6 STRUKTURIERTE BEREICHE AUF REINWEISSEM HINTERGRUND)
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
      data.evolution || "Aktuell 100 % Human-in-the-Loop; schrittweise erweiterbar.";

    const ul = document.getElementById("modalHow");
    ul.innerHTML = "";
    data.how.forEach((step) => {
      const li = document.createElement("li");
      li.textContent = step;
      ul.appendChild(li);
    });

    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
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
        "Triage, Pflichtfeldprüfung & Routing (EU Data Zone)",
        formatEuro(costA1),
        "COST_AGENT1"
      )
    );
    s1Container.appendChild(
      createCostButton(
        "Azure AI Foundry: Agent 2 (gpt-4.1)",
        "Wissens-Synthese & interne Lösungsnotiz (EU Data Zone)",
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
        "Azure AI Search Vector Store & Nacht-Sync",
        "Wissens-Index, EU-Embeddings & Serverless Functions",
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