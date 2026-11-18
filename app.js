// ============================================
// MyMeteo Mobile - Application JavaScript
// Architecture technique identique à MyMeteo
// Architecture logicielle adaptée au mobile
// ============================================

// ------------------------------------------------------------------
// Configuration Supabase (lecture seule, clé publiable)
// ------------------------------------------------------------------
const CFG = {
    url: "https://gvmogpbbcllkfqmryvwz.supabase.co",
    key: "sb_publishable_F4IH5ndz17UAPgHC7ihdRg_LiZikjIb",
    table: "MyMeteoData",
    indicatorsTable: "DailyIndicators",
    pageSize: 1000
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
    latestData: null,
    periodData: null,
    availableYears: [],
    isLoading: false
};

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

function showError(message) {
    document.getElementById('errorMessage').textContent = message;
    document.getElementById('errorModal').hidden = false;
    console.error('Erreur:', message);
}

// ------------------------------------------------------------------
// Appels API Supabase
// ------------------------------------------------------------------

async function fetchLatestRow() {
    const url = CFG.url + "/rest/v1/" + CFG.table +
        "?select=" + COLS + '&order="DateTime".desc&limit=1';
    
    try {
        const response = await fetch(url, {
            headers: {
                "apikey": CFG.key,
                "Authorization": "Bearer " + CFG.key
            }
        });
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP ${response.status}`);
        }
        
        const rows = await response.json();
        return rows.length ? rows[0] : null;
    } catch (err) {
        console.error('Erreur fetchLatestRow:', err);
        throw err;
    }
}

async function fetchRows(from, to = null) {
    let all = [];
    let offset = 0;
    
    const url = CFG.url + "/rest/v1/" + CFG.table +
        "?select=" + COLS +
        '&"DateTime"=gte.' + from +
        (to ? '&"DateTime"=lt.' + to : "") +
        '&order="DateTime".asc&limit=' + CFG.pageSize;
    
    try {
        const response = await fetch(url + "&offset=" + offset, {
            headers: {
                "apikey": CFG.key,
                "Authorization": "Bearer " + CFG.key
            }
        });
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP ${response.status}`);
        }
        
        const rows = await response.json();
        all = all.concat(rows);
        
        if (rows.length < CFG.pageSize) return all;
        
        offset += CFG.pageSize;
        // Pour le mobile, on limite à une seule page pour l'instant
        return all;
    } catch (err) {
        console.error('Erreur fetchRows:', err);
        throw err;
    }
}

async function fetchIndicators(from, to = null) {
    let all = [];
    let offset = 0;
    
    const url = CFG.url + "/rest/v1/" + CFG.indicatorsTable +
        "?select=" + IND_COLS +
        (from ? "&date=gte." + from : "") +
        (to ? "&date=lt." + to : "") +
        "&order=date.asc&limit=" + CFG.pageSize;
    
    try {
        const response = await fetch(url + "&offset=" + offset, {
            headers: {
                "apikey": CFG.key,
                "Authorization": "Bearer " + CFG.key
            }
        });
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP ${response.status}`);
        }
        
        const rows = await response.json();
        all = all.concat(rows);
        
        if (rows.length < CFG.pageSize) return all;
        
        offset += CFG.pageSize;
        // Pour le mobile, on limite à une seule page
        return all;
    } catch (err) {
        console.error('Erreur fetchIndicators:', err);
        throw err;
    }
}

async function fetchOneDateTime(order) {
    const url = CFG.url + "/rest/v1/" + CFG.table +
        "?select=" + encodeURIComponent('"DateTime"') +
        '&order="DateTime".' + order + "&limit=1";
    
    try {
        const response = await fetch(url, {
            headers: {
                "apikey": CFG.key,
                "Authorization": "Bearer " + CFG.key
            }
        });
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP ${response.status}`);
        }
        
        const rows = await response.json();
        return rows.length ? rows[0]["DateTime"] : null;
    } catch (err) {
        console.error('Erreur fetchOneDateTime:', err);
        throw err;
    }
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
    
    // Calculer les agrégats pour aujourd'hui
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
            lastRain = rain; // Dernière valeur de pluie horaire
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
}

function renderIndicatorsTable(data, period) {
    const container = document.getElementById('indicatorsTableBody');
    
    if (!data || data.length === 0) {
        container.innerHTML = '<p class="no-data">Aucune donnée disponible pour cette période</p>';
        return;
    }
    
    // Tri par date décroissante
    data.sort((a, b) => b.date.localeCompare(a.date));
    
    let rows = '';
    
    if (period === 'today') {
        // Pour aujourd'hui, on affiche les valeurs du jour
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
        // Pour les autres périodes, on affiche les données par jour
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
}

function renderYears(years) {
    const container = document.getElementById('yearsGrid');
    
    if (!years || years.length === 0) {
        container.innerHTML = '<p class="no-data">Aucune année disponible</p>';
        return;
    }
    
    // Filtrer pour exclure 2022
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
    
    // Mettre à jour les boutons
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.period === period) {
            btn.classList.add('active');
        }
    });
    
    // Masquer/afficher les sections
    document.getElementById('dataSection').hidden = false;
    document.getElementById('yearsSection').hidden = true;
    
    // Mettre à jour le titre
    const titles = {
        today: 'Aujourd\'hui',
        yesterday: 'Hier',
        '7days': '7 derniers jours',
        '30days': '30 derniers jours'
    };
    
    document.getElementById('periodTitle').textContent = titles[period] || period;
    document.getElementById('periodBadge').textContent = period === 'today' ? 'Données brutes' : 'Indicateurs journaliers';
    
    // Charger les données
    loadData();
}

function selectYear(year) {
    state.currentPeriod = 'year';
    state.selectedYear = year;
    
    // Mettre à jour les boutons
    document.querySelectorAll('.year-btn').forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.year) === year) {
            btn.classList.add('active');
        }
    });
    
    // Masquer/afficher les sections
    document.getElementById('dataSection').hidden = false;
    document.getElementById('yearsSection').hidden = true;
    
    // Mettre à jour le titre
    document.getElementById('periodTitle').textContent = `Année ${year}`;
    document.getElementById('periodBadge').textContent = 'Indicateurs annuels';
    
    // Charger les données
    loadData();
}

function showYears() {
    document.getElementById('dataSection').hidden = true;
    document.getElementById('yearsSection').hidden = false;
}

// ------------------------------------------------------------------
// Chargement des données
// ------------------------------------------------------------------

async function loadLatest() {
    try {
        const row = await fetchLatestRow();
        state.latestData = processLatestData(row);
        renderLatestData(state.latestData);
    } catch (err) {
        showError('Impossible de charger le dernier relevé : ' + err.message);
    }
}

async function loadAvailableYears() {
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
    }
}

async function loadPeriodData() {
    const period = state.currentPeriod;
    
    // Si on a sélectionné une année
    if (period === 'year' && state.selectedYear) {
        const range = getYearRange(state.selectedYear);
        const rows = await fetchIndicators(range.from, range.to);
        const data = processIndicatorsData(rows);
        const summary = aggregateIndicatorsData(data);
        
        state.periodData = data;
        state.periodSummary = summary;
        
        renderIndicatorsTable(data, period);
        renderSummary(summary, period);
        return;
    }
    
    const range = getPeriodRange(period);
    
    try {
        if (range.source === 'raw') {
            // Aujourd'hui : données brutes
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
            // Autres périodes : indicateurs journaliers
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
    
    try {
        // Charger les données selon la période
        if (state.currentPeriod === 'years') {
            showYears();
        } else {
            await loadPeriodData();
        }
        
        // Mettre à jour la date de dernière mise à jour
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
    try {
        // Charger les années disponibles
        await loadAvailableYears();
        
        // Charger le dernier relevé
        await loadLatest();
        
        // Charger les données de la période par défaut (aujourd'hui)
        state.currentPeriod = 'today';
        await loadData();
        
        // Sélectionner le bouton aujourd'hui
        document.querySelector('.period-btn[data-period="today"]').classList.add('active');
        
    } catch (err) {
        showError('Erreur d\'initialisation : ' + err.message);
    }
}

// Gestion du bouton années dans la barre de période
function handlePeriodButtonClick(period) {
    if (period === 'years') {
        showYears();
    } else {
        selectPeriod(period);
    }
}

// Attacher les gestionnaires d'événements
function attachEventListeners() {
    // Boutons de période
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const period = btn.dataset.period;
            handlePeriodButtonClick(period);
        });
    });
    
    // Bouton de rafraîchissement
    document.getElementById('refreshBtn').addEventListener('click', async () => {
        await loadLatest();
        await loadData();
    });
}

// Initialiser l'application
window.addEventListener('DOMContentLoaded', () => {
    attachEventListeners();
    init();
});

// Gestion du clavier pour les raccourcis
window.addEventListener('keydown', (e) => {
    // Rafraîchir avec F5 ou Ctrl+R
    if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
        e.preventDefault();
        loadData();
    }
});

// Optimisation pour mobile : toucher pour rafraîchir
let touchStartY = 0;

window.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
}, { passive: true });

window.addEventListener('touchend', (e) => {
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchStartY - touchEndY;
    
    // Swipe down pour rafraîchir
    if (diff < -50 && window.scrollY === 0) {
        loadData();
    }
});

// Exposer les fonctions pour les boutons inline
window.selectPeriod = selectPeriod;
window.selectYear = selectYear;
