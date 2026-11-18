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
    '"DateTime","Temperature","Humidity","Baro Pressure","Wind Gust","UVI","Hourly Rain","Solar Radiation"'
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
    availableYears: [],
    isLoading: false
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
    
    while (true) {
        const u = CFG.url + "/rest/v1/" + CFG.indicatorsTable +
            "?select=" + IND_COLS +
            (from ? "&date=gte." + from : "") +
            (to ? "&date=lt." + to : "") +
            "&order=date.asc&limit=" + CFG.page + "&offset=" + offset;
        
        const rows = await fetchJSON(u, 'fetchIndicators');
        all = all.concat(rows);
        
        if (rows.length < CFG.page) return all;
        offset += CFG.page;
    }
}

async function fetchOneDateTime(order) {
    const url = CFG.url + "/rest/v1/" + CFG.table +
        "?select=" + encodeURIComponent('"DateTime"') +
        '&order="DateTime".' + order + "&limit=1";
    
    const rows = await fetchJSON(url, 'fetchOneDateTime');
    return rows.length ? rows[0]["DateTime"] : null;
}

// ------------------------------------------------------------------
// Calcul des plages de dates
// ------------------------------------------------------------------

function getToday() {
    return isoDay(new Date());
}

function getYesterday() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return isoDay(d);
}

function getDateMinusDays(days) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - days);
    return isoDay(d);
}

function nextDay(iso) {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}

function getPeriodRange(period) {
    const today = getToday();
    
    switch (period) {
        case 'today':
            return { from: today, to: nextDay(today), source: 'raw' };
        case 'yesterday':
            return { from: getYesterday(), to: today, source: 'indicators' };
        case '7days':
            return { from: getDateMinusDays(6), to: today, source: 'indicators' };
        case '30days':
            return { from: getDateMinusDays(29), to: today, source: 'indicators' };
        default:
            return { from: today, to: nextDay(today), source: 'raw' };
    }
}

function getYearRange(year) {
    return { from: year + "-01-01", to: (year + 1) + "-01-01", source: 'indicators' };
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
        hourlyRain: row["Hourly Rain"]
    };
}

function processIndicatorsData(rows) {
    if (!rows || rows.length === 0) return [];
    
    return rows.map(row => ({
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
}

function processRawDataForToday(rows) {
    if (!rows || rows.length === 0) return null;
    
    let tempMin = Infinity;
    let tempMax = -Infinity;
    let tempSum = 0;
    let tempCount = 0;
    let rainTotal = 0;
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
            rainTotal += rain;
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
        rainTotal: rainTotal || null,
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
        if (row.temp_min !== null) tempMin = Math.min(tempMin, row.temp_min);
        if (row.temp_max !== null) tempMax = Math.max(tempMax, row.temp_max);
        if (row.temp_avg !== null) {
            tempSum += row.temp_avg;
            tempCount++;
        }
        if (row.rain_total !== null) rainTotal += row.rain_total;
        if (row.pressure_min !== null) pressureMin = Math.min(pressureMin, row.pressure_min);
        if (row.pressure_max !== null) pressureMax = Math.max(pressureMax, row.pressure_max);
        if (row.wind_gust_max !== null) windGustMax = Math.max(windGustMax, row.wind_gust_max);
        if (row.uv_index_max !== null) uvMax = Math.max(uvMax, row.uv_index_max);
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
        { label: 'Pluie (1h)', value: fmt(data.hourlyRain, 1) + ' mm' },
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
        container.innerHTML = '<p class="no-data">Aucun résumé disponible</p>';
        return;
    }
    
    const items = [
        { label: 'Temp. Min', value: fmt(summary.tempMin, 1) + '°C' },
        { label: 'Temp. Moy', value: fmt(summary.tempAvg, 1) + '°C' },
        { label: 'Temp. Max', value: fmt(summary.tempMax, 1) + '°C' },
        { label: 'Pluie Total', value: fmt(summary.rainTotal, 1) + ' mm' },
        { label: 'Pression Min', value: fmt(summary.pressureMin, 1) + ' hPa' },
        { label: 'Pression Max', value: fmt(summary.pressureMax, 1) + ' hPa' },
        { label: 'Rafale Max', value: fmt(summary.windGustMax, 1) + ' km/h' },
        { label: 'UV Max', value: fmt(summary.uvIndexMax, 1) }
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

function renderYears(years) {
    const container = document.getElementById('yearsGrid');
    
    if (!years || years.length === 0) {
        container.innerHTML = '<p class="no-data">Aucune année disponible</p>';
        return;
    }
    
    const filteredYears = years.filter(y => y !== 2022);
    
    container.innerHTML = filteredYears.map(year => `
        <button class="year-btn" data-year="${year}" onclick="selectYear(${year})">
            ${year}
        </button>
    `).join('');
}

// ------------------------------------------------------------------
// Gestion des périodes
// ------------------------------------------------------------------

function selectPeriod(period) {
    state.currentPeriod = period;
    
    // Masquer la modal d'erreur au changement de période
    hideErrorModal();
    
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.period === period) {
            btn.classList.add('active');
        }
    });
    
    document.getElementById('dataSection').hidden = false;
    document.getElementById('yearsSection').hidden = true;
    
    const titles = {
        today: 'Aujourd\'hui',
        yesterday: 'Hier',
        '7days': '7 derniers jours',
        '30days': '30 derniers jours'
    };
    
    document.getElementById('periodTitle').textContent = titles[period] || period;
    document.getElementById('periodBadge').textContent = period === 'today' ? 'Données brutes' : 'Indicateurs journaliers';
    
    loadData();
}

function selectYear(year) {
    state.currentPeriod = 'year';
    state.selectedYear = year;
    
    // Masquer la modal d'erreur
    hideErrorModal();
    
    document.querySelectorAll('.year-btn').forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.year) === year) {
            btn.classList.add('active');
        }
    });
    
    document.getElementById('dataSection').hidden = false;
    document.getElementById('yearsSection').hidden = true;
    
    document.getElementById('periodTitle').textContent = `Année ${year}`;
    document.getElementById('periodBadge').textContent = 'Indicateurs annuels';
    
    loadData();
}

function showYears() {
    // Masquer la modal d'erreur
    hideErrorModal();
    
    document.getElementById('dataSection').hidden = true;
    document.getElementById('yearsSection').hidden = false;
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

async function loadAvailableYears() {
    hideErrorModal();
    try {
        const [minDate, maxDate] = await Promise.all([
            fetchOneDateTime('asc'),
            fetchOneDateTime('desc')
        ]);
        
        if (!minDate || !maxDate) {
            state.availableYears = [];
            return;
        }
        
        const minYear = parseInt(minDate.slice(0, 4));
        const maxYear = parseInt(maxDate.slice(0, 4));
        
        state.availableYears = [];
        for (let y = minYear; y <= maxYear; y++) {
            state.availableYears.push(y);
        }
        
        renderYears(state.availableYears);
    } catch (err) {
        console.error('Erreur loadAvailableYears:', err);
        state.availableYears = [];
        showError('Impossible de déterminer les années disponibles : ' + err.message);
    }
}

async function loadPeriodData() {
    hideErrorModal();
    const period = state.currentPeriod;
    
    if (period === 'year' && state.selectedYear) {
        const range = getYearRange(state.selectedYear);
        try {
            const rows = await fetchIndicators(range.from, range.to);
            const data = processIndicatorsData(rows);
            const summary = aggregateIndicatorsData(data);
            
            state.periodData = data;
            state.periodSummary = summary;
            
            renderIndicatorsTable(data, period);
            renderSummary(summary, period);
        } catch (err) {
            showError('Impossible de charger les données pour cette période : ' + err.message);
        }
        return;
    }
    
    const range = getPeriodRange(period);
    
    try {
        if (range.source === 'raw') {
            const rows = await fetchRows(range.from, range.to);
            const data = processRawDataForToday(rows);
            
            if (data) {
                state.periodData = [data];
                state.periodSummary = data;
            } else {
                state.periodData = [];
                state.periodSummary = null;
            }
        } else {
            const rows = await fetchIndicators(range.from, range.to);
            const data = processIndicatorsData(rows);
            const summary = aggregateIndicatorsData(data);
            
            state.periodData = data;
            state.periodSummary = summary;
        }
        
        renderIndicatorsTable(state.periodData, period);
        renderSummary(state.periodSummary, period);
        
    } catch (err) {
        showError('Impossible de charger les données pour cette période : ' + err.message);
    }
}

async function loadData() {
    if (state.isLoading) return;
    
    showLoading();
    hideErrorModal(); // Masquer la modal au début du chargement
    
    try {
        if (state.currentPeriod === 'years') {
            showYears();
        } else {
            await loadPeriodData();
        }
        
        const now = new Date();
        document.getElementById('lastUpdate').textContent = `Mise à jour : ${frDateTime(now.toISOString())}`;
        
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
        await loadAvailableYears();
        await loadLatest();
        
        state.currentPeriod = 'today';
        await loadData();
        
        document.querySelector('.period-btn[data-period="today"]').classList.add('active');
        
    } catch (err) {
        showError('Erreur d\'initialisation : ' + err.message);
    }
}

function handlePeriodButtonClick(period) {
    if (period === 'years') {
        showYears();
    } else {
        selectPeriod(period);
    }
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
window.selectYear = selectYear;
window.hideErrorModal = hideErrorModal;
