(function () {
  "use strict";

  // =========================================================================
  // 1. WISSENSDATENBANK FÜR ALLE SYSTEM-BAUSTEINE (NODES)
  // =========================================================================
  const NODE_DETAILS = {
    FS_QUEUE: {
      category: "Eingangskanal • Freshservice",
      title: "Freshservice Queue „KI-Triage“ & CMDB",
      what:
        "Alle neu eingehenden IT-Tickets landen zunächst in einer eigenen, isolierten Warteschlange namens „KI-Triage“. Von hier aus werden Tickets strukturiert voranalysiert, während die angebundene CMDB (Asset-Datenbank) automatisch prüft, welche Hardware dem Meldenden zugeordnet ist.",
      where:
        "Freshservice Admin → Agentengruppen (Gruppe „KI-Triage“) & Workflow Automator → Ticket-Erstellung",
      how: [
        "Eigene Agentengruppe „KI-Triage“ sowie dedizierten Service-Account „KI-Assistent“ anlegen.",
        "Automatisierungsregel aktivieren: Neue Tickets automatisch der Gruppe „KI-Triage“ zuweisen.",
        "CMDB-Lesezugriff für Assets (Computernummern, Seriennummern, Benutzerzuordnung) freigeben.",
        "Schreibschutz-Regel: Der KI-Account darf keine öffentlichen Antworten senden und keine Tickets schließen."
      ],
      security:
        "Die Kommunikation erfolgt ausschließlich über TLS-1.3-verschlüsseltes HTTPS. Der API-Schlüssel des Service-Accounts liegt nicht im Code, sondern hardwareverschlüsselt im Azure Key Vault."
    },

    VOICE_HOTLINE: {
      category: "Ausbaustufe 2 • Telefonie & Sprache",
      title: "Voice- & TTS-Hotline-Agent (Azure Speech Services)",
      what:
        "In der optionalen Ausbaustufe 2 nimmt ein telefonischer KI-Assistent eingehende IT-Hotline-Anrufe rund um die Uhr entgegen. Er versteht das Anliegen in natürlicher Sprache (Speech-to-Text), liest Lösungswege aus dem internen Wissen vor (Text-to-Speech) oder erstellt direkt ein vorqualifiziertes Freshservice-Ticket.",
      where:
        "Azure Portal → Azure Communication Services (SIP-Routing) & Azure AI Foundry → Speech Services (EU)",
      how: [
        "Rufnummern-Weiterleitung (z. B. Überlauf oder Nachtschicht) per SIP-Trunk an Azure Communication Services anbinden.",
        "Neuronale deutsche Stimme (z. B. de-DE-KatjaNeural oder de-DE-ConradNeural) in Sweden Central auswählen.",
        "Gesprächsabbruch-Regel: Auf Wunsch („Ich möchte mit einem Mitarbeiter sprechen“) sofortige Weiterleitung an den 1st-Level-Support.",
        "Nach Gesprächsende automatische Übergabe des bereinigten Transkripts an Agent 1 & Agent 2."
      ],
      security:
        "Sprachverarbeitung und neuronale Sprachsynthese laufen vollständig in der EU-Region (Sweden Central). Audio-Streams werden nicht gespeichert und nicht für Modell-Training verwendet."
    },

    AGENT_1: {
      category: "Stufe 1 • KI-Agent 1 (gpt-4.1-mini)",
      title: "Agent 1: Prio-, Pflichtfeld-, CMDB- & Kollisionsschutz-Agent",
      what:
        "Agent 1 übernimmt die sofortige Eingangsprüfung jedes neuen Tickets. Er verhindert Kollisionen mit menschlichen Kollegen, prüft bei PC-Problemen auf eine gültige Computernummer in der CMDB, vergibt Priorität sowie Kategorie und routet das Ticket an die richtige Fachgruppe.",
      where:
        "Azure AI Foundry → Agents (servicedesk-agent-1-triage) & Azure Functions (freshservice_webhook)",
      how: [
        "Modell-Deployment auf „gpt-4.1-mini“ im Modus „Data Zone Standard (EU)“ mit 15.000 TPM Limit setzen.",
        "Kollisionsschutz aktivieren: Bearbeitung nur, wenn kein Bearbeiter eingetragen ist und in den letzten 3 Minuten keine manuelle Änderung stattfand.",
        "Pflichtfeld-Regel: Fehlt bei einem Hardware-/Client-Ticket die Computernummer und liefert die CMDB keinen Treffer, wird das Tag „pflichtdaten-fehlen“ gesetzt.",
        "Atomares Claiming: Während der wenigen Sekunden Analyse trägt sich der KI-Assistent sichtbar als Bearbeiter ein und gibt das Ticket danach wieder frei."
      ],
      security:
        "Eingehende Tickettexte werden als nicht vertrauenswürdig gekapselt (Prompt-Injection-Schutz). Agent 1 besitzt keinerlei Schreibrechte für Kunden-E-Mails."
    },

    AGENT_2: {
      category: "Stufe 1 • KI-Agent 2 (gpt-4.1)",
      title: "Agent 2: Wissens- & Lösungs-Agent",
      what:
        "Agent 2 ist der digitale Recherche-Assistent für unsere IT-Techniker. Er durchsucht zuerst unser internes IT-Wiki, die Freshservice Knowledge Base sowie gelöste Alttickets und schreibt eine strukturierte Zusammenfassung samt Lösungsvorschlag und Antwortentwurf als interne Notiz ins Ticket.",
      where:
        "Azure AI Foundry → Agents (servicedesk-agent-2-knowledge) & Tools (Vector Store + Bing Grounding)",
      how: [
        "Modell-Deployment auf „gpt-4.1“ (EU Data Zone) mit maximal 1.200 Output-Tokens pro Ticket konfigurieren.",
        "Internen Vektor-Index (Schwellenwert Score ≥ 0,78) als primäre Wissensquelle priorisieren.",
        "Output-Format festlegen: 1. KI-Zusammenfassung, 2. Gefundene Quellen, 3. Prüfschritte für Techniker, 4. Antwortentwurf.",
        "Schreibmodus im Freshservice-Connector hart auf „Private Note (nur intern sichtbar)“ begrenzen."
      ],
      security:
        "Endanwender sehen die KI-Notiz niemals direkt. Ein menschlicher Techniker prüft den Entwurf und klickt selbst auf Senden (Human-in-the-Loop)."
    },

    VECTOR_STORE: {
      category: "Wissensbasis • Azure AI Search",
      title: "Interner Wissens-Index (Azure AI Search Vector Store)",
      what:
        "Der Vector Store ist das zentrale Langzeitgedächtnis des Servicedesks. Hier liegen sämtliche internen Standard-Arbeitsanweisungen (SOPs), SharePoint-Wiki-Seiten, Freshservice-Lösungsartikel und anonymisierte historische Ticketlösungen semantisch durchsuchbar bereit.",
      where:
        "Azure Portal → Azure AI Search (Basic Tier, Sweden Central) → Index „it-servicedesk-kb“",
      how: [
        "Vektor-Index mit 1.536 Dimensionen (passend zum EU-Embedding-Modell text-embedding-3-small) anlegen.",
        "Semantische Suche aktivieren, damit auch umgangssprachliche Fehlerbeschreibungen präzise Treffer liefern.",
        "Zugriff ausschließlich per System-Assigned Managed Identity (RBAC-Rolle: Search Index Data Contributor) erlauben."
      ],
      security:
        "Alle im Index gespeicherten Texte werden bereits vor der Indexierung automatisch von Namen, E-Mail-Adressen und Computernummern bereinigt."
    },

    BING_GROUNDING: {
      category: "Externe Recherche • Microsoft Bing Grounding",
      title: "Anonymisierte Web-Suche (Grounding with Bing Search)",
      what:
        "Wenn ein technischer Fehlercode weder im internen Wiki noch in alten Tickets bekannt ist, recherchiert Agent 2 gezielt in offiziellen Hersteller-Dokumentationen (z. B. Microsoft Learn), ohne jemals interne Firmendaten preiszugeben.",
      where:
        "Azure AI Foundry → Connected Resources → Grounding with Bing Search",
      how: [
        "Web-Suche nur auslösen, wenn der interne Wissens-Score unter 0,78 liegt und ein konkreter Fehlercode vorliegt.",
        "Vorgeschalteten DSGVO-Anonymisierungsfilter aktivieren, der vor jeder Anfrage sämtliche PII-Daten entfernt.",
        "Suchanfrage auf neutrale technische Begriffe (max. 120 Zeichen) begrenzen."
      ],
      security:
        "Es verlassen keinerlei Benutzernamen, E-Mail-Adressen, IP-Adressen oder interne Servernamen das Unternehmen – nach außen geht lediglich der neutrale Fehlercode."
    },

    AGENT_3: {
      category: "Stufe 1 • KI-Agent 3 (gpt-4.1 & gpt-4.1-mini)",
      title: "Agent 3: Doku- & Aktualitäts-Agent",
      what:
        "Agent 3 sorgt dafür, dass die Wissensdatenbank automatisch wächst und nicht veraltet. Nach Abschluss eines Tickets erstellt er bei Bedarf einen neuen Lösungsartikel als Entwurf nach Firmenvorgabe und erinnert Artikel-Verantwortliche regelmäßig per E-Mail an fällige Prüfungen.",
      where:
        "Azure AI Foundry (servicedesk-agent-3-docs) & Azure Functions (ticket_closed_hook / weekly_kb_audit)",
      how: [
        "Trigger 1 (Ticket geschlossen): Prüft, ob bereits ein KB-Artikel existiert (Score < 0,85), und legt einen neuen Artikel im Status „Draft“ (Entwurf) an.",
        "Strukturvorgabe erzwingen: 1. Symptom, 2. Betroffene Systeme, 3. Schritt-für-Schritt-Lösung, 4. Verifikation.",
        "Trigger 2 (Wöchentlich Montag 07:00 Uhr): Artikel älter als 180 Tage prüfen und per Microsoft Graph E-Mail an den Verantwortlichen melden."
      ],
      security:
        "Neue Artikel werden niemals automatisch für Mitarbeiter veröffentlicht, sondern landen im Entwurfsordner zur Freigabe. Alle Ticketdaten werden vorab anonymisiert."
    },

    NIGHTLY_SYNC: {
      category: "Hintergrund-Prozess • Kein eigener KI-Agent",
      title: "Nächtlicher Wissens-Sync (SharePoint & Tickets → Vector Store)",
      what:
        "Ein vollautomatischer Hintergrund-Job synchronisiert jede Nacht um 02:00 Uhr neue oder geänderte Seiten aus dem SharePoint-IT-Wiki sowie frisch gelöste Freshservice-Tickets in den internen Vector Store.",
      where:
        "Azure Functions → Timer Trigger „nightly_rag_sync“ (Zeitplan: täglich 02:00 Uhr) & Microsoft Graph API",
      how: [
        "Delta-Abfrage der letzten 26 Stunden für geschlossene Freshservice-Tickets und SharePoint-Seiten konfigurieren.",
        "Texte in handliche Abschnitte (Chunks) zerlegen und über das EU-Embedding-Modell vektorisieren.",
        "Kosten- und Token-Verbrauch jedes Sync-Laufs automatisch in Azure Table Storage protokollieren."
      ],
      security:
        "Authentifizierung gegenüber SharePoint erfolgt passwortlos über Microsoft Entra ID Managed Identity mit reinen Leserechten (Sites.Read.All)."
    }
  };

  // =========================================================================
  // 2. WISSENSDATENBANK FÜR ALLE VERBINDUNGEN (EDGES / PFEILE)
  // =========================================================================
  const EDGE_DETAILS = {
    E1: {
      label: "1. Ticket-Trigger: Freshservice → Agent 1",
      category: "Verbindung • Webhook & Kollisionsschutz",
      title: "Echtzeit-Übergabe neuer Tickets aus „KI-Triage“ an Agent 1",
      what:
        "Sobald ein neues Ticket in der Freshservice-Queue „KI-Triage“ eintrifft, sendet Freshservice einen sicheren Webhook-Impuls mit der Ticket-ID an die Azure Function App, die daraufhin Agent 1 startet.",
      where:
        "Freshservice Admin → Workflow Automator → Webhook-Aktion → Azure Function „freshservice_webhook“",
      how: [
        "Webhook-Authentifizierung über dedizierten Azure Function Key (HTTPS POST) absichern.",
        "In der Payload ausschließlich die numerische Ticket-ID übertragen (Datenminimierung).",
        "Sofortiger Pre-Flight-Check nach Empfang: Prüfen, ob schon ein Kollege das Ticket geöffnet oder bearbeitet hat."
      ],
      security:
        "Übertragung über TLS 1.3. Ohne gültigen Function-Schlüssel weist Azure jede Anfrage sofort ab."
    },
    E2: {
      label: "2. CMDB-Abgleich: Agent 1 ↔ Freshservice CMDB",
      category: "Verbindung • Asset- & Pflichtfeldprüfung",
      title: "Automatischer Hardware- & Computernummer-Abgleich",
      what:
        "Agent 1 fragt über die Freshservice REST API die CMDB ab, um zu prüfen, ob eine im Ticket genannte Computernummer existiert oder welches Notebook dem Meldenden zugewiesen ist.",
      where:
        "Azure Functions (freshservice_client.py) ↔ Freshservice Assets API v2",
      how: [
        "Suche primär nach im Tickettext erkannter Computernummer (z. B. NB-4711).",
        "Fallback-Suche über die Requester-ID des Melders, falls keine Nummer eingetippt wurde.",
        "Fehlt bei einem PC-Problem jeglicher Asset-Bezug, wird das Ticket mit „pflichtdaten-fehlen“ markiert."
      ],
      security:
        "Reiner Lesezugriff auf Asset-Stammdaten; API-Key wird zur Laufzeit per Managed Identity aus Azure Key Vault abgerufen."
    },
    E3: {
      label: "3. Übergabe: Agent 1 → Agent 2 (Nach Check)",
      category: "Verbindung • Interne Orchestrierung",
      title: "Übergabe vorqualifizierter Tickets an den Wissens-Agenten",
      what:
        "Nur wenn alle Pflichtfelder vorhanden sind und keine Kollision mit einem Techniker vorliegt, übergibt Agent 1 das klassifizierte Ticket samt Priorität und Zielgruppe an Agent 2.",
      where:
        "Azure Functions Orchestrator → Azure AI Foundry Agent 2 (gpt-4.1)",
      how: [
        "Tickets mit fehlenden Pflichtdaten stoppen hier bewusst und gehen direkt zur Rückfrage an den Support.",
        "Übermittlung der strukturierten Triage-Ergebnisse (Kategorie, Prio, CMDB-Treffer) an Agent 2."
      ],
      security:
        "Verarbeitung findet vollständig innerhalb der EU Data Zone (Sweden Central) statt."
    },
    E4: {
      label: "4. Wissensabfrage: Agent 2 ↔ Vector Store",
      category: "Verbindung • Semantische RAG-Suche",
      title: "Abfrage interner SOPs, Wiki-Seiten & gelöster Alttickets",
      what:
        "Agent 2 sucht anhand der Problembeschreibung nach den 5 ähnlichsten internen Lösungsdokumenten im Azure AI Search Vector Store, um bewährte Firmenlösungen vorzuschlagen.",
      where:
        "Azure AI Foundry Agent 2 ↔ Azure AI Search (Index: it-servicedesk-kb)",
      how: [
        "Top-5-Dokumente per Hybrid-Suche (Vektor + Volltext) abrufen.",
        "Relevanz-Schwellenwert auf Score ≥ 0,78 festlegen; erst darunter wird eine externe Web-Suche erwogen."
      ],
      security:
        "Authentifizierung ohne Passwort via Azure Entra ID Managed Identity."
    },
    E5: {
      label: "5. Web-Recherche: Agent 2 ↔ Bing Grounding",
      category: "Verbindung • Anonymisierte Fehlercode-Suche",
      title: "DSGVO-bereinigte Recherche unbekannter Fehlercodes",
      what:
        "Kennt die interne Wissensbasis einen Fehlercode nicht, formuliert der vorgeschaltete PII-Filter eine neutrale technische Suchanfrage und ruft aktuelle Lösungshinweise über Bing Grounding ab.",
      where:
        "Azure Functions (pii_sanitizer.py) → Azure AI Foundry → Grounding with Bing Search",
      how: [
        "Deterministische Entfernung von E-Mails, Namen, IP-Adressen, Telefonnummern und Hostnamen vor dem API-Aufruf.",
        "Beschränkung der Suchanfrage auf maximal 120 Zeichen."
      ],
      security:
        "Strikte Datentrennung: Nach außen gelangen ausschließlich abstrakte Fehlercodes (z. B. „0x80180014“), niemals Firmendaten."
    },
    E6: {
      label: "6. Ergebnis-Rückgabe: Agent 2 → Freshservice Note",
      category: "Verbindung • Human-in-the-Loop Schreibschutz",
      title: "Schreiben der internen Notiz & Freigabe an Fachgruppe",
      what:
        "Nach einem letzten Kollisions-Check schreibt Agent 2 die strukturierte Analyse und den Antwortentwurf als interne Notiz ins Ticket, entfernt die KI-Zuweisung und verschiebt das Ticket in die Zielgruppe.",
      where:
        "Azure Functions → Freshservice Tickets & Notes API (private: true)",
      how: [
        "Post-Flight-Check: Prüfen, ob das Ticket während der KI-Laufzeit von einem Techniker übernommen wurde.",
        "Notiz zwingend mit Kennzeichnung „private: true“ (nur für IT-Agenten sichtbar) speichern.",
        "Ticket-Bearbeiter wieder auf „nicht zugewiesen“ setzen und an Ziel-Fachgruppe routen."
      ],
      security:
        "Technisch ausgeschlossen, dass eine KI-Antwort ungesehen an einen Kunden verschickt wird."
    },
    E7: {
      label: "7. Doku- & Audit-Flow: Ticket Closed / Timer → Agent 3",
      category: "Verbindung • Wissenspflege & Review-Mails",
      title: "Erstellung neuer KB-Entwürfe & E-Mail-Erinnerungen",
      what:
        "Beim Schließen eines Tickets prüft Agent 3, ob ein neuer Lösungsartikel als Entwurf erstellt werden soll. Zusätzlich prüft er wöchentlich bestehende Artikel auf Alter (> 180 Tage) und mailt den Verantwortlichen.",
      where:
        "Freshservice Webhook (Ticket Closed) & Timer Trigger → Agent 3 → Freshservice KB / Graph Mail",
      how: [
        "Abgleich mit Vector Store (Score < 0,85), um doppelte Lösungsartikel zu vermeiden.",
        "Anlage neuer Artikel strikt im Status „Draft“ (Entwurf) nach vorgegebener 4-Punkte-Gliederung.",
        "Versand von Review-Erinnerungen über Microsoft Graph API (Mail.Send)."
      ],
      security:
        "Vollständige Anonymisierung aller Namen und Computernummern vor Erstellung des Artikel-Entwurfs."
    },
    E8: {
      label: "8. Nacht-Sync: SharePoint & Tickets → Vector Store",
      category: "Verbindung • Automatisierter Wissens-Import",
      title: "Nächtliche Aktualisierung der KI-Wissensbasis (02:00 Uhr)",
      what:
        "Jede Nacht um 02:00 Uhr liest ein Hintergrund-Job neue SharePoint-Wiki-Seiten sowie frisch gelöste Tickets ein, anonymisiert sie und aktualisiert den Vector Store.",
      where:
        "Azure Functions Timer Trigger (nightly_rag_sync) → Microsoft Graph & Freshservice → Azure AI Search",
      how: [
        "Inkrementeller Delta-Abruf der letzten 26 Stunden zur Minimierung von API-Last und Token-Kosten.",
        "Automatische Zerlegung in Text-Chunks und Vektorisierung in Sweden Central."
      ],
      security:
        "Passwortlose Authentifizierung über Managed Identity; rein lesender Zugriff auf SharePoint."
    },
    E9: {
      label: "9. Ausbaustufe Voice: Hotline ↔ Agent 1 & 2",
      category: "Verbindung • Echtzeit-Sprachkanal (Stufe 2)",
      title: "Nahtlose Integration des Telefon-Agenten in den Servicedesk",
      what:
        "In Ausbaustufe 2 transkribiert Azure Speech Services eingehende Anrufe in Echtzeit, nutzt exakt denselben Wissens-Index wie Agent 2 für telefonische Soforthilfe und legt bei Bedarf direkt ein Ticket an.",
      where:
        "Azure Communication Services ↔ Azure AI Foundry (Speech + LLM) → Freshservice API",
      how: [
        "Bidirektionaler Audio-Stream mit geringer Latenz (< 800 ms) in der EU-Region.",
        "Automatische Ticket-Anlage in Freshservice inkl. Gesprächszusammenfassung als Private Note."
      ],
      security:
        "DSGVO-konforme Echtzeitverarbeitung in Sweden Central ohne dauerhafte Aufzeichnung von Sprachmitschnitten."
    }
  };

  // =========================================================================
  // 3. MERMAID DIAGRAMM DEFINITION & INTERAKTIONS-BINDING
  // =========================================================================
  const MERMAID_DEFINITION = `
flowchart TD
    FS_QUEUE["Freshservice Queue: KI-Triage & CMDB"]
    VOICE_HOTLINE["Ausbaustufe 2: Voice- & TTS-Hotline-Agent"]
    AGENT_1["Agent 1: Prio-, Pflichtfeld- & Kollisions-Agent (gpt-4.1-mini)"]
    AGENT_2["Agent 2: Wissens- & Loesungs-Agent (gpt-4.1)"]
    VECTOR_STORE[("Azure AI Search Vector Store (EU)")]
    BING_GROUNDING["Grounding with Bing Search (Anonymisiert)"]
    AGENT_3["Agent 3: Doku- & Aktualitaets-Agent (gpt-4.1)"]
    NIGHTLY_SYNC["Naechtlicher Wissens-Sync (SharePoint & Tickets)"]

    FS_QUEUE -->|"1. Webhook Trigger"| AGENT_1
    AGENT_1 <-->|"2. CMDB-Abgleich"| FS_QUEUE
    AGENT_1 -->|"3. Check OK"| AGENT_2
    AGENT_2 <-->|"4. RAG-Suche"| VECTOR_STORE
    AGENT_2 <-->|"5. Fehlercode-Suche"| BING_GROUNDING
    AGENT_2 -->|"6. Private Note"| FS_QUEUE
    FS_QUEUE -->|"7. Ticket Closed / Audit"| AGENT_3
    AGENT_3 -->|"7b. KB-Draft & Mail"| FS_QUEUE
    NIGHTLY_SYNC -->|"8. Nacht-Sync 02:00"| VECTOR_STORE
    VOICE_HOTLINE <-->|"9. Voice / TTS Stream"| AGENT_2

    classDef coreNode fill:#eff6ff,stroke:#0078d4,stroke-width:2px,color:#0f172a;
    classDef voiceNode fill:#f5f3ff,stroke:#7c3aed,stroke-width:2px,stroke-dasharray: 5 4,color:#0f172a;
    classDef dataNode fill:#ecfdf5,stroke:#059669,stroke-width:2px,color:#0f172a;

    class FS_QUEUE,AGENT_1,AGENT_2,AGENT_3 coreNode;
    class VOICE_HOTLINE voiceNode;
    class VECTOR_STORE,BING_GROUNDING,NIGHTLY_SYNC dataNode;
  `;

  function mapEdgeLabelToKey(labelText) {
    const clean = (labelText || "").trim();
    if (clean.startsWith("1.")) return "E1";
    if (clean.startsWith("2.")) return "E2";
    if (clean.startsWith("3.")) return "E3";
    if (clean.startsWith("4.")) return "E4";
    if (clean.startsWith("5.")) return "E5";
    if (clean.startsWith("6.")) return "E6";
    if (clean.startsWith("7")) return "E7";
    if (clean.startsWith("8.")) return "E8";
    if (clean.startsWith("9.")) return "E9";
    return null;
  }

  async function renderArchitectureDiagram() {
    const container = document.getElementById("mermaidContainer");
    if (!container || typeof mermaid === "undefined") return;

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: "default",
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: "basis"
      }
    });

    const { svg } = await mermaid.render("servicedeskArchSvg", MERMAID_DEFINITION);
    container.innerHTML = svg;

    // Klick-Handler auf alle SVG-Knoten (Bausteine) binden
    const svgElement = container.querySelector("svg");
    if (!svgElement) return;

    svgElement.querySelectorAll(".node").forEach((nodeEl) => {
      const rawId = nodeEl.id || "";
      const matchedKey = Object.keys(NODE_DETAILS).find((key) =>
        rawId.includes(`-${key}-`) || rawId.endsWith(`-${key}`) || rawId === key
      );
      if (matchedKey) {
        nodeEl.setAttribute("tabindex", "0");
        nodeEl.setAttribute("role", "button");
        nodeEl.setAttribute("aria-label", NODE_DETAILS[matchedKey].title);
        nodeEl.addEventListener("click", (e) => {
          e.stopPropagation();
          openModal(NODE_DETAILS[matchedKey]);
        });
        nodeEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openModal(NODE_DETAILS[matchedKey]);
          }
        });
      }
    });

    // Klick-Handler auf alle Edge-Labels (Verbindungsbeschriftungen im SVG) binden
    svgElement.querySelectorAll(".edgeLabel").forEach((labelEl) => {
      const edgeKey = mapEdgeLabelToKey(labelEl.textContent);
      if (edgeKey && EDGE_DETAILS[edgeKey]) {
        labelEl.setAttribute("tabindex", "0");
        labelEl.setAttribute("role", "button");
        labelEl.addEventListener("click", (e) => {
          e.stopPropagation();
          openModal(EDGE_DETAILS[edgeKey]);
        });
      }
    });

    // Zusätzliche Event-Delegation für direkte Klicks auf SVG-Pfeillinien
    const edgePaths = Array.from(svgElement.querySelectorAll(".edgePath"));
    const edgeOrder = ["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E7", "E8", "E9"];
    edgePaths.forEach((pathEl, idx) => {
      const key = edgeOrder[idx];
      if (key && EDGE_DETAILS[key]) {
        pathEl.addEventListener("click", (e) => {
          e.stopPropagation();
          openModal(EDGE_DETAILS[key]);
        });
      }
    });
  }

  function renderEdgeMatrixButtons() {
    const grid = document.getElementById("edgeButtonsGrid");
    if (!grid) return;
    grid.innerHTML = "";

    Object.keys(EDGE_DETAILS).forEach((key) => {
      const item = EDGE_DETAILS[key];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "edge-btn";
      btn.innerHTML = `
        <span>${item.label}</span>
        <span class="arrow-tag">Details →</span>
      `;
      btn.addEventListener("click", () => openModal(item));
      grid.appendChild(btn);
    });
  }

  // =========================================================================
  // 4. MODAL-STEUERUNG (ÖFFNEN, X-BUTTON, BACKDROP-KLICK, ESC-TASTE)
  // =========================================================================
  const modalBackdrop = document.getElementById("infoModal");
  const modalCloseBtn = document.getElementById("modalCloseBtn");
  const modalCategory = document.getElementById("modalCategory");
  const modalTitle = document.getElementById("modalTitle");
  const modalWhat = document.getElementById("modalWhat");
  const modalWhere = document.getElementById("modalWhere");
  const modalHow = document.getElementById("modalHow");
  const modalSecurity = document.getElementById("modalSecurity");

  function openModal(data) {
    if (!data || !modalBackdrop) return;
    modalCategory.textContent = data.category;
    modalTitle.textContent = data.title;
    modalWhat.textContent = data.what;
    modalWhere.textContent = data.where;
    modalSecurity.textContent = data.security;

    modalHow.innerHTML = "";
    data.how.forEach((step) => {
      const li = document.createElement("li");
      li.textContent = step;
      modalHow.appendChild(li);
    });

    modalBackdrop.hidden = false;
    document.body.style.overflow = "hidden";
    modalCloseBtn.focus();
  }

  function closeModal() {
    if (!modalBackdrop || modalBackdrop.hidden) return;
    modalBackdrop.hidden = true;
    document.body.style.overflow = "";
  }

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", closeModal);
  }

  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) {
        closeModal();
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
    }
  });

  // =========================================================================
  // 5. INTERAKTIVER FINOPS-, KOSTEN- & ROI-SIMULATOR
  // =========================================================================
  const ticketSlider = document.getElementById("ticketSlider");
  const callSlider = document.getElementById("callSlider");
  const rateSlider = document.getElementById("rateSlider");

  function formatEuro(val) {
    return val.toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + " €";
  }

  function updateFinancialDashboard() {
    const tickets = Number(ticketSlider.value);
    const calls = Number(callSlider.value);
    const hourlyRate = Number(rateSlider.value);

    document.getElementById("ticketCountLabel").textContent = `${tickets.toLocaleString("de-DE")} Tickets`;
    document.getElementById("callCountLabel").textContent = `${calls.toLocaleString("de-DE")} Anrufe`;
    document.getElementById("rateLabel").textContent = `${hourlyRate} € / Std.`;

    // Kalkulation Szenario A (Stufe 1: Text & Ticket-KI, EU Data Zone)
    const factorTickets = tickets / 1000;
    const costAgent1 = 1.60 * factorTickets;
    const costAgent2 = 6.20 * factorTickets;
    const costAgent3 = 2.40 * factorTickets;
    const costBing = 1.80 * factorTickets;
    const costInfraBase = 1.50; // Vector Store + Table Storage + Functions Consumption
    const totalStage1 = costAgent1 + costAgent2 + costAgent3 + costBing + costInfraBase;

    document.getElementById("costStage1Total").innerHTML = `${formatEuro(totalStage1)} <span>/ Monat</span>`;
    document.getElementById("breakdownStage1").innerHTML = `
      <li><span>Agent 1 (Triage &amp; CMDB, gpt-4.1-mini)</span><strong>${formatEuro(costAgent1)}</strong></li>
      <li><span>Agent 2 (Wissen &amp; Lösungsnotiz, gpt-4.1)</span><strong>${formatEuro(costAgent2)}</strong></li>
      <li><span>Agent 3 (KB-Drafts &amp; Aktualitäts-Audit)</span><strong>${formatEuro(costAgent3)}</strong></li>
      <li><span>Anonymisiertes Bing Grounding (~25 % Quote)</span><strong>${formatEuro(costBing)}</strong></li>
      <li><span>Vector Store, Table Storage &amp; Serverless Sync</span><strong>${formatEuro(costInfraBase)}</strong></li>
    `;

    // Kalkulation Szenario B (Stufe 2: Maximaler Ausbau inkl. Voice / TTS Hotline à 4 Min./Call)
    const factorCalls = calls / 750;
    const costSpeechSttTts = 82.50 * factorCalls; // Azure Speech Neural TTS + STT (50 Std. bei 750 Calls)
    const costSipTelephony = 68.00 * factorCalls; // Azure Communication Services SIP / Minuten
    const costVoiceLlm = 51.00 * factorCalls;     // Echtzeit-Dialog-Tokens (gpt-4.1 / mini)
    const totalStage2 = totalStage1 + costSpeechSttTts + costSipTelephony + costVoiceLlm;

    document.getElementById("costStage2Total").innerHTML = `${formatEuro(totalStage2)} <span>/ Monat</span>`;
    document.getElementById("breakdownStage2").innerHTML = `
      <li><span>Basis-Betrieb Stufe 1 (alle 3 Ticket-Agenten)</span><strong>${formatEuro(totalStage1)}</strong></li>
      <li><span>Azure Speech Services (Neural TTS &amp; STT)</span><strong>${formatEuro(costSpeechSttTts)}</strong></li>
      <li><span>Azure Communication Services (SIP-Telefonie)</span><strong>${formatEuro(costSipTelephony)}</strong></li>
      <li><span>Echtzeit-Dialog-KI für Hotline-Gespräche</span><strong>${formatEuro(costVoiceLlm)}</strong></li>
    `;

    // ROI & Break-Even Berechnung
    // Ø 5 Min. Ersparnis pro Ticket + Ø 4 Min. Ersparnis pro Hotline-Anruf
    const savedMinutesTotal = tickets * 5 + calls * 4;
    const savedHours = savedMinutesTotal / 60;
    const grossSavingsEur = savedHours * hourlyRate;
    const activeCost = calls > 0 ? totalStage2 : totalStage1;
    const netSavingsEur = Math.max(0, grossSavingsEur - activeCost);

    const savingsPerTicketEur = (5 / 60) * hourlyRate;
    const breakEvenTickets = Math.max(1, Math.ceil(totalStage1 / savingsPerTicketEur));

    // Einmalige Einrichtungszeit: ca. 16 Stunden interner Aufwand
    const setupCostEur = 16 * hourlyRate;
    const dailyNetSavings = netSavingsEur / 21; // 21 Arbeitstage/Monat
    const paybackDays = dailyNetSavings > 0 ? Math.max(1, Math.ceil(setupCostEur / dailyNetSavings)) : 0;

    document.getElementById("savedHoursValue").textContent = `${savedHours.toLocaleString("de-DE", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })} Std. / Mon.`;

    document.getElementById("savedHoursDetail").textContent =
      calls > 0
        ? `Ø 5 Min. pro Ticket (${tickets}) + 4 Min. pro Call (${calls})`
        : `Ø 5 Min. Zeitersparnis pro Ticket (${tickets} Tickets)`;

    document.getElementById("netSavingsValue").textContent = `${Math.round(netSavingsEur).toLocaleString("de-DE")} € / Mon.`;
    document.getElementById("breakEvenTicketsValue").textContent = `Ab dem ${breakEvenTickets}. Ticket`;
    document.getElementById("setupPaybackValue").textContent =
      paybackDays > 0 ? `Nach ca. ${paybackDays} Arbeitstagen` : "Sofort";
  }

  // Dark/Light Mode Umschalter
  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      document.body.classList.toggle("dark-mode");
    });
  }

  // Initialisierung beim Laden der Seite
  document.addEventListener("DOMContentLoaded", () => {
    renderEdgeMatrixButtons();
    renderArchitectureDiagram();
    updateFinancialDashboard();

    ticketSlider.addEventListener("input", updateFinancialDashboard);
    callSlider.addEventListener("input", updateFinancialDashboard);
    rateSlider.addEventListener("input", updateFinancialDashboard);
  });
})();
