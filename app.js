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
    'id,date,temp_min,temp_avg,temp_max,rain_total,humidity_avg,pressure_avg,pressure_min,pressure_max,wind_gust_max,uv_index_max,reliability'
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
