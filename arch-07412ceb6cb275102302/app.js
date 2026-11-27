(function () {
  "use strict";

  // =========================================================================
  // 1. DETAILS FÜR ALLE ARCHITEKTUR-BAUSTEINE (INKL. EXAKTER TOOLS)
  // =========================================================================
  const NODE_DETAILS = {
    FS_QUEUE: {
      category: "Ticketsystem & CMDB • Freshservice",
      title: "Freshservice Queue „KI-Triage“ & Asset-CMDB",
      what:
        "Eingangspunkt für alle IT-Störungen und Serviceanfragen. Verwendete Tools: Freshservice Workflow Automator, Freshservice REST API v2 und die integrierte Freshservice CMDB (Asset-Datenbank). Neue Tickets landen automatisch in der Warteschlange „KI-Triage“, während die CMDB zugewiesene Notebooks und Computernummern bereitstellt.",
      where:
        "Freshservice Admin → Agentengruppen („KI-Triage“), Workflow Automator & Assets (CMDB)",
      how: [
        "Eigene Warteschlange „KI-Triage“ sowie dedizierten Service-Account „KI-Assistent“ einrichten.",
        "Workflow-Regel aktivieren: Jedes neu erstellte Ticket wird sofort an „KI-Triage“ übergeben.",
        "CMDB-Lesezugriff für Asset-Tags (z. B. NB-4711) und Benutzer-Gerätezuordnungen freigeben.",
        "Harte Rechtebegrenzung: Keine Berechtigung für öffentliche Kundenantworten oder Ticket-Abschlüsse."
      ],
      security:
        "Verschlüsselte HTTPS-Verbindung (TLS 1.3). Der Freshservice API-Schlüssel ist nicht im Quellcode gespeichert, sondern im Azure Key Vault gesichert."
    },

    ORCHESTRATOR: {
      category: "Steuerung & Guardrails • Azure Functions",
      title: "Serverless Orchestrator & Kollisionsschutz (Azure Functions)",
      what:
        "Das technische Rückgrat zwischen Freshservice und den KI-Agenten. Verwendete Tools: Microsoft Azure Functions (Python 3.11), Azure Key Vault (Secret-Verwaltung) und Azure Table Storage (Audit- & Kosten-Protokoll). Prüft vor jeder Aktion, ob bereits ein menschlicher Kollege am Ticket arbeitet.",
      where:
        "Azure Portal → Ressourcengruppe rg-servicedesk-ai-prod → Function App & Key Vault",
      how: [
        "Kollisionsschutz (Pre- & Post-Flight-Check): Bricht sofort ab, sobald ein Mitarbeiter zugewiesen ist oder in den letzten 3 Minuten gearbeitet hat.",
        "Atomares Claiming: Während der wenigen Sekunden Analyse wird der KI-Service-Account als aktueller Bearbeiter markiert und danach wieder entfernt.",
        "Passwortlose Authentifizierung innerhalb von Azure über System-Assigned Managed Identity."
      ],
      security:
        "Zero-Trust-Architektur: Alle Zugangsdaten liegen im Azure Key Vault. Jeder KI-Durchlauf wird mit Token-Verbrauch und Cent-Betrag revisionssicher in Azure Table Storage protokolliert."
    },

    AGENT_1: {
      category: "KI-Agent 1 • Azure AI Foundry (gpt-4.1-mini)",
      title: "Agent 1: Triage-, Pflichtfeld- & Routing-Agent",
      what:
        "Übernimmt die intelligente Eingangsprüfung in Echtzeit. Verwendete Tools: Azure AI Foundry Agent Service mit dem Modell „gpt-4.1-mini“ (EU Data Zone) und direktem CMDB-Abgleich. Erkennt Kategorie, Dringlichkeit und prüft bei PC-Problemen auf eine gültige Computernummer.",
      where:
        "Azure AI Foundry Portal → Projekt Servicedesk → Agents → servicedesk-agent-1-triage",
      how: [
        "Modell „gpt-4.1-mini“ im Deployment-Modus „Data Zone Standard (EU)“ mit 15.000 TPM Limit betreiben.",
        "Pflichtfeld-Regel: Fehlt bei einem Computer-/Hardware-Ticket die Computernummer und liefert auch die CMDB keinen Treffer, wird das Tag „pflichtdaten-fehlen“ gesetzt.",
        "Automatisches Routing an die passende Fachgruppe (1st-Level, Client-Management, Netzwerk-Infra oder M365-Admin)."
      ],
      security:
        "Tickettexte werden als nicht vertrauenswürdige Eingabe gekapselt (Prompt-Injection-Schutz). Agent 1 kann keine E-Mails an Mitarbeiter versenden."
    },

    AGENT_2: {
      category: "KI-Agent 2 • Azure AI Foundry (gpt-4.1)",
      title: "Agent 2: Wissens- & Lösungs-Agent (Human-in-the-Loop)",
      what:
        "Bereitet die fachliche Lösung für unsere IT-Techniker vor. Verwendete Tools: Azure AI Foundry Agent Service mit dem Modell „gpt-4.1“ (EU Data Zone), Azure AI Search Vector Store und Grounding with Bing Search. Schreibt Zusammenfassung, Prüfschritte und Antwortentwurf ausschließlich als interne Notiz.",
      where:
        "Azure AI Foundry Portal → Projekt Servicedesk → Agents → servicedesk-agent-2-knowledge",
      how: [
        "Modell „gpt-4.1“ (EU Data Zone) mit Begrenzung auf maximal 1.200 Output-Tokens pro Ticket.",
        "Strukturierte Ausgabe als interne Notiz: 1. KI-Zusammenfassung, 2. Gefundene Quellen, 3. Prüfschritte für Techniker, 4. Antwortentwurf.",
        "Erweiterbarkeit: Aktuell reiner Assistent für Techniker; kann später für definierte Standardanfragen schrittweise freigeschaltet werden."
      ],
      security:
        "100 % Human-in-the-Loop: Endanwender sehen die KI-Notiz niemals direkt. Erst nach Prüfung durch einen Techniker wird eine Antwort versendet."
    },

    VECTOR_STORE: {
      category: "Interne Wissensbasis • Azure AI Search",
      title: "Semantischer Wissens-Index (Azure AI Search Vector Store)",
      what:
        "Zentrales Firmen-Wissensgedächtnis für den IT-Support. Verwendete Tools: Microsoft Azure AI Search (Basic Tier, Sweden Central) und das EU-Embedding-Modell „text-embedding-3-small“. Enthält alle SharePoint-SOPs, Freshservice-Lösungsartikel und anonymisierte Alttickets.",
      where:
        "Azure Portal → Azure AI Search → Index „it-servicedesk-kb“",
      how: [
        "Hybrid-Suche (Kombination aus semantischer Vektorsuche mit 1.536 Dimensionen und exakter Stichwortsuche).",
        "Relevanz-Schwellenwert Score ≥ 0,78 für verlässliche interne Lösungsvorschläge.",
        "Zugriff ausschließlich per Azure Entra ID Managed Identity ohne API-Schlüssel."
      ],
      security:
        "Alle Inhalte durchlaufen vor der Indexierung einen DSGVO-Filter, der Namen, E-Mail-Adressen und Computernummern entfernt."
    },

    BING_GROUNDING: {
      category: "Externe Recherche • Microsoft Bing Grounding",
      title: "Anonymisierte Web-Recherche (Grounding with Bing Search)",
      what:
        "Sucht bei unbekannten technischen Fehlercodes gezielt in offiziellen Hersteller-Dokumentationen (z. B. Microsoft Learn). Verwendete Tools: Azure AI Foundry „Grounding with Bing Search“ vorgeschaltet mit eigenem PII-Anonymisierungsfilter.",
      where:
        "Azure AI Foundry → Connected Resources → Grounding with Bing Search",
      how: [
        "Wird nur aktiviert, wenn der interne Vector Store keinen Treffer mit Score ≥ 0,78 liefert.",
        "Suchanfragen werden vor dem Verlassen des Firmennetzes auf max. 120 Zeichen gekürzt und von allen Personen-/Gerätedaten befreit."
      ],
      security:
        "Keine Weitergabe von Mitarbeiternamen, E-Mail-Adressen, IP-Adressen oder internen Servernamen an Suchmaschinen."
    },

    AGENT_3: {
      category: "KI-Agent 3 • Azure AI Foundry + Microsoft Graph",
      title: "Agent 3: Doku- & Aktualitäts-Agent",
      what:
        "Hält die IT-Dokumentation aktuell und schließt Wissenslücken. Verwendete Tools: Azure AI Foundry („gpt-4.1“ & „gpt-4.1-mini“), Freshservice Solutions API (Draft-Modus) und Microsoft Graph API (Exchange Online Mail-Benachrichtigung).",
      where:
        "Azure AI Foundry (servicedesk-agent-3-docs) & Azure Functions (ticket_closed_hook / weekly_kb_audit)",
      how: [
        "Bei Ticket-Abschluss: Prüft, ob bereits ein Artikel existiert (Score < 0,85) und legt einen neuen Lösungsartikel strikt als Entwurf (Draft) an.",
        "Wöchentlicher Audit (Montag 07:00 Uhr): Erkennt Artikel älter als 180 Tage und sendet dem Artikel-Verantwortlichen eine Prüf-E-Mail."
      ],
      security:
        "Neue Artikel werden niemals ungeprüft veröffentlicht. Alle Ticketdaten werden vor der Entwurfserstellung vollständig anonymisiert."
    },

    NIGHTLY_SYNC: {
      category: "Hintergrund-Workflow • Kein eigener KI-Agent",
      title: "Nächtlicher Wissens-Sync (SharePoint & Freshservice → Vector Store)",
      what:
        "Automatisierter Nacht-Job (02:00 Uhr), der geänderte IT-Wiki-Seiten und neu gelöste Tickets in den Vector Store überträgt. Verwendete Tools: Azure Functions Timer Trigger, Microsoft Graph API (SharePoint Online) und Azure OpenAI Embeddings.",
      where:
        "Azure Functions → Timer Trigger „nightly_rag_sync“ (Zeitplan: täglich 02:00 Uhr)",
      how: [
        "Inkrementeller Delta-Abruf der letzten 26 Stunden (minimiert API-Last und Embedding-Kosten).",
        "Zerlegung in handliche Textabschnitte (Chunks) und Vektorisierung in der EU-Region."
      ],
      security:
        "Passwortloser Lesezugriff auf SharePoint Online über Microsoft Entra ID Managed Identity (Sites.Read.All)."
    },

    VOICE_HOTLINE: {
      category: "Ausbaustufe 2 (Optional) • Azure Speech & Communication Services",
      title: "Voice- & TTS-Hotline-Agent (Telefonie-Erweiterung)",
      what:
        "Optionale Erweiterung für die telefonische IT-Hotline. Verwendete Tools: Azure Communication Services (SIP-Telefonie), Azure AI Speech Services (Speech-to-Text & neuronale deutsche Sprachausgabe TTS) sowie der bestehende Wissens-Index.",
      where:
        "Azure Portal → Azure Communication Services & Azure AI Speech (Sweden Central)",
      how: [
        "Anbindung an bestehende Telefonanlage per SIP-Trunk (z. B. für Überlauf, Pausen oder Nachtschicht).",
        "Echtzeit-Spracherkennung und natürliche deutsche Stimme (de-DE-KatjaNeural / ConradNeural).",
        "Jederzeitige Übergabe an einen menschlichen Techniker inkl. automatischer Ticket-Zusammenfassung."
      ],
      security:
        "100 % EU-Datenverarbeitung in Sweden Central; keine dauerhafte Speicherung von Sprachmitschnitten."
    }
  };

  // =========================================================================
  // 2. DETAILS FÜR ALLE VERBINDUNGEN / DATENFLÜSSE (EDGES)
  // =========================================================================
  const EDGE_DETAILS = {
    E1: {
      label: "1. Ticket-Eingang: Freshservice → Azure Functions",
      category: "Schnittstelle 1 • Webhook & Kollisionsprüfung",
      title: "Echtzeit-Trigger bei neuem Ticket in „KI-Triage“",
      what:
        "Sobald ein Ticket in Freshservice erstellt wird, sendet der Workflow Automator die Ticket-ID per HTTPS POST an die Azure Function App.",
      where:
        "Freshservice Admin → Workflow Automator → Webhook → Azure Function „freshservice_webhook“",
      how: [
        "Gesichert durch dedizierten Azure Function Key im Header.",
        "Überträgt ausschließlich die numerische Ticket-ID (Datenminimierung)."
      ],
      security:
        "TLS-1.3-Transportverschlüsselung; unautorisierte Zugriffe werden von Azure sofort blockiert."
    },
    E2: {
      label: "2. Asset-Check: Orchestrator ↔ Freshservice CMDB",
      category: "Schnittstelle 2 • CMDB & Pflichtfeldprüfung",
      title: "Abgleich der Computernummer in der Freshservice CMDB",
      what:
        "Prüft über die Freshservice Assets API v2, ob die genannte Computernummer existiert oder welches Gerät dem Meldenden zugewiesen ist.",
      where:
        "Azure Functions (freshservice_client.py) ↔ Freshservice Assets REST API v2",
      how: [
        "Suche nach Asset-Tag (z. B. NB-4711) sowie Fallback-Suche über die Requester-ID.",
        "Markiert Hardware-Tickets ohne gültigen Bezug mit „pflichtdaten-fehlen“."
      ],
      security:
        "Reiner Lesezugriff; API-Schlüssel wird zur Laufzeit aus dem Azure Key Vault bezogen."
    },
    E3: {
      label: "3. Triage & Routing: Orchestrator ↔ Agent 1",
      category: "Schnittstelle 3 • Klassifizierung (gpt-4.1-mini)",
      title: "Priorisierung, Kategorisierung & Weiterleitung an Agent 2",
      what:
        "Agent 1 bewertet Dringlichkeit und Zielgruppe. Nur wenn alle Pflichtdaten vollständig sind, wird Agent 2 für die Lösungsrecherche aktiviert.",
      where:
        "Azure Functions → Azure AI Foundry (gpt-4.1-mini, EU Data Zone)",
      how: [
        "Strukturierte JSON-Antwort für deterministisches Routing in die Fachgruppen.",
        "Stoppt automatische Lösungsrecherche bei fehlenden Pflichtangaben."
      ],
      security:
        "Verarbeitung in der EU Data Zone (Sweden Central) ohne Speicherung oder Modell-Training."
    },
    E4: {
      label: "4. Wissenssuche: Agent 2 ↔ Azure AI Search",
      category: "Schnittstelle 4 • Interne RAG-Abfrage",
      title: "Semantische Suche in SharePoint-SOPs & Alttickets",
      what:
        "Agent 2 ruft die 5 relevantesten Lösungsbausteine aus dem internen Azure AI Search Vector Store ab.",
      where:
        "Azure AI Foundry Agent 2 ↔ Azure AI Search (Index: it-servicedesk-kb)",
      how: [
        "Kombinierte Vektor- und Volltextsuche über alle indexierten Unternehmensdokumente.",
        "Relevanz-Filter auf Score ≥ 0,78."
      ],
      security:
        "Passwortlose Verbindung über Azure Entra ID Managed Identity."
    },
    E5: {
      label: "5. Fehlercode-Suche: Agent 2 ↔ Bing Grounding",
      category: "Schnittstelle 5 • Anonymisierte Web-Recherche",
      title: "DSGVO-bereinigte Recherche unbekannter Fehlercodes",
      what:
        "Bei unbekannten Fehlercodes entfernt der PII-Filter alle Namen und Gerätedaten und sucht über Bing Grounding nach Hersteller-Lösungen.",
      where:
        "PII-Sanitizer → Azure AI Foundry → Grounding with Bing Search",
      how: [
        "Wird nur bei geringem internem Treffer-Score (< 0,78) genutzt.",
        "Suchbegriff wird deterministisch auf neutrale Fehlercodes reduziert."
      ],
      security:
        "100 % anonymisierte Suchanfrage ohne Rückschluss auf Unternehmen oder Mitarbeiter."
    },
    E6: {
      label: "6. Ergebnis: Agent 2 → Freshservice Private Note",
      category: "Schnittstelle 6 • Human-in-the-Loop Schreibschutz",
      title: "Speichern der internen Notiz & Zuweisung an Fachgruppe",
      what:
        "Nach einem letzten Kollisions-Check schreibt das System die Analyse und den Antwortentwurf als interne Notiz ins Ticket und gibt es für den Techniker frei.",
      where:
        "Azure Functions → Freshservice Tickets & Notes API (private: true)",
      how: [
        "Post-Flight-Check verhindert Überschreiben, falls ein Techniker das Ticket gerade geöffnet hat.",
        "Notiz wird hart codiert als „private: true“ (nur intern sichtbar) angelegt."
      ],
      security:
        "Technisch ausgeschlossen, dass eine KI-Antwort ungesehen an Kunden gesendet wird."
    },
    E7: {
      label: "7. Doku & Review: Ticket Closed / Timer → Agent 3",
      category: "Schnittstelle 7 • KB-Drafts & Graph E-Mails",
      title: "Erstellung neuer Artikel-Entwürfe & Aktualitäts-Audit",
      what:
        "Beim Schließen eines Tickets erstellt Agent 3 bei Bedarf einen anonymisierten KB-Entwurf. Wöchentlich prüft er zudem alte Artikel und mailt Verantwortliche an.",
      where:
        "Freshservice Webhook & Timer → Agent 3 → Freshservice KB / Microsoft Graph",
      how: [
        "Dubletten-Prüfung gegen Vector Store (Score < 0,85).",
        "Neue Artikel landen ausschließlich im Status „Draft“ (Entwurf)."
      ],
      security:
        "Vollständige Anonymisierung aller Personen- und Gerätedaten vor Erstellung."
    },
    E8: {
      label: "8. Nacht-Sync: SharePoint & Tickets → Vector Store",
      category: "Schnittstelle 8 • Automatisierter Wissens-Import",
      title: "Nächtliche Synchronisation (täglich 02:00 Uhr)",
      what:
        "Aktualisiert jede Nacht den internen Wissens-Index mit neuen SharePoint-Seiten und gelösten Tickets.",
      where:
        "Azure Functions (nightly_rag_sync) → Microsoft Graph & Freshservice → AI Search",
      how: [
        "Inkrementelle Delta-Synchronisation der letzten 26 Stunden.",
        "Automatische Anonymisierung und Vektorisierung."
      ],
      security:
        "Reine Leserechte über Microsoft Entra ID Managed Identity."
    },
    E9: {
      label: "9. Ausbaustufe 2: Voice-Hotline ↔ Agent 1 & 2",
      category: "Schnittstelle 9 • Echtzeit-Sprachkanal",
      title: "Anbindung der KI-Telefonhotline (Speech STT/TTS)",
      what:
        "Verbindet eingehende Telefonate über Azure Communication & Speech Services mit derselben Wissensbasis und legt automatisch vorqualifizierte Tickets an.",
      where:
        "Azure Communication Services ↔ Azure AI Foundry (Speech + LLM)",
      how: [
        "Echtzeit-Audio-Streaming mit geringer Latenz (< 800 ms) in Sweden Central.",
        "Nahtlose Übergabe an menschliche Kollegen jederzeit möglich."
      ],
      security:
        "DSGVO-konforme Echtzeitverarbeitung in der EU ohne Aufzeichnung von Gesprächsmitschnitten."
    }
  };

  // =========================================================================
  // 3. DETAILLIERTE KOSTENPOSITIONEN (KLICKBAR FÜR POPUP-DETAILS)
  // =========================================================================
  const COST_ITEM_DETAILS = {
    COST_FS: {
      category: "Kostenposition • Freshservice Integration",
      title: "Freshservice API, Webhooks & Service-Account",
      what:
        "Anbindung an euer bestehendes Freshservice-System über die standardmäßige REST API v2, Workflow Automator Webhooks und CMDB-Abfragen.",
      where:
        "Freshservice Admin → Kontoeinstellungen / Tarifplan & Workflow Automator",
      how: [
        "Keine zusätzlichen KI-Add-on-Lizenzen von Freshservice erforderlich (spart ca. 29 € – 49 € pro Agent und Monat).",
        "In den gängigen Freshservice-Tarifen (Growth / Pro / Enterprise) sind API-Zugriffe und Webhooks bereits enthalten.",
        "Optional: 1 bestehender technischer Service-Account oder freier Agenten-Platz für das Ticket-Claiming."
      ],
      security:
        "Durch Nutzung eures bestehenden Freshservice-Vertrags fallen hier 0,00 € zusätzliche Lizenzkosten an."
    },
    COST_AGENT1: {
      category: "Kostenposition • Azure AI Foundry (gpt-4.1-mini)",
      title: "Agent 1: Triage, Pflichtfeldprüfung & Routing",
      what:
        "Verbrauchskosten für die Echtzeit-Klassifizierung jedes eingehenden Tickets mit dem schnellen, kosteneffizienten Modell „gpt-4.1-mini“ in der EU Data Zone.",
      where:
        "Azure Portal → Azure AI Foundry → Deployment „gpt-4-1-mini-eu“ (Data Zone Standard)",
      how: [
        "EU-Tarif (Stand 2026): ca. 0,41 € pro 1 Million Input-Tokens und 1,63 € pro 1 Million Output-Tokens.",
        "Durchschnittlicher Verbrauch pro Ticket: ca. 1.200 Input-Tokens + 250 Output-Tokens ≈ 0,0009 € (unter 0,1 Cent pro Ticket).",
        "Bei 1.000 Tickets/Monat ergeben sich ca. 1,60 € (inkl. CMDB-Abgleich & Sicherheitsreserve)."
      ],
      security:
        "TPM-Rate-Limit auf 15.000 Tokens/Minute begrenzt; Daten verlassen niemals die EU-Region."
    },
    COST_AGENT2: {
      category: "Kostenposition • Azure AI Foundry (gpt-4.1)",
      title: "Agent 2: Wissens-Synthese, Lösungsweg & Antwortentwurf",
      what:
        "Verbrauchskosten für das leistungsstarke Analyse-Modell „gpt-4.1“ (EU Data Zone), das aus Wiki-Treffern, Alttickets und Fehlercodes die strukturierte interne Notiz erstellt.",
      where:
        "Azure Portal → Azure AI Foundry → Deployment „gpt-4-1-eu“ (Data Zone Standard)",
      how: [
        "EU-Tarif (Stand 2026): ca. 2,05 € pro 1 Million Input-Tokens und 8,15 € pro 1 Million Output-Tokens.",
        "Durchschnittlicher Verbrauch pro Ticket: ca. 2.200 Input-Tokens (inkl. RAG-Kontext) + 450 Output-Tokens ≈ 0,008 € (0,8 Cent pro Ticket).",
        "Durch Prompt Caching wird der wiederkehrende System-Prompt um 75 % rabattiert."
      ],
      security:
        "Verarbeitung im EU-Standard-Tarif ohne Logging oder Training durch Microsoft."
    },
    COST_AGENT3: {
      category: "Kostenposition • Azure AI Foundry + Microsoft Graph",
      title: "Agent 3: KB-Artikelentwürfe & Wöchentlicher Aktualitäts-Audit",
      what:
        "Verbrauchskosten für die automatische Erstellung neuer Lösungsartikel (Drafts) nach Ticket-Abschluss sowie die wöchentliche Qualitätsprüfung bestehender Artikel.",
      where:
        "Azure AI Foundry („gpt-4.1“ & „gpt-4.1-mini“) + Microsoft Graph Mail API",
      how: [
        "Nur bei Tickets ohne bestehenden KB-Treffer (ca. 15–20 % der abgeschlossenen Tickets) wird ein Artikelentwurf generiert.",
        "E-Mail-Erinnerungen an Artikel-Verantwortliche laufen über eure bestehende Microsoft-365-Lizenz (0 € Zusatzkosten).",
        "Gesamtkosten bei 1.000 Tickets/Monat: ca. 2,40 €."
      ],
      security:
        "Vor der Artikelerstellung werden alle personenbezogenen Daten restlos entfernt."
    },
    COST_COMPLIANCE_BING: {
      category: "Kostenposition • Compliance, Bing Grounding & Security",
      title: "Anonymisiertes Bing Grounding, Key Vault & Audit-Compliance",
      what:
        "Umfasst die externe Fehlercode-Suche über „Grounding with Bing Search“, die hardwaregesicherte Schlüsselverwaltung im Azure Key Vault sowie das revisionssichere Audit-Log.",
      where:
        "Azure AI Foundry (Bing Grounding), Azure Key Vault & Azure Table Storage",
      how: [
        "Grounding with Bing Search wird nur ausgelöst, wenn intern keine Lösung gefunden wird (ca. 20–25 % der Tickets) → ca. 1,80 € bei 1.000 Tickets.",
        "Azure Key Vault (Standard Tier): ca. 0,03 € pro 10.000 Secret-Abrufe (unter 0,10 €/Monat).",
        "Azure Table Storage (revisionssicheres Token- & Compliance-Protokoll): ca. 0,05 €/Monat."
      ],
      security:
        "Volle DSGVO-Compliance durch vorgeschalteten PII-Filter vor jeder Bing-Anfrage sowie EU-Datenresidenz."
    },
    COST_INFRA_RAG: {
      category: "Kostenposition • Wissensspeicher & Serverless Runtime",
      title: "Azure AI Search Vector Store, Embeddings & Nacht-Sync",
      what:
        "Laufende Kosten für die Speicherung und semantische Durchsuchung eurer internen Wiki-Seiten und Tickets sowie die nächtliche Synchronisation.",
      where:
        "Azure Portal → Azure AI Search, Azure OpenAI Embeddings & Azure Functions",
      how: [
        "Azure Functions (Consumption Plan): Die ersten 1.000.000 Ausführungen pro Monat sind dauerhaft kostenlos (0,00 €).",
        "EU-Embeddings (text-embedding-3-small): ca. 0,02 € pro 1 Million Tokens (unter 0,10 €/Monat für den Nacht-Sync).",
        "Vector Store Speicher & Index-Betrieb (anteilig / kompaktes Index-Volumen): ca. 1,40 € – 1,50 €/Monat."
      ],
      security:
        "Passwortloser Betrieb über Managed Identity in Sweden Central."
    },
    COST_VOICE_SPEECH: {
      category: "Kostenposition • Ausbaustufe 2 (Voice & TTS)",
      title: "Azure AI Speech Services (Speech-to-Text & Neural Text-to-Speech)",
      what:
        "Echtzeit-Spracherkennung des Anrufers (STT) und natürliche deutsche Sprachausgabe des KI-Assistenten (Neural TTS) in der EU-Region.",
      where:
        "Azure Portal → Azure AI Speech Services (Region: Sweden Central)",
      how: [
        "Kalkulationsbasis: Ø 4 Minuten Gesprächsdauer pro Hotline-Anruf (750 Anrufe = 50 Gesprächsstunden/Monat).",
        "Echtzeit Speech-to-Text (Standard): ca. 0,95 € pro Audiostunde.",
        "Neural Text-to-Speech (deutsche Premium-Stimme): ca. 0,70 € pro Gesprächsstunde (basierend auf gesprochenem Textanteil).",
        "Gesamt für 750 Anrufe (50 Std.): ca. 82,50 €/Monat."
      ],
      security:
        "Audio-Streams werden ausschließlich flüchtig im Arbeitsspeicher in Sweden Central verarbeitet."
    },
    COST_VOICE_SIP: {
      category: "Kostenposition • Ausbaustufe 2 (Telefonie)",
      title: "Azure Communication Services (SIP-Trunk & Telefonminuten)",
      what:
        "Anbindung eurer bestehenden Telefonanlage an die Azure-Cloud für eingehende Hotline-Anrufe und Weiterleitungen an menschliche Techniker.",
      where:
        "Azure Portal → Azure Communication Services → Voice & SIP Routing",
      how: [
        "Keine teuren festen Callcenter-Agentenlizenzen – minutengenaue Abrechnung.",
        "Kalkulation für 750 Anrufe à 4 Minuten (3.000 Gesprächsminuten/Monat) inkl. Rufnummern-Routing: ca. 68,00 €/Monat."
      ],
      security:
        "Verschlüsselte Sprachübertragung (SRTP / TLS) nach Enterprise-Standard."
    },
    COST_VOICE_LLM: {
      category: "Kostenposition • Ausbaustufe 2 (Dialog-KI)",
      title: "Echtzeit-Dialog-KI für telefonische Problemlösung",
      what:
        "KI-Rechenzeit während des aktiven Telefongesprächs (Verstehen von Rückfragen, Abgleich mit dem internen Wiki und Erstellung der Ticket-Zusammenfassung).",
      where:
        "Azure AI Foundry (gpt-4.1-mini für schnelle Dialogführung + gpt-4.1 für Lösungsabgleich)",
      how: [
        "Mehrstufiger Dialog pro Anruf (ca. 6–8 Gesprächswechsel à 4 Minuten).",
        "Kalkulation für 750 Anrufe/Monat: ca. 51,00 €/Monat."
      ],
      security:
        "Gleiche EU-Data-Zone- und Datenschutz-Garantien wie im Ticket-Betrieb."
    }
  };

  // =========================================================================
  // 4. MERMAID ARCHITEKTUR-DEFINITION (GROSS, KLAR & MIT TOOL-ANGABEN)
  // =========================================================================
  const MERMAID_DEF = `
flowchart LR
    subgraph EXT["1. Eingangs- & Quellsysteme (Unternehmen)"]
        direction TB
        FS_QUEUE["<b>Freshservice ITSM &amp; CMDB</b><br/>Queue: KI-Triage • Assets &amp; KB<br/><i>Tool: Freshservice REST API v2</i>"]
        VOICE_HOTLINE["<b>Ausbaustufe 2: KI-Telefonhotline</b><br/>24/7 Sprachannahme &amp; Weiterleitung<br/><i>Tools: Azure Comm. Services + Speech STT/TTS</i>"]
        NIGHTLY_SYNC["<b>Nächtlicher Wissens-Sync (02:00 Uhr)</b><br/>SharePoint IT-Wiki &amp; gelöste Tickets<br/><i>Tools: Azure Timer + MS Graph API</i>"]
    end

    subgraph CORE["2. Steuerung, Guardrails &amp; Compliance (Azure EU)"]
        direction TB
        ORCHESTRATOR["<b>Serverless Orchestrator &amp; Kollisionsschutz</b><br/>Pre-/Post-Flight-Check • PII-Filter • Audit-Log<br/><i>Tools: Azure Functions (Python) + Key Vault + Table Storage</i>"]
    end

    subgraph AGENTS["3. Spezialisierte KI-Agenten (Azure AI Foundry • EU Data Zone)"]
        direction TB
        AGENT_1["<b>Agent 1: Triage, Pflichtfeld &amp; Routing</b><br/>Prio 1–4 • PC-Nr.-Check • Fachgruppen-Routing<br/><i>Modell: gpt-4.1-mini (Data Zone EU)</i>"]
        AGENT_2["<b>Agent 2: Wissens- &amp; Lösungs-Agent</b><br/>Interne Recherche • Fehlercode-Analyse • Private Note<br/><i>Modell: gpt-4.1 (Data Zone EU)</i>"]
        AGENT_3["<b>Agent 3: Doku- &amp; Aktualitäts-Agent</b><br/>Anonymisierte KB-Drafts • 180-Tage-Audit-Mails<br/><i>Modelle: gpt-4.1 + gpt-4.1-mini + MS Graph</i>"]
    end

    subgraph KNOWLEDGE["4. Wissen &amp; Externe Recherche"]
        direction TB
        VECTOR_STORE[("<b>Interner Wissens-Index (Vector Store)</b><br/>SOPs, IT-Wiki &amp; historische Lösungen<br/><i>Tools: Azure AI Search + text-embedding-3-small</i>")]
        BING_GROUNDING["<b>Anonymisierte Web-Recherche</b><br/>Nur neutrale Fehlercodes (PII-gefiltert)<br/><i>Tool: Grounding with Bing Search</i>"]
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

    classDef fsStyle fill:#eef6ff,stroke:#0071e3,stroke-width:2px,color:#1d1d1f;
    classDef azStyle fill:#f0f9ff,stroke:#0284c7,stroke-width:2px,color:#1d1d1f;
    classDef secStyle fill:#eafaf1,stroke:#1d8348,stroke-width:2px,color:#1d1d1f;
    classDef voiceStyle fill:#f5f0ff,stroke:#6e40c9,stroke-width:2px,stroke-dasharray: 6 4,color:#1d1d1f;

    class FS_QUEUE,ORCHESTRATOR fsStyle;
    class AGENT_1,AGENT_2,AGENT_3 azStyle;
    class VECTOR_STORE,BING_GROUNDING,NIGHTLY_SYNC secStyle;
    class VOICE_HOTLINE voiceStyle;
  `;

  // =========================================================================
  // 5. GOOGLE-MAPS-ARTIGE KARTENSTEUERUNG (PAN & ZOOM) + MERMAID RENDERING
  // =========================================================================
  let scale = 1.0;
  let panX = 16;
  let panY = 16;
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
    const clamped = Math.min(2.0, Math.max(0.55, newScale));
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
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        setZoom(scale + delta, cursorX, cursorY);
      },
      { passive: false }
    );

    document.getElementById("zoomInBtn").addEventListener("click", () => {
      const rect = viewport.getBoundingClientRect();
      setZoom(scale + 0.15, rect.width / 2, rect.height / 2);
    });

    document.getElementById("zoomOutBtn").addEventListener("click", () => {
      const rect = viewport.getBoundingClientRect();
      setZoom(scale - 0.15, rect.width / 2, rect.height / 2);
    });

    document.getElementById("zoomResetBtn").addEventListener("click", () => {
      scale = 0.92;
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
    if (clean.startsWith("6.")) return "E6";
    if (clean.startsWith("7.")) return "E6";
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
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
        fontSize: "14px",
        primaryColor: "#eef6ff",
        primaryBorderColor: "#0071e3",
        lineColor: "#6e6e73",
        clusterBkg: "#ffffff",
        clusterBorder: "#d2d2d7"
      },
      flowchart: {
        useMaxWidth: false,
        htmlLabels: true,
        nodeSpacing: 55,
        rankSpacing: 85,
        curve: "basis"
      }
    });

    const { svg } = await mermaid.render("appleArchSvg", MERMAID_DEF);
    container.innerHTML = svg;

    // Initial optimal einpassen
    scale = 0.92;
    panX = 16;
    panY = 20;
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
      btn.innerHTML = `<span>${item.label}</span><span class="edge-pill">Details ›</span>`;
      btn.addEventListener("click", () => openModal(item));
      grid.appendChild(btn);
    });
  }

  // =========================================================================
  // 6. MODAL-STEUERUNG
  // =========================================================================
  const modal = document.getElementById("infoModal");

  function openModal(data) {
    if (!data || !modal) return;
    document.getElementById("modalCategory").textContent = data.category;
    document.getElementById("modalTitle").textContent = data.title;
    document.getElementById("modalWhat").textContent = data.what;
    document.getElementById("modalWhere").textContent = data.where;
    document.getElementById("modalSecurity").textContent = data.security;

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
  // 7. KOSTEN-SIMULATOR MIT EINZELPOSITIONEN (ALLE ANKLICKBAR!)
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
        <span class="cost-info-icon">Info ›</span>
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

    const costFs = 0.0;
    const costA1 = 1.60 * ft;
    const costA2 = 6.20 * ft;
    const costA3 = 2.40 * ft;
    const costBingComp = 1.80 * ft + 0.15;
    const costRagInfra = 1.35;
    const totalStage1 = costFs + costA1 + costA2 + costA3 + costBingComp + costRagInfra;

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
        "Azure AI Foundry: Agent 3 + MS Graph",
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

    // Szenario B (Stufe 2 Voice & TTS)
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

    // ROI & Break-Even Berechnung
    const savedHours = (tickets * 5 + calls * 4) / 60;
    const grossSavings = savedHours * rate;
    const activeCost = calls > 0 ? totalStage2 : totalStage1;
    const netSavings = Math.max(0, grossSavings - activeCost);

    const savingsPerTicket = (5 / 60) * rate;
    const breakEvenTickets = Math.max(1, Math.ceil(totalStage1 / savingsPerTicket));

    const setupCost = 16 * rate;
    const dailyNet = netSavings / 21;
    const paybackDays = dailyNet > 0 ? Math.max(1, Math.ceil(setupCost / dailyNet)) : 0;

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