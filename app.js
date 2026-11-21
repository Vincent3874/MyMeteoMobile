// ============================================
// MyMeteo Mobile - Application JavaScript
// Architecture technique identique à MyMeteo
// Version finale : Gestion correcte de la modal d'erreur
// ============================================

// ------------------------------------------------------------------
// Configuration Supabase (lecture seule, clé publiable)
// ------------------------------------------------------------------
const CFG = {
    url: "https://gvmogpbbcllkfqmryvwz.supabase.co",
    key: "sb_publishable_F4IH5ndz17UAPgHC7ihdRg_LiZikjIb",
    table: "MyMeteoData",
    indicatorsTable: "DailyIndicators",
    page: 1000
};

// Colonnes à récupérer
const COLS = encodeURIComponent(
    '"DateTime","Temperature","Humidity","Baro Pressure","Wind Gust","UVI","Hourly Rain","Rain Rate","Solar Radiation"'
);

const IND_COLS = encodeURIComponent(
    'id,date,temp_min,temp_avg,temp_max,rain_total,humidity_avg,pressure_avg,pressure_min,pressure_max,wind_gust_max,uv_index_max,reliability,temp_count,record_count'
);

// État global
let state = {
    currentPeriod: 'today',
    selectedYear: null,
    latestData: null,
    periodData: null,
    isLoading: false,
    periodRowsCount: 0,
    periodExpectedDays: 0,
    todayReliability: 0,
    periodAvgReliability: 0
};

// Timer pour fermer automatiquement la modal après 5 secondes
let errorModalTimer = null;

// ------------------------------------------------------------------
// Utilitaires
// ------------------------------------------------------------------

function fmt(n, dec = 1) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return n.toLocaleString('fr-FR', { 
        minimumFractionDigits: dec, 
        maximumFractionDigits: dec 
    });
}

function isoDay(d) {
    return d.toISOString().slice(0, 10);
}

// Date du jour en heure locale (corrige le décalage UTC de toISOString)
function isoDayLocal(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function frDate(iso) {
    if (!iso) return "—";
    return iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4);
}

function frDateTime(iso) {
    if (!iso) return "—";
    return frDate(iso) + " " + iso.slice(11, 16);
}

function showLoading() {
    document.getElementById('loadingModal').hidden = false;
    state.isLoading = true;
}

function hideLoading() {
    document.getElementById('loadingModal').hidden = true;
    state.isLoading = false;
}

// ------------------------------------------------------------------
// Gestion de la modal d'erreur - CORRIGÉE
// ------------------------------------------------------------------
function clearErrorModalTimer() {
    if (errorModalTimer) {
        clearTimeout(errorModalTimer);
        errorModalTimer = null;
    }
}

function showError(message) {
    // Ne pas afficher si message vide
    if (!message || message.trim() === '') {
        document.getElementById('errorModal').hidden = true;
        return;
    }
    
    // Effacer le timer précédent
    clearErrorModalTimer();
    
    // Masquer puis afficher pour éviter les superpositions
    const errorModal = document.getElementById('errorModal');
    errorModal.hidden = true;
    
    // Mettre à jour le message
    document.getElementById('errorMessage').textContent = message;
    
    // Afficher la modal
    errorModal.hidden = false;
    
    // Logger dans la console
    console.error('MyMeteo Mobile Error:', message);
    
    // Timer pour fermer automatiquement après 5 secondes
    errorModalTimer = setTimeout(() => {
        errorModal.hidden = true;
    }, 5000);
}

// Fonction pour fermer manuellement la modal
function hideErrorModal() {
    clearErrorModalTimer();
    document.getElementById('errorModal').hidden = true;
}

// ------------------------------------------------------------------
// Options de fetch communes
// ------------------------------------------------------------------
const fetchOpts = {
    headers: {
        "apikey": CFG.key,
        "Authorization": "Bearer " + CFG.key
    }
};

// ------------------------------------------------------------------
// Fonction fetch avec gestion d'erreur centralisée
// ------------------------------------------------------------------
async function fetchJSON(url, context) {
    try {
        const response = await fetch(url, fetchOpts);
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error("HTTP " + response.status + " - " + text.slice(0, 180));
        }
        return await response.json();
    } catch (err) {
        console.error("[" + context + "] Erreur:", err.message);
        throw err;
    }
}

// ------------------------------------------------------------------
// Appels API Supabase - 100% async/await (pas de .then())
// ------------------------------------------------------------------

async function fetchLatestRow() {
    const url = CFG.url + "/rest/v1/" + CFG.table +
        "?select=" + COLS + '&order="DateTime".desc&limit=1';
    
    const rows = await fetchJSON(url, 'fetchLatestRow');
    return rows.length ? rows[0] : null;
}

// Récupération paginée - BOUCLE while
async function fetchRows(from, to = null) {
    let all = [];
    let offset = 0;
    
    while (true) {
        const u = CFG.url + "/rest/v1/" + CFG.table +
            "?select=" + COLS +
            '&"DateTime"=gte.' + from +
            (to ? '&"DateTime"=lt.' + to : "") +
            '&order="DateTime".asc&limit=' + CFG.page + "&offset=" + offset;
        
        const rows = await fetchJSON(u, 'fetchRows');
        all = all.concat(rows);
        
        if (rows.length < CFG.page) return all;
        offset += CFG.page;
    }
}

// Indicateurs journaliers - BOUCLE while
async function fetchIndicators(from, to = null) {
    let all = [];
    let offset = 0;
    
    console.log(`[fetchIndicators] Recherche de données de ${from} à ${to}`);
    
    while (true) {
        // Utiliser simplement le nom de la table sans schéma
        // Supabase gère le schéma public par défaut
        const u = CFG.url + "/rest/v1/DailyIndicators" +
            "?select=" + IND_COLS +
            (from ? "&date=gte." + from : "") +
            (to ? "&date=lt." + to : "") +
            "&order=date.asc&limit=" + CFG.page + "&offset=" + offset;
        
        console.log(`[fetchIndicators] URL: ${u}`);
        
        try {
            const rows = await fetchJSON(u, 'fetchIndicators');
            console.log(`[fetchIndicators] ${rows.length} lignes récupérées (offset: ${offset})`);
            all = all.concat(rows);
            
            if (rows.length < CFG.page) {
                console.log(`[fetchIndicators] Fin de la pagination. Total: ${all.length} lignes`);
                return all;
            }
            offset += CFG.page;
        } catch (err) {
            console.error(`[fetchIndicators] Erreur: ${err.message}`);
            throw err;
        }
    }
}

// Récupère la dernière date disponible dans DailyIndicators
async function getLastIndicatorDate() {
    const url = CFG.url + "/rest/v1/DailyIndicators?select=date&order=date.desc&limit=1";
    try {
        const rows = await fetchJSON(url, 'getLastIndicatorDate');
        return rows.length ? rows[0].date : null;
    } catch (err) {
        console.error("[getLastIndicatorDate] Erreur:", err.message);
        return null;
    }
}

// ------------------------------------------------------------------
// Calcul des plages de dates
// ------------------------------------------------------------------

function getToday() {
    return isoDayLocal(new Date());
}

// Date du jour en heure locale (pour la fiabilité)
function getTodayLocal() {
    return isoDayLocal(new Date());
}

function getYesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return isoDayLocal(d);
}

function getDateMinusDays(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return isoDayLocal(d);
}

// Soustraire des jours à partir d'une date ISO
function getDateMinusDaysFrom(dateIso, days) {
    const d = new Date(dateIso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - days);
    return isoDay(d);
}

function nextDay(iso) {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}

// Version asynchrone qui utilise la dernière date disponible pour les périodes multi-jours
async function getPeriodRange(period) {
    const today = getToday();
    const todayLocal = getTodayLocal();
    
    switch (period) {
        case 'today':
            // Utiliser l'heure locale pour aujourd'hui (minuit local)
            return { from: todayLocal, to: nextDay(todayLocal), source: 'raw' };
        case 'yesterday':
            return { from: getYesterday(), to: today, source: 'indicators' };
        case '7days': {
            // Obtenir la dernière date disponible dans DailyIndicators
            const lastDate = await getLastIndicatorDate();
            if (lastDate) {
                // Calculer à partir de la dernière date disponible
                const fromDate = getDateMinusDaysFrom(lastDate, 6); // 7 jours = 6 jours en arrière
                return { from: fromDate, to: nextDay(lastDate), source: 'indicators' };
            }
            // Fallback si aucune date disponible
            return { from: getDateMinusDays(7), to: today, source: 'indicators' };
        }
        case '30days': {
            const lastDate = await getLastIndicatorDate();
            if (lastDate) {
                const fromDate = getDateMinusDaysFrom(lastDate, 29); // 30 jours = 29 jours en arrière
                return { from: fromDate, to: nextDay(lastDate), source: 'indicators' };
            }
            return { from: getDateMinusDays(30), to: today, source: 'indicators' };
        }
        default:
            return { from: today, to: nextDay(today), source: 'raw' };
    }
}

function getYearRange(year) {
    return { from: year + "-01-01", to: (year + 1) + "-01-01", source: 'indicators' };
}

// Nombre de jours écoulés dans l'année donnée (jusqu'à aujourd'hui si c'est l'année en cours)
function daysElapsedInYear(year) {
    const now = new Date();
    const currentYear = now.getFullYear();
    if (year < currentYear) {
        // Année passée : 365 ou 366
        return (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
    }
    if (year > currentYear) return 0;
    // Année en cours : du 1er janvier à aujourd'hui
    const start = new Date(year, 0, 1);
    const diffMs = now - start;
    return Math.floor(diffMs / 86400000) + 1;
}

// ------------------------------------------------------------------
// Traitement des données
// ------------------------------------------------------------------

function processLatestData(row) {
    if (!row) return null;
    
    return {
        dateTime: row["DateTime"],
        temperature: row["Temperature"],
        humidity: row["Humidity"],
        pressure: row["Baro Pressure"],
        windGust: row["Wind Gust"],
        uvi: row["UVI"],
        hourlyRain: row["Hourly Rain"],
        rainRate: row["Rain Rate"]
    };
}

function processIndicatorsData(rows) {
    if (!rows || rows.length === 0) return [];
    
    const result = rows.map(row => ({
        date: row.date,
        tempMin: row.temp_min,
        tempAvg: row.temp_avg,
        tempMax: row.temp_max,
        rainTotal: row.rain_total,
        pressureMin: row.pressure_min,
        pressureMax: row.pressure_max,
        pressureAvg: row.pressure_avg,
        windGustMax: row.wind_gust_max,
        uvIndexMax: row.uv_index_max,
        reliability: row.reliability
    }));
    
    console.log(`[processIndicatorsData] ${result.length} lignes traitées. Première:`, result[0]);
    return result;
}

// Cumul journalier des précipitations à partir des données brutes MyMeteoData.
// "Hourly Rain" est un compteur cumulatif remis à zéro à chaque heure pleine.
// Règle : pluie de l'heure X = MAX(échantillon Xh55, échantillon (X+1)h00).
// Les échantillons Xh00 (reliquat heure X-1) et Xh05 (début heure X) sont ignorés.
// DateTime est tronqué à la minute pour neutraliser d'éventuelles secondes.
function computeDailyRainTotal(rows) {
    if (!rows || rows.length === 0) return null;

    const rainMap = {};
    let day = null;
    for (const row of rows) {
        const dt = row["DateTime"];
        if (!dt) continue;
        if (!day) day = dt.slice(0, 10);
        const hr = row["Hourly Rain"];
        if (hr === null || hr === undefined || isNaN(Number(hr))) continue;
        const t = dt.slice(0, 16).replace("T", " "); // "YYYY-MM-DD HH:MM"
        rainMap[t] = Number(hr);
    }
    if (!day) return null;

    let total = 0;
    for (let h = 0; h < 24; h++) {
        const hh = String(h).padStart(2, "0");
        const v55 = rainMap[day + " " + hh + ":55"];
        // v60 = (X+1)h00 ; pour h=23 ce serait le lendemain, hors plage du jour
        let v60;
        if (h < 23) {
            const nextH = String(h + 1).padStart(2, "0");
            v60 = rainMap[day + " " + nextH + ":00"];
        }
        total += Math.max(v55 !== undefined ? v55 : 0, v60 !== undefined ? v60 : 0);
    }
    return total > 0 ? Math.round(total * 10) / 10 : null;
}

function processRawDataForToday(rows) {
    if (!rows || rows.length === 0) return null;
    
    let tempMin = Infinity;
    let tempMax = -Infinity;
    let tempSum = 0;
    let tempCount = 0;
    let pressureMin = Infinity;
    let pressureMax = -Infinity;
    let pressureSum = 0;
    let pressureCount = 0;
    let windGustMax = -Infinity;
    let uvMax = -Infinity;
    let lastRain = null;
    
    for (const row of rows) {
        const t = Number(row["Temperature"]);
        const rain = Number(row["Hourly Rain"]);
        const press = Number(row["Baro Pressure"]);
        const gust = Number(row["Wind Gust"]);
        const uv = Number(row["UVI"]);
        
        if (!isNaN(t)) {
            tempMin = Math.min(tempMin, t);
            tempMax = Math.max(tempMax, t);
            tempSum += t;
            tempCount++;
        }
        
        if (!isNaN(rain)) {
            lastRain = rain;
        }
        
        if (!isNaN(press)) {
            pressureMin = Math.min(pressureMin, press);
            pressureMax = Math.max(pressureMax, press);
            pressureSum += press;
            pressureCount++;
        }
        
        if (!isNaN(gust)) {
            windGustMax = Math.max(windGustMax, gust);
        }
        
        if (!isNaN(uv)) {
            uvMax = Math.max(uvMax, uv);
        }
    }
    
    return {
        date: getToday(),
        tempMin: tempMin === Infinity ? null : tempMin,
        tempAvg: tempCount > 0 ? tempSum / tempCount : null,
        tempMax: tempMax === -Infinity ? null : tempMax,
        rainTotal: computeDailyRainTotal(rows),
        hourlyRain: lastRain || null,
        pressureMin: pressureMin === Infinity ? null : pressureMin,
        pressureMax: pressureMax === -Infinity ? null : pressureMax,
        pressureAvg: pressureCount > 0 ? pressureSum / pressureCount : null,
        windGustMax: windGustMax === -Infinity ? null : windGustMax,
        uvIndexMax: uvMax === -Infinity ? null : uvMax
    };
}

function aggregateIndicatorsData(rows) {
    if (!rows || rows.length === 0) return null;
    
    let tempMin = Infinity;
    let tempMax = -Infinity;
    let tempSum = 0;
    let tempCount = 0;
    let rainTotal = 0;
    let pressureMin = Infinity;
    let pressureMax = -Infinity;
    let windGustMax = -Infinity;
    let uvMax = -Infinity;
    
    for (const row of rows) {
        // Utiliser les noms de propriétés avec majuscules (comme retournés par processIndicatorsData)
        if (row.tempMin !== null && row.tempMin !== undefined && !isNaN(row.tempMin)) tempMin = Math.min(tempMin, row.tempMin);
        if (row.tempMax !== null && row.tempMax !== undefined && !isNaN(row.tempMax)) tempMax = Math.max(tempMax, row.tempMax);
        if (row.tempAvg !== null && row.tempAvg !== undefined && !isNaN(row.tempAvg)) {
            tempSum += row.tempAvg;
            tempCount++;
        }
        if (row.rainTotal !== null && row.rainTotal !== undefined && !isNaN(row.rainTotal)) rainTotal += row.rainTotal;
        if (row.pressureMin !== null && row.pressureMin !== undefined && !isNaN(row.pressureMin)) pressureMin = Math.min(pressureMin, row.pressureMin);
        if (row.pressureMax !== null && row.pressureMax !== undefined && !isNaN(row.pressureMax)) pressureMax = Math.max(pressureMax, row.pressureMax);
        if (row.windGustMax !== null && row.windGustMax !== undefined && !isNaN(row.windGustMax)) windGustMax = Math.max(windGustMax, row.windGustMax);
        if (row.uvIndexMax !== null && row.uvIndexMax !== undefined && !isNaN(row.uvIndexMax)) uvMax = Math.max(uvMax, row.uvIndexMax);
    }
    
    return {
        tempMin: tempMin === Infinity ? null : tempMin,
        tempAvg: tempCount > 0 ? tempSum / tempCount : null,
        tempMax: tempMax === -Infinity ? null : tempMax,
        rainTotal: rainTotal || null,
        pressureMin: pressureMin === Infinity ? null : pressureMin,
        pressureMax: pressureMax === -Infinity ? null : pressureMax,
        windGustMax: windGustMax === -Infinity ? null : windGustMax,
        uvIndexMax: uvMax === -Infinity ? null : uvMax
    };
}

// Calcule la moyenne de fiabilité à partir des lignes d'indicateurs journaliers
function computeAvgReliability(rows) {
    if (!rows || rows.length === 0) return 0;
    let sum = 0;
    let count = 0;
    for (const row of rows) {
        const r = Number(row.reliability);
        if (!isNaN(r)) {
            sum += r;
            count++;
        }
    }
    // reliability est stocké entre 0 et 1 dans DailyIndicators : on convertit en pourcentage
    return count > 0 ? Math.round((sum / count) * 100) : 0;
}

// ------------------------------------------------------------------
// Rendu des données
// ------------------------------------------------------------------

function renderLatestData(data) {
    const container = document.getElementById('latestData');
    
    if (!data) {
        container.innerHTML = '<p class="no-data">Aucune donnée disponible</p>';
        return;
    }
    
    const items = [
        { label: 'Date', value: frDateTime(data.dateTime) },
        { label: 'Température', value: fmt(data.temperature, 1) + '°C' },
        { label: 'Taux de pluie', value: fmt(data.rainRate, 1) + ' mm/h' },
        { label: 'Pression', value: fmt(data.pressure, 1) + ' hPa' },
        { label: 'Rafale', value: fmt(data.windGust, 1) + ' km/h' },
        { label: 'UV', value: fmt(data.uvi, 1) }
    ];
    
    container.innerHTML = items.map(item => `
        <div class="latest-item">
            <span class="label">${item.label}</span>
            <span class="value">${item.value}</span>
        </div>
    `).join('');
    
    // Fermer la modal d'erreur après un rendu réussi
    hideErrorModal();
}

function renderIndicatorsTable(data, period) {
    const container = document.getElementById('indicatorsTableBody');
    
    if (!data || data.length === 0) {
        container.innerHTML = '<p class="no-data">Aucune donnée disponible pour cette période</p>';
        return;
    }
    
    data.sort((a, b) => b.date.localeCompare(a.date));
    
    let rows = '';
    
    if (period === 'today') {
        const d = data[0];
        rows = `
            <div class="table-row">
                <span class="col-label">Temp. Min</span>
                <span class="col-value">${fmt(d.tempMin, 1)}°C</span>
                <span class="col-date">${frDate(d.date)}</span>
            </div>
            <div class="table-row">
                <span class="col-label">Temp. Moy</span>
                <span class="col-value">${fmt(d.tempAvg, 1)}°C</span>
                <span class="col-date">${frDate(d.date)}</span>
            </div>
            <div class="table-row">
                <span class="col-label">Temp. Max</span>
                <span class="col-value">${fmt(d.tempMax, 1)}°C</span>
                <span class="col-date">${frDate(d.date)}</span>
            </div>
            <div class="table-row">
                <span class="col-label">Pluie totale</span>
                <span class="col-value">${fmt(d.rainTotal, 1)} mm</span>
                <span class="col-date">${frDate(d.date)}</span>
            </div>
            <div class="table-row">
                <span class="col-label">Pression Min</span>
                <span class="col-value">${fmt(d.pressureMin, 1)} hPa</span>
                <span class="col-date">${frDate(d.date)}</span>
            </div>
            <div class="table-row">
                <span class="col-label">Pression Max</span>
                <span class="col-value">${fmt(d.pressureMax, 1)} hPa</span>
                <span class="col-date">${frDate(d.date)}</span>
            </div>
            <div class="table-row">
                <span class="col-label">Rafale Max</span>
                <span class="col-value">${fmt(d.windGustMax, 1)} km/h</span>
                <span class="col-date">${frDate(d.date)}</span>
            </div>
            <div class="table-row">
                <span class="col-label">UV Max</span>
                <span class="col-value">${fmt(d.uvIndexMax, 1)}</span>
                <span class="col-date">${frDate(d.date)}</span>
            </div>
        `;
    } else {
        data.forEach(d => {
            rows += `
                <div class="table-row">
                    <span class="col-label">${frDate(d.date)}</span>
                    <span class="col-value">—</span>
                    <span class="col-date">—</span>
                </div>
                <div class="table-row">
                    <span class="col-label">Min/Max</span>
                    <span class="col-value">${fmt(d.tempMin, 1)}° / ${fmt(d.tempMax, 1)}°C</span>
                    <span class="col-date">${frDate(d.date)}</span>
                </div>
                <div class="table-row">
                    <span class="col-label">Moyenne</span>
                    <span class="col-value">${fmt(d.tempAvg, 1)}°C</span>
                    <span class="col-date">${frDate(d.date)}</span>
                </div>
                <div class="table-row">
                    <span class="col-label">Pluie</span>
                    <span class="col-value">${fmt(d.rainTotal, 1)} mm</span>
                    <span class="col-date">${frDate(d.date)}</span>
                </div>
            `;
        });
    }
    
    container.innerHTML = rows;
    
    // Fermer la modal d'erreur après un rendu réussi
    hideErrorModal();
}

function renderSummary(summary, period) {
    const container = document.getElementById('summaryGrid');
    
    if (!summary) {
        const periodLabels = {
            today: 'Aujourd\'hui',
            yesterday: 'Hier',
            '7days': '7 derniers jours',
            '30days': '30 derniers jours',
            year: `Année ${state.selectedYear || ''}`
        };
        const label = periodLabels[period] || period;
        container.innerHTML = `<p class="no-data">Aucune donnée disponible pour ${label}</p>`;
        return;
    }
    
    // Gestion des valeurs null/undefined dans le summary - libellés courts pour mobile
    const items = [
        { label: 'T° min', value: summary.tempMin !== null && summary.tempMin !== undefined ? fmt(summary.tempMin, 1) + '°C' : '—' },
        { label: 'T° max', value: summary.tempMax !== null && summary.tempMax !== undefined ? fmt(summary.tempMax, 1) + '°C' : '—' },
        { label: 'T° moy', value: summary.tempAvg !== null && summary.tempAvg !== undefined ? fmt(summary.tempAvg, 1) + '°C' : '—' },
        { label: 'Précipitations', value: summary.rainTotal !== null && summary.rainTotal !== undefined ? fmt(summary.rainTotal, 1) + ' mm' : '—' },
        { label: 'Rafale max', value: summary.windGustMax !== null && summary.windGustMax !== undefined ? fmt(summary.windGustMax, 1) + ' km/h' : '—' },
        { label: 'UV max', value: summary.uvIndexMax !== null && summary.uvIndexMax !== undefined ? fmt(summary.uvIndexMax, 1) : '—' },
        { label: 'Press. min', value: summary.pressureMin !== null && summary.pressureMin !== undefined ? fmt(summary.pressureMin, 1) + ' hPa' : '—' },
        { label: 'Press. max', value: summary.pressureMax !== null && summary.pressureMax !== undefined ? fmt(summary.pressureMax, 1) + ' hPa' : '—' }
    ];
    
    container.innerHTML = items.map(item => `
        <div class="summary-item">
            <span class="label">${item.label}</span>
            <span class="value">${item.value}</span>
        </div>
    `).join('');
    
    // Fermer la modal d'erreur après un rendu réussi
    hideErrorModal();
}

// ------------------------------------------------------------------
// Gestion des vues (Indicateurs / Comparaison)
// ------------------------------------------------------------------

function switchView(view) {
    // Mettre à jour l'état actif des onglets
    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.view === view);
    });
    
    // Afficher/masquer les vues
    document.getElementById('indicatorsView').hidden = (view !== 'indicators');
    document.getElementById('comparisonView').hidden = (view !== 'comparison');
    
    // Masquer la modal d'erreur au changement de vue
    hideErrorModal();
    
    // Si on passe sur Comparaison, charger les données de comparaison
    if (view === 'comparison') {
        loadComparisonData();
    }
}

// ------------------------------------------------------------------
// Analyse annuelle (vue Comparaison) — porté de MyMeteo (onglet "ana")
// ------------------------------------------------------------------

// Bornes min/max de "date" dans DailyIndicators
async function fetchIndicatorDate(order) {
    const url = CFG.url + "/rest/v1/" + CFG.indicatorsTable +
        "?select=date&order=date." + order + "&limit=1";
    const rows = await fetchJSON(url, 'fetchIndicatorDate');
    return rows.length ? rows[0].date : null;
}

// Cadence attendue : 1 relevé / 5 min (288/jour), sauf du 19/04/2026 au 01/11/2026 : 1 / 15 min (96/jour)
function expectedPerDay(dayIso) {
    if (dayIso >= "2026-04-19" && dayIso < "2026-11-01") return 96;
    return 288;
}

// Attendu pour un jour donné : journée complète, sauf aujourd'hui (prorata des créneaux écoulés)
function expectedForDay(dayIso, now) {
    const perDay = expectedPerDay(dayIso);
    const todayIso = isoDayLocal(now);
    if (dayIso < todayIso) return perDay;
    if (dayIso > todayIso) return 0;
    const step = perDay === 96 ? 15 : 5;
    const slots = Math.floor((now.getHours() * 60 + now.getMinutes()) / step) + 1;
    return Math.min(perDay, slots);
}

// Somme des relevés attendus par mois sur la plage [from, to)
function computeExpMonths(from, to) {
    const expMonths = {};
    if (!from) return expMonths;
    const nowRef = new Date();
    const todayIso = isoDayLocal(nowRef);
    const d0 = new Date(from + "T00:00:00Z");
    const end = to ? new Date(to + "T00:00:00Z") : new Date(Date.UTC(2100, 0, 1));
    while (d0 < end) {
        const iso = isoDay(d0);
        if (iso > todayIso) break;
        const mk = iso.slice(0, 7);
        expMonths[mk] = (expMonths[mk] || 0) + expectedForDay(iso, nowRef);
        d0.setUTCDate(d0.getUTCDate() + 1);
    }
    return expMonths;
}

// Cumul de pluie par jour depuis les relevés bruts (règle MAX(Xh55, (X+1)h00))
function computeRainByDay(rows) {
    const rainMap = {};
    const daySet = {};
    for (const row of rows) {
        const dt = row["DateTime"];
        if (!dt) continue;
        const day = dt.slice(0, 10);
        daySet[day] = true;
        const hr = row["Hourly Rain"];
        if (hr === null || hr === undefined || isNaN(Number(hr))) continue;
        rainMap[dt.slice(0, 16).replace("T", " ")] = Number(hr);
    }
    const result = {};
    for (const d in daySet) {
        let total = 0;
        for (let h = 0; h < 24; h++) {
            const hh = String(h).padStart(2, "0");
            const v55 = rainMap[d + " " + hh + ":55"];
            let v60;
            if (h < 23) {
                const nextH = String(h + 1).padStart(2, "0");
                v60 = rainMap[d + " " + nextH + ":00"];
            } else {
                const dd = new Date(d + "T00:00:00Z");
                dd.setUTCDate(dd.getUTCDate() + 1);
                v60 = rainMap[dd.toISOString().slice(0, 10) + " 00:00"];
            }
            total += Math.max(v55 !== undefined ? v55 : 0, v60 !== undefined ? v60 : 0);
        }
        result[d] = Math.round(total * 10) / 10;
    }
    return result;
}

// Agrégation des relevés bruts (par jour et par mois) — utilisée pour le complément du jour en cours
function aggregateRaw(rows, from, to) {
    const days = {}, months = {};
    const k = {
        n: 0, tSum: 0, tMax: -Infinity, tMaxDt: null, tMin: Infinity, tMinDt: null,
        gustMax: -Infinity, gustDt: null, uvMax: -Infinity, humSum: 0, rainHours: 0
    };

    function dayObj(key) {
        if (!days[key]) days[key] = {
            n: 0, tSum: 0, lo: Infinity, hi: -Infinity, humSum: 0,
            gust: -1, gustDt: null, rain: 0, pressSum: 0, pressN: 0
        };
        return days[key];
    }
    function monthObj(key) {
        if (!months[key]) months[key] = {
            n: 0, tSum: 0, lo: Infinity, hi: -Infinity, humSum: 0, pressSum: 0, pressN: 0,
            gust: -1, uv: -1, windSum: 0, rain: 0
        };
        return months[key];
    }

    for (const r of rows) {
        const dt = r["DateTime"];
        if (!dt) continue;
        const day = dt.slice(0, 10);
        const month = dt.slice(0, 7);
        const tVal = (r["Temperature"] === null || r["Temperature"] === undefined) ? null : Number(r["Temperature"]);
        const hum = r["Humidity"];
        const gust = r["Wind Gust"];
        const uv = r["UVI"];
        const press = r["Baro Pressure"];

        k.n++;
        if (tVal !== null) {
            k.tSum += tVal;
            if (tVal > k.tMax) { k.tMax = tVal; k.tMaxDt = dt; }
            if (tVal < k.tMin) { k.tMin = tVal; k.tMinDt = dt; }
        }
        if (hum !== null && hum !== undefined) k.humSum += Number(hum);
        if (gust !== null && gust !== undefined && Number(gust) > k.gustMax) { k.gustMax = Number(gust); k.gustDt = dt; }
        if (uv !== null && uv !== undefined) k.uvMax = Math.max(k.uvMax, Number(uv));

        const d = dayObj(day);
        d.n++;
        if (tVal !== null) {
            d.tSum += tVal;
            if (tVal > d.hi) d.hi = tVal;
            if (tVal < d.lo) d.lo = tVal;
        }
        if (hum !== null && hum !== undefined) d.humSum += Number(hum);
        if (gust !== null && gust !== undefined) d.gust = Math.max(d.gust, Number(gust));
        if (press !== null && press !== undefined) { d.pressSum += Number(press); d.pressN++; }

        const m = monthObj(month);
        m.n++;
        if (tVal !== null) {
            m.tSum += tVal;
            if (tVal > m.hi) m.hi = tVal;
            if (tVal < m.lo) m.lo = tVal;
        }
        if (hum !== null && hum !== undefined) m.humSum += Number(hum);
        if (press !== null && press !== undefined) { m.pressSum += Number(press); m.pressN++; }
        if (gust !== null && gust !== undefined) m.gust = Math.max(m.gust, Number(gust));
        if (uv !== null && uv !== undefined) m.uv = Math.max(m.uv, Number(uv));
    }

    const rainByDay = computeRainByDay(rows);
    for (const dk in rainByDay) {
        const rv = rainByDay[dk];
        dayObj(dk).rain += rv;
        monthObj(dk.slice(0, 7)).rain += rv;
        if (rv > 0) k.rainHours++;
    }

    return { k, days, months, expMonths: computeExpMonths(from, to) };
}

// Construction des agrégats depuis DailyIndicators + relevés bruts du jour en cours
// (identique à buildAgg de MyMeteo — produit la structure { k, days, months, expMonths })
function buildAgg(indRows, rawRows, from, to) {
    const days = {}, months = {};
    const k = {
        n: 0, tSum: 0, tCount: 0, tMax: -Infinity, tMaxDt: null, tMin: Infinity, tMinDt: null,
        gustMax: -Infinity, gustDt: null, uvMax: -Infinity, humSum: 0, rainHours: 0,
        tSumAvg: 0, tDays: 0, relSum: 0, relDays: 0
    };

    function dayObj(key) {
        if (!days[key]) days[key] = {
            n: 0, tSum: 0, lo: Infinity, hi: -Infinity, humSum: 0,
            gust: -1, gustDt: null, rain: 0, rel: null, pressSum: 0, pressN: 0,
            tAvgSum: 0, tAvgN: 0
        };
        return days[key];
    }
    function monthObj(key) {
        if (!months[key]) months[key] = {
            n: 0, tSum: 0, lo: Infinity, hi: -Infinity, humSum: 0, pressSum: 0, pressN: 0,
            gust: -1, uv: -1, windSum: 0, rain: 0, tAvgSum: 0, tAvgN: 0
        };
        return months[key];
    }

    // --- 1. Indicateurs journaliers pré-calculés ---
    for (const r of indRows) {
        const day = r.date;
        if (!day) continue;
        const month = day.slice(0, 7);
        const n = Number(r.record_count) || 0;
        const tc = Number(r.temp_count) || 0;
        const tAvg = (r.temp_avg === null || r.temp_avg === undefined) ? null : Number(r.temp_avg);
        const tMin = (r.temp_min === null || r.temp_min === undefined) ? null : Number(r.temp_min);
        const tMax = (r.temp_max === null || r.temp_max === undefined) ? null : Number(r.temp_max);
        const hum = (r.humidity_avg === null || r.humidity_avg === undefined) ? null : Number(r.humidity_avg);
        const press = (r.pressure_avg === null || r.pressure_avg === undefined) ? null : Number(r.pressure_avg);
        const gust = (r.wind_gust_max === null || r.wind_gust_max === undefined) ? null : Number(r.wind_gust_max);
        const uv = (r.uv_index_max === null || r.uv_index_max === undefined) ? null : Number(r.uv_index_max);
        const rain = (r.rain_total === null || r.rain_total === undefined) ? 0 : Number(r.rain_total);
        const rel = (r.reliability === null || r.reliability === undefined)
            ? Math.round(100 * n / Math.max(1, expectedForDay(day, new Date())))
            : Math.round(Number(r.reliability) * 100);

        k.n += n;
        if (tAvg !== null) { k.tSumAvg += tAvg; k.tDays++; }
        k.relSum += rel / 100; k.relDays++;
        if (tAvg !== null && tc) {
            k.tSum += tAvg * tc;
            k.tCount += tc;
            if (tMax !== null && tMax > k.tMax) { k.tMax = tMax; k.tMaxDt = day; }
            if (tMin !== null && tMin < k.tMin) { k.tMin = tMin; k.tMinDt = day; }
        }
        if (hum !== null) k.humSum += hum * n;
        if (gust !== null && gust > k.gustMax) { k.gustMax = gust; k.gustDt = day; }
        if (uv !== null) k.uvMax = Math.max(k.uvMax, uv);
        if (rain > 0) k.rainHours++;

        const d = dayObj(day);
        d.n += n;
        d.rel = rel;
        if (tAvg !== null) { d.tAvgSum += tAvg; d.tAvgN++; }
        if (tAvg !== null && tc) {
            d.tSum += tAvg * tc;
            if (tMax !== null && tMax > d.hi) d.hi = tMax;
            if (tMin !== null && tMin < d.lo) d.lo = tMin;
        }
        if (hum !== null) d.humSum += hum * n;
        if (gust !== null && gust > d.gust) d.gust = gust;
        d.rain += rain;
        if (press !== null) { d.pressSum += press * n; d.pressN += n; }

        const m = monthObj(month);
        m.n += n;
        if (tAvg !== null) { m.tAvgSum += tAvg; m.tAvgN++; }
        if (tAvg !== null && tc) {
            m.tSum += tAvg * tc;
            if (tMax !== null && tMax > m.hi) m.hi = tMax;
            if (tMin !== null && tMin < m.lo) m.lo = tMin;
        }
        if (hum !== null) m.humSum += hum * n;
        if (press !== null) { m.pressSum += press * n; m.pressN += n; }
        if (gust !== null && gust > m.gust) m.gust = gust;
        if (uv !== null && uv > m.uv) m.uv = uv;
        m.rain += rain;
    }

    // --- 2. Complément : relevés bruts du jour en cours ---
    if (rawRows && rawRows.length) {
        const extra = aggregateRaw(rawRows, from, to);
        k.n += extra.k.n;
        k.tSum += extra.k.tSum;
        k.tCount += extra.k.n;
        if (extra.k.tMax > k.tMax) { k.tMax = extra.k.tMax; k.tMaxDt = extra.k.tMaxDt; }
        if (extra.k.tMin < k.tMin) { k.tMin = extra.k.tMin; k.tMinDt = extra.k.tMinDt; }
        if (extra.k.gustMax > k.gustMax) { k.gustMax = extra.k.gustMax; k.gustDt = extra.k.gustDt; }
        k.uvMax = Math.max(k.uvMax, extra.k.uvMax);
        k.humSum += extra.k.humSum;
        k.rainHours += extra.k.rainHours;
        for (const dk in extra.days) {
            const ed = extra.days[dk];
            const bd = dayObj(dk);
            bd.n += ed.n;
            bd.tSum += ed.tSum;
            if (ed.hi > bd.hi) bd.hi = ed.hi;
            if (ed.lo < bd.lo) bd.lo = ed.lo;
            bd.humSum += ed.humSum;
            if (ed.gust > bd.gust) { bd.gust = ed.gust; bd.gustDt = ed.gustDt; }
            if (bd.rel === null) bd.rel = Math.round(100 * bd.n / Math.max(1, expectedForDay(dk, new Date())));
            bd.rain += ed.rain;
            bd.pressSum += ed.pressSum; bd.pressN += ed.pressN;
            if (ed.n > 0) {
                const dayAvg = ed.tSum / ed.n;
                k.tSumAvg += dayAvg; k.tDays++;
                bd.tAvgSum += dayAvg; bd.tAvgN++;
                monthObj(dk.slice(0, 7)).tAvgSum += dayAvg;
                monthObj(dk.slice(0, 7)).tAvgN++;
                k.relSum += ed.n / Math.max(1, expectedForDay(dk, new Date()));
                k.relDays++;
            }
        }
        for (const mk in extra.months) {
            const em = extra.months[mk];
            const bm = monthObj(mk);
            bm.n += em.n; bm.tSum += em.tSum;
            if (em.hi > bm.hi) bm.hi = em.hi;
            if (em.lo < bm.lo) bm.lo = em.lo;
            bm.humSum += em.humSum;
            bm.pressSum += em.pressSum; bm.pressN += em.pressN;
            if (em.gust > bm.gust) bm.gust = em.gust;
            if (em.uv > bm.uv) bm.uv = em.uv;
            bm.rain += em.rain;
        }
    }

    return { k, days, months, expMonths: computeExpMonths(from, to) };
}

// Nombre d'épisodes d'au moins 3 jours consécutifs vérifiant `test`, et plus longue série
function streaks(dayKeys, days, test) {
    let run = 0, runs3 = 0, maxRun = 0, prev = null;
    for (const dk of dayKeys) {
        const consecutive = prev !== null &&
            (new Date(dk + "T00:00:00Z") - new Date(prev + "T00:00:00Z")) === 86400000;
        if (test(days[dk])) {
            if (!consecutive && run >= 3) runs3++;
            run = consecutive ? run + 1 : 1;
            if (run > maxRun) maxRun = run;
        } else {
            if (run >= 3) runs3++;
            run = 0;
        }
        prev = dk;
    }
    if (run >= 3) runs3++;
    return { runs3, maxRun };
}

function computeYearStatsFromAgg(year, agg) {
    const dayKeys = Object.keys(agg.days).sort();
    let hot = 0, frost = 0, tMin = Infinity, tMax = -Infinity;
    for (const dk of dayKeys) {
        const d = agg.days[dk];
        if (d.hi > 35) hot++;
        if (d.lo < 0) frost++;
        if (d.lo < tMin) tMin = d.lo;
        if (d.hi > tMax) tMax = d.hi;
    }
    const hotSt = streaks(dayKeys, agg.days, d => d.hi > 35);
    const frostSt = streaks(dayKeys, agg.days, d => d.lo < 0);
    return {
        year,
        // Fiabilité = moyenne simple des fiabilités journalières (chaque jour compte pour 1)
        rel: agg.k.relDays ? Math.round(100 * agg.k.relSum / agg.k.relDays) : null,
        hot, frost,
        hotRun3: hotSt.runs3, hotRunMax: hotSt.maxRun,
        frostRun3: frostSt.runs3, frostRunMax: frostSt.maxRun,
        tMin: tMin === Infinity ? null : tMin,
        tMax: tMax === -Infinity ? null : tMax
    };
}

// Définition des indicateurs affichés (identique à MyMeteo)
const ANA_HEAT_ROWS = [
    { key: "rel",       label: "Fiabilité",                          dec: 0, noHl: true, unit: "%" },
    { key: "tMax",      label: "Tmax absolue",                       dec: 1, unit: "°C" },
    { key: "hot",       label: "Jours Tmax > 35 °C",                 dec: 0, unit: "" },
    { key: "hotRun3",   label: "Épisodes ≥ 3 j consécutifs",         dec: 0, unit: "" },
    { key: "hotRunMax", label: "Max de jours consécutifs",           dec: 0, unit: " j" }
];

const ANA_COLD_ROWS = [
    { key: "rel",         label: "Fiabilité",                          dec: 0, noHl: true, unit: "%" },
    { key: "tMin",        label: "Tmin absolue",                       dec: 1, unit: "°C" },
    { key: "frost",       label: "Jours Tmin < 0 °C",                  dec: 0, unit: "" },
    { key: "frostRun3",   label: "Épisodes ≥ 3 j consécutifs",         dec: 0, unit: "" },
    { key: "frostRunMax", label: "Max de jours consécutifs",           dec: 0, unit: " j" }
];

// Rendu mobile : une carte par année, indicateurs en grille, records surlignés
function renderComparisonTable(stats, rows, containerId) {
    const container = document.getElementById(containerId);

    // Records min/max de chaque indicateur (colonne) sur l'ensemble des années
    const ext = {};
    rows.forEach(r => {
        if (r.noHl) { ext[r.key] = null; return; }
        const vals = [];
        stats.forEach(s => {
            const v = s[r.key];
            if (v !== null && v !== undefined && !isNaN(v)) vals.push(v);
        });
        if (!vals.length) { ext[r.key] = null; return; }
        const mn = Math.min(...vals);
        const mx = Math.max(...vals);
        ext[r.key] = (mn === mx) ? null : { min: mn, max: mx };
    });

    container.innerHTML = stats.map(s => {
        const statsHtml = rows.map(r => {
            const v = s[r.key];
            let cls = "";
            const e = ext[r.key];
            if (e && v !== null && v !== undefined && !isNaN(v)) {
                if (v === e.max) cls = "hl-max";
                else if (v === e.min) cls = "hl-min";
            }
            const display = (v === null || v === undefined || isNaN(v)) ? "—" : fmt(v, r.dec) + r.unit;
            return `<div class="year-stat ${cls}">
                <span class="label">${r.label}</span>
                <span class="value">${display}</span>
            </div>`;
        }).join("");

        return `<div class="year-card">
            <div class="year-card-header">${s.year}</div>
            <div class="year-card-grid">${statsHtml}</div>
        </div>`;
    }).join("");
}

function renderComparison(stats) {
    stats.sort((a, b) => a.year - b.year);
    renderComparisonTable(stats, ANA_HEAT_ROWS, "heatComparisonContent");
    renderComparisonTable(stats, ANA_COLD_ROWS, "coldComparisonContent");
}

// État de chargement de la comparaison
let comparisonLoaded = false;

async function loadComparisonData(force) {
    if (comparisonLoaded && !force) return;

    const statusEl = document.getElementById("comparisonStatus");
    const btn = document.getElementById("refreshComparisonBtn");
    const setStatus = (msg, isErr) => {
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.className = "comparison-status" + (isErr ? " error" : "");
    };

    if (btn) btn.disabled = true;
    showLoading();
    hideErrorModal();

    try {
        setStatus("Détermination des années disponibles…");
        const today = isoDayLocal(new Date());

        const [dMin, dMax] = await Promise.all([
            fetchIndicatorDate("asc"),
            fetchIndicatorDate("desc")
        ]);

        if (!dMin || !dMax) throw new Error("Impossible de déterminer la plage de dates de la station.");

        let firstDate = dMin;
        if (Number(firstDate.slice(0, 4)) < 2024) firstDate = "2024-01-01"; // années complètes uniquement
        const yMin = Number(firstDate.slice(0, 4));
        const yMax = Number(dMax.slice(0, 4));

        const years = [];
        for (let y = yMin; y <= yMax; y++) years.push(y);

        let done = 0;
        setStatus(`Chargement de l'analyse… 0/${years.length} années`);

        const results = await Promise.all(years.map(async (y) => {
            const yearStart = y + "-01-01";
            const yearEnd = (y + 1) + "-01-01";
            const indFrom = yearStart < today ? yearStart : null;
            const indTo = yearEnd <= today ? yearEnd : today;
            const rawFrom = yearStart > today ? yearStart : today;
            const hasRaw = rawFrom < yearEnd;
            const pInd = indFrom ? fetchIndicators(indFrom, indTo) : Promise.resolve([]);
            const pRaw = hasRaw ? fetchRows(rawFrom, yearEnd) : Promise.resolve([]);
            const [indRows, rawRows] = await Promise.all([pInd, pRaw]);
            done++;
            setStatus(`Chargement de l'analyse… ${done}/${years.length} années`);
            return { year: y, agg: buildAgg(indRows, rawRows, yearStart, yearEnd) };
        }));

        const stats = results.map(r => computeYearStatsFromAgg(r.year, r.agg));
        renderComparison(stats);
        comparisonLoaded = true;

        const first = stats.length ? stats[0].year : "—";
        const last = stats.length ? stats[stats.length - 1].year : "—";
        setStatus(`Analyse terminée — ${stats.length} année(s), de ${first} à ${last}.`);
    } catch (err) {
        setStatus("Échec : " + err.message, true);
        showError("Impossible de charger l'analyse annuelle : " + err.message);
    } finally {
        if (btn) btn.disabled = false;
        hideLoading();
    }
}

// ------------------------------------------------------------------
// Gestion des périodes
// ------------------------------------------------------------------

function selectPeriod(period) {
    // "years" => directement l'année en cours, sans liste de sélection
    if (period === 'years') {
        period = 'year';
        state.selectedYear = new Date().getFullYear();
    }
    
    state.currentPeriod = period;
    
    // Masquer la modal d'erreur au changement de période
    hideErrorModal();
    
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.classList.remove('active');
        // Le bouton "years" correspond à la période interne "year"
        const btnPeriod = btn.dataset.period === 'years' ? 'year' : btn.dataset.period;
        if (btnPeriod === period) {
            btn.classList.add('active');
        }
    });
    
    document.getElementById('dataSection').hidden = false;
    
    const titles = {
        today: 'Aujourd\'hui',
        yesterday: 'Hier',
        '7days': '7 derniers jours',
        '30days': '30 derniers jours',
        year: `Année ${state.selectedYear}`
    };
    
    document.getElementById('periodTitle').textContent = titles[period] || period;
    document.getElementById('periodBadge').textContent = '';
    
    loadData();
}

// ------------------------------------------------------------------
// Chargement des données
// ------------------------------------------------------------------

async function loadLatest() {
    hideErrorModal();
    try {
        const row = await fetchLatestRow();
        state.latestData = processLatestData(row);
        renderLatestData(state.latestData);
    } catch (err) {
        showError('Impossible de charger le dernier relevé : ' + err.message);
    }
}

async function loadPeriodData() {
    hideErrorModal();
    const period = state.currentPeriod;
    
    // Calculer le nombre de jours attendus pour cette période
    const expectedDays = {
        today: 1,
        yesterday: 1,
        '7days': 7,
        '30days': 30,
        year: daysElapsedInYear(state.selectedYear || new Date().getFullYear())
    };
    state.periodExpectedDays = expectedDays[period] || 0;
    
    if (period === 'year' && state.selectedYear) {
        const range = getYearRange(state.selectedYear);
        try {
            const rows = await fetchIndicators(range.from, range.to);
            state.periodRowsCount = rows.length;
            state.periodAvgReliability = computeAvgReliability(rows);
            updatePeriodBadge();
            const data = processIndicatorsData(rows);
            const summary = aggregateIndicatorsData(data);
            
            state.periodData = data;
            state.periodSummary = summary;
            
            renderSummary(summary, period);
        } catch (err) {
            showError('Impossible de charger les données pour cette période : ' + err.message);
        }
        return;
    }
    
    // getPeriodRange est maintenant asynchrone
    const range = await getPeriodRange(period);
    
    try {
        if (range.source === 'raw') {
            const rows = await fetchRows(range.from, range.to);
            const data = processRawDataForToday(rows);
            
            // Calcul de la fiabilité pour aujourd'hui : 1 donnée toutes les 5 min
            // Utiliser l'heure LOCALE (pas UTC) car on compte depuis minuit local
            const now = new Date();
            const elapsedMinutes = now.getHours() * 60 + now.getMinutes();
            const expectedSlots = Math.floor(elapsedMinutes / 5) + 1;
            const receivedRows = rows.length;
            state.todayReliability = expectedSlots > 0 ? Math.min(100, Math.round((receivedRows / expectedSlots) * 100)) : 0;
            state.periodRowsCount = receivedRows;
            
            if (data) {
                state.periodData = [data];
                state.periodSummary = data;
            } else {
                state.periodData = [];
                state.periodSummary = null;
            }
        } else {
            const rows = await fetchIndicators(range.from, range.to);
            state.periodRowsCount = rows.length;
            state.periodAvgReliability = computeAvgReliability(rows);
            const data = processIndicatorsData(rows);
            const summary = aggregateIndicatorsData(data);
            
            state.periodData = data;
            state.periodSummary = summary;
        }
        
        updatePeriodBadge();
        renderSummary(state.periodSummary, period);
        
    } catch (err) {
        showError('Impossible de charger les données pour cette période : ' + err.message);
    }
}

// Met à jour le badge avec le pourcentage de fiabilité de la période
function updatePeriodBadge() {
    const badge = document.getElementById('periodBadge');
    const period = state.currentPeriod;
    
    if (period === 'today') {
        badge.textContent = `Fiabilité ${state.todayReliability}%`;
    } else {
        badge.textContent = `Fiabilité ${state.periodAvgReliability}%`;
    }
}

async function loadData() {
    if (state.isLoading) return;
    
    showLoading();
    hideErrorModal(); // Masquer la modal au début du chargement
    
    try {
        await loadPeriodData();
        
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const localIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
        document.getElementById('lastUpdate').textContent = `Mise à jour : ${frDateTime(localIso)}`;
        
    } catch (err) {
        showError('Erreur lors du chargement : ' + err.message);
    } finally {
        hideLoading();
    }
}

// ------------------------------------------------------------------
// Initialisation
// ------------------------------------------------------------------

async function init() {
    // Masquer la modal d'erreur dès le démarrage
    hideErrorModal();
    
    try {
        await loadLatest();
        
        state.currentPeriod = 'today';
        await loadData();
        
        document.querySelector('.period-btn[data-period="today"]').classList.add('active');
        
    } catch (err) {
        showError('Erreur d\'initialisation : ' + err.message);
    }
}

function handlePeriodButtonClick(period) {
    selectPeriod(period);
}

function attachEventListeners() {
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const period = btn.dataset.period;
            handlePeriodButtonClick(period);
        });
    });
    
    // Bouton OK de la modal d'erreur
    const errorOkBtn = document.querySelector('#errorModal .btn-primary');
    if (errorOkBtn) {
        errorOkBtn.onclick = function() {
            hideErrorModal();
        };
    }
    
    document.getElementById('refreshBtn').addEventListener('click', async () => {
        hideErrorModal();
        await loadLatest();
        await loadData();
    });
}

// Initialiser l'application
window.addEventListener('DOMContentLoaded', () => {
    attachEventListeners();
    init();
});

// Gestion du clavier
window.addEventListener('keydown', (e) => {
    if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
        e.preventDefault();
        hideErrorModal();
        loadData();
    }
    // Fermer la modal avec Escape
    if (e.key === 'Escape') {
        hideErrorModal();
    }
});

// Gestion mobile
let touchStartY = 0;

window.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
}, { passive: true });

window.addEventListener('touchend', (e) => {
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchStartY - touchEndY;
    
    if (diff < -50 && window.scrollY === 0) {
        hideErrorModal();
        loadData();
    }
});

// Exposer les fonctions pour les boutons inline
window.selectPeriod = selectPeriod;
window.hideErrorModal = hideErrorModal;
window.switchView = switchView;
window.loadComparisonData = loadComparisonData;
