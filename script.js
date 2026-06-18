// Variabili globali dello stato dell'applicazione
let databaseAttivo = null;

// Funzioni di gestione dell'interfaccia mobile (Sidebar)
function w3_open() {
    document.getElementById("mySidebar").style.display = "block";
    document.getElementById("myOverlay").style.display = "block";
}
function w3_close() {
    document.getElementById("mySidebar").style.display = "none";
    document.getElementById("myOverlay").style.display = "none";
}

// Inizializzazione: Legge l'indice config.json e monta il menu
document.addEventListener("DOMContentLoaded", () => {
    fetch('config.json')
        .then(response => {
            if (!response.ok) throw new Error("Impossibile trovare il file config.json");
            return response.json();
        })
        .then(config => {
            costruisciMenu(config.moduli);
        })
        .catch(err => {
            document.getElementById("menu-voci").innerHTML = `<div class="w3-padding w3-text-red"><i class="fa fa-exclamation-triangle"></i> Errore indice dati</div>`;
            console.error(err);
        });
});

// Genera dinamicamente i pulsanti nella sidebar
function costruisciMenu(moduli) {
    const menuContainer = document.getElementById("menu-voci");
    menuContainer.innerHTML = ""; // Svuota il caricamento

    moduli.forEach((modulo, index) => {
        const btn = document.createElement("button");
        btn.className = "w3-bar-item w3-button w3-padding w3-hover-blue-grey w3-border-bottom w3-border-dark-grey";
        btn.innerHTML = modulo.label;
        btn.onclick = () => {
            // Gestione classi attive sul menu
            const activeButtons = menuContainer.getElementsByClassName("w3-blue-grey");
            for (let b of activeButtons) b.classList.remove("w3-blue-grey");
            btn.classList.add("w3-blue-grey");
            
            // Carica il file JSON corrispondente
            caricaModuloDati(modulo.file);
            w3_close(); // Chiude la sidebar su mobile
        };
        menuContainer.appendChild(btn);
        
        // Carica il primo modulo di default all'avvio
        if (index === 0) btn.click();
    });
}

// Carica ed elabora il file JSON selezionato
function caricaModuloDati(fileName) {
    const loader = `<div class="w3-container w3-center w3-padding-64"><i class="fa fa-spinner fa-spin w3-jumbo w3-text-grey"></i><p>Elaborazione record...</p></div>`;
    document.getElementById("contenuto-dati").innerHTML = loader;

    fetch(fileName)
        .then(response => response.json())
        .then(json => {
            databaseAttivo = json;
            document.getElementById("inputRicerca").value = ""; // Svuota vecchia ricerca
            document.getElementById("inputRicerca").disabled = false;
            
            // Aggiorna l'Header della sezione
            document.getElementById("titolo-sezione").innerText = json.sezione;
            document.getElementById("info-sezione").innerHTML = `Banda Principale: <b>${json.banda_principale || 'N/D'}</b> | Ultimo Aggiornamento: ${json.ultimo_aggiornamento || 'N/D'}`;
            
            renderizzaTabelle(json);
        })
        .catch(err => {
            document.getElementById("contenuto-dati").innerHTML = `<div class="w3-panel w3-red w3-padding w3-round"><h4>Errore!</h4><p>Impossibile caricare il file dati/${fileName}</p></div>`;
            console.error(err);
        });
}

// Rende i dati JSON in tabelle HTML pulite e scannabili
function renderizzaTabelle(json) {
    const container = document.getElementById("contenuto-dati");
    container.innerHTML = ""; // Svuota il loader

    if (!json.dati_provinciali || json.dati_provinciali.length === 0) {
        container.innerHTML = "<p class='w3-text-grey'>Nessun dato provinciale presente in questa sezione.</p>";
        return;
    }

    // Tabella Principale
    let html = `
        <div class="w3-responsive w3-card w3-white w3-round">
            <table class="w3-table-all w3-hoverable" id="tabella-frequenze">
                <thead>
                    <tr class="w3-blue-grey">
                        <th style="width:15%">Provincia</th>
                        <th style="width:35%">Località / Presidio</th>
                        <th style="width:25%">Frequenze (MHz)</th>
                        <th style="width:25%">Note operative</th>
                    </tr>
                </thead>
                <tbody>
    `;

    json.dati_provinciali.forEach(prov => {
        prov.localita.forEach(loc => {
            // Crea i badge rossi per le frequenze
            let badges = loc.frequenze.map(f => `<span class="badge-freq">${f}</span>`).join(" ");
            
            html += `
                <tr class="riga-frequenza">
                    <td class="col-prov"><b>${prov.provincia}</b></td>
                    <td class="col-loc">${loc.nome}</td>
                    <td class="col-freq">${badges}</td>
                    <td class="col-note w3-small w3-text-grey">${loc.note || '-'}</td>
                </tr>
            `;
        });
    });

    html += `</tbody></table></div>`;

    // Aggiunge sotto-tabelle per Canali Comuni / Nazionali se presenti nel JSON
    if (json.canali_comuni_nazionali_regionali) {
        html += `
            <div class="w3-card w3-white w3-round w3-margin-top w3-padding">
                <h3 class="w3-text-red" style="margin-top:10px;"><i class="fa-solid fa-tower-cell w3-margin-right"></i>Canali d'Interconnessione Nazionali e Regionali</h3>
                <div class="w3-responsive">
                    <table class="w3-table w3-striped w3-bordered">
                        <tr class="w3-light-grey"><th>Ambito</th><th>Nome Canale</th><th>Frequenza</th></tr>
                        ${json.canali_comuni_nazionali_regionali.map(c => `
                            <tr><td><b>${c.ambito}</b></td><td>${c.nome}</td><td><span class="badge-freq">${c.frequenza}</span></td></tr>
                        `).join("")}
                    </table>
                </div>
            </div>
        `;
    }

    // Aggiunge sotto-tabelle per Riserve di Stato speciali se presenti (es. Polizia/Carabinieri)
    if (json.canali_nella_riserva_di_stato) {
        html += `
            <div class="w3-card w3-white w3-round w3-margin-top w3-padding">
                <h3 class="w3-text-orange" style="margin-top:10px;"><i class="fa-solid fa-vault w3-margin-right"></i>Canali Speciali e Riserve di Stato (Alpha/Bravo)</h3>
                <div class="w3-responsive">
                    <table class="w3-table w3-striped w3-bordered">
                        <tr class="w3-light-grey"><th>Codice</th><th>Frequenza</th><th>Note D'uso</th></tr>
                        ${json.canali_nella_riserva_di_stato.map(r => `
                            <tr><td><b class="w3-text-dark-grey">${r.codice}</b></td><td><span class="badge-freq">${r.frequenza}</span></td><td class="w3-small w3-text-grey">${r.note}</td></tr>
                        `).join("")}
                    </table>
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

// Funzione di filtraggio in tempo reale (Motore di ricerca Vanilla JS)
function filtraTabella() {
    const input = document.getElementById("inputRicerca");
    const filter = input.value.toUpperCase();
    const rows = document.getElementsByClassName("riga-frequenza");

    for (let i = 0; i < rows.length; i++) {
        const provText = rows[i].querySelector(".col-prov").textContent || "";
        const locText = rows[i].querySelector(".col-loc").textContent || "";
        const freqText = rows[i].querySelector(".col-freq").textContent || "";
        const noteText = rows[i].querySelector(".col-note").textContent || "";
        
        // Unisce i testi per fare una ricerca globale sulla riga
        const stringaCompleta_riga = `${provText} ${locText} ${freqText} ${noteText}`.toUpperCase();

        if (stringaCompleta_riga.indexOf(filter) > -1) {
            rows[i].style.display = "";
        } else {
            rows[i].style.display = "none";
        }
    }
}
