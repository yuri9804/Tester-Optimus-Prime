// Multi-Timeframe Trading Indicator Tester with Google Sheets Export
class MultiTimeframeTradingTester {
    constructor() {
        /* Config */
        this.stopLossLevels = [30, 50, 75, 100];
        this.riskRewardRatios = ['1:1', '1:2', '1:3', '1:4', '1:5'];
        this.rrValues = { 
            '1:1': 1, 
            '1:2': 2, 
            '1:3': 3, 
            '1:4': 4,
            '1:5': 5
        };
        
        this.timeframes = [
            { code: 'M1', name: '1 Minuto', color: '#FF6B6B' },
            { code: 'M3', name: '3 Minuti', color: '#4ECDC4' },
            { code: 'M5', name: '5 Minuti', color: '#45B7D1' },
            { code: 'M15', name: '15 Minuti', color: '#96CEB4' },
            { code: 'M30', name: '30 Minuti', color: '#FF8C00' },
            { code: 'H1', name: '1 Ora', color: '#FFEAA7' },
            { code: 'H4', name: '4 Ore', color: '#DDA0DD' }
        ];
        
        this.defaultTimeframeData = {
            trades: [],
            statistics: {},
            percentages: {},
            lastModified: null
        };
        
        /* State */
        this.db = null;
        this.data = {};
        this.currentTimeframe = 'M1';
        this.googleSheetsReady = false;
        
        /* Bootstrap */
        this.initDatabase();
    }
    
    /* ----------------- IndexedDB ----------------- */
    initDatabase() {
        const request = indexedDB.open('tradingTesterDB', 2);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('timeframes')) {
                db.createObjectStore('timeframes', { keyPath: 'timeframe' });
            }
        };
        
        request.onsuccess = (event) => {
            this.db = event.target.result;
            this.loadAllTimeframes();
        };
        
        request.onerror = () => {
            console.error('Impossibile inizializzare il database IndexedDB');
            this.timeframes.forEach(tf => {
                this.data[tf.code] = JSON.parse(JSON.stringify(this.defaultTimeframeData));
            });
            this.afterDataReady();
        };
    }
    
    loadAllTimeframes() {
        let loaded = 0;
        const total = this.timeframes.length;
        
        this.timeframes.forEach(tf => {
            const transaction = this.db.transaction(['timeframes'], 'readonly');
            const store = transaction.objectStore('timeframes');
            const getRequest = store.get(tf.code);
            
            getRequest.onsuccess = (event) => {
                const result = event.target.result;
                if (result) {
                    this.data[tf.code] = result;
                    if (!this.data[tf.code].percentages) {
                        this.data[tf.code].percentages = {};
                    }
                } else {
                    this.data[tf.code] = JSON.parse(JSON.stringify(this.defaultTimeframeData));
                }
                
                loaded++;
                if (loaded === total) {
                    this.afterDataReady();
                }
            };
            
            getRequest.onerror = () => {
                console.error('Errore caricamento timeframe', tf.code);
                this.data[tf.code] = JSON.parse(JSON.stringify(this.defaultTimeframeData));
                loaded++;
                if (loaded === total) {
                    this.afterDataReady();
                }
            };
        });
    }
    
    saveTimeframeData(timeframe) {
        if (!this.db) return;
        
        const dataToSave = { ...this.data[timeframe], timeframe };
        const transaction = this.db.transaction(['timeframes'], 'readwrite');
        const store = transaction.objectStore('timeframes');
        store.put(dataToSave);
    }
    
    /* ----------------- UI Bootstrap ----------------- */
    afterDataReady() {
        this.initializeEventListeners();
        this.switchTimeframe(this.currentTimeframe);
        setInterval(() => this.autoBackup(), 30 * 60 * 1000);
    }
    
    initializeEventListeners() {
        // Event listeners esistenti
        document.querySelectorAll('.timeframe-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                const tf = btn.dataset.timeframe;
                this.switchTimeframe(tf);
            });
        });
        
        document.getElementById('addRowBtn').addEventListener('click', () => this.addRow());
        document.getElementById('clearCurrentBtn').addEventListener('click', () => this.clearCurrent());
        document.getElementById('resetAllBtn').addEventListener('click', () => this.resetAll());
        document.getElementById('exportAllBtn').addEventListener('click', () => this.exportAll());
        document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFileInput').click());
        document.getElementById('importFileInput').addEventListener('change', (e) => this.handleImport(e));
        
        // Nuovi event listeners per Google Sheets
        document.getElementById('exportGoogleBtn').addEventListener('click', () => this.exportToGoogleSheets());
        document.getElementById('exportCSVBtn').addEventListener('click', () => this.downloadCSV());
        document.getElementById('exportAllCSVBtn').addEventListener('click', () => this.downloadAllCSV());
        document.getElementById('authGoogleBtn').addEventListener('click', () => this.authenticateGoogle());
        
        // Inizializza Google Sheets API
        this.initGoogleSheetsAPI();
        
        // Event listeners per tastiera
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
                e.preventDefault();
                this.addRow();
            }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toUpperCase() === 'C') {
                e.preventDefault();
                this.clearCurrent();
            }
        });
    }
    
    /* ----------------- Google Sheets API ----------------- */
    initGoogleSheetsAPI() {
        // Carica l'API Google Sheets
        const script = document.createElement('script');
        script.src = 'https://apis.google.com/js/api.js';
        script.onload = () => {
            if (typeof gapi !== 'undefined') {
                gapi.load('client:auth2', () => this.initGoogleAuth());
            }
        };
        script.onerror = () => {
            console.error('Impossibile caricare Google APIs');
            this.updateAuthStatus('Errore caricamento API');
        };
        document.head.appendChild(script);
    }
    
    initGoogleAuth() {
        // IMPORTANTE: Sostituisci con le tue credenziali
        const API_KEY = 'YOUR_API_KEY_HERE';
        const CLIENT_ID = '288695427040-iq3oh1kgs2uqbafpq6pgbude5eii5d8o.apps.googleusercontent.com';
        
        gapi.client.init({
            apiKey: API_KEY,
            clientId: CLIENT_ID,
            discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
            scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file'
        }).then(() => {
            this.googleSheetsReady = true;
            this.updateAuthStatus('Pronto');
            console.log('Google Sheets API inizializzato');
        }).catch(error => {
            console.error('Errore inizializzazione Google Auth:', error);
            this.updateAuthStatus('Errore configurazione');
        });
    }
    
    updateAuthStatus(status) {
        const authStatusElement = document.getElementById('authStatus');
        if (authStatusElement) {
            authStatusElement.textContent = status;
        }
    }
    
    async authenticateGoogle() {
        if (!this.googleSheetsReady) {
            this.showNotification('Google Sheets API non ancora pronto. Riprova tra qualche secondo.', 'warning');
            return;
        }
        
        try {
            const authInstance = gapi.auth2.getAuthInstance();
            if (!authInstance.isSignedIn.get()) {
                await authInstance.signIn();
            }
            
            this.updateAuthStatus('Autenticato ✅');
            document.getElementById('authGoogleBtn').style.display = 'none';
            this.showNotification('Autenticazione Google completata!', 'success');
            
        } catch (error) {
            console.error('Errore autenticazione:', error);
            this.showNotification('Errore durante l\'autenticazione Google', 'error');
        }
    }
    
    /* ----------------- Export Functions ----------------- */
    exportToCSV(timeframe = null) {
        const tfToExport = timeframe || this.currentTimeframe;
        const trades = this.data[tfToExport].trades;
        
        // Ordina i trade per data e orario
        const sortedTrades = trades.slice().sort((a, b) => {
            const dateA = new Date(`${a.date} ${a.time}`);
            const dateB = new Date(`${b.date} ${b.time}`);
            return dateA - dateB;
        });
        
        // Crea l'header CSV
        let csvContent = 'Data,Orario,Prezzo Entrata,';
        
        // Aggiungi header per ogni combinazione SL/RR
        this.stopLossLevels.forEach(sl => {
            this.riskRewardRatios.forEach(rr => {
                csvContent += `SL${sl}-RR${rr},`;
            });
        });
        
        // Aggiungi header per statistiche
        csvContent += 'Risultato Migliore,Percentuale Migliore,Note\n';
        
        // Aggiungi i dati
        sortedTrades.forEach(trade => {
            const date = trade.date || '';
            const time = trade.time || '';
            const price = trade.entryPrice || '';
            
            csvContent += `${date},${time},${price},`;
            
            // Aggiungi risultati per ogni combinazione
            this.stopLossLevels.forEach(sl => {
                this.riskRewardRatios.forEach(rr => {
                    const result = trade.results[sl][rr];
                    const resultText = result === 'tp' ? 'TP' : result === 'sl' ? 'SL' : '';
                    csvContent += `${resultText},`;
                });
            });
            
            // Calcola il risultato migliore
            const bestResult = this.calculateBestResult(trade);
            csvContent += `${bestResult.combination},${bestResult.percentage},\n`;
        });
        
        return csvContent;
    }
    
    calculateBestResult(trade) {
        let bestPercentage = -Infinity;
        let bestCombination = '';
        
        this.stopLossLevels.forEach(sl => {
            this.riskRewardRatios.forEach(rr => {
                const result = trade.results[sl][rr];
                if (result === 'tp') {
                    const percentage = this.rrValues[rr];
                    if (percentage > bestPercentage) {
                        bestPercentage = percentage;
                        bestCombination = `SL${sl}-RR${rr}`;
                    }
                }
            });
        });
        
        return {
            combination: bestCombination,
            percentage: bestPercentage > -Infinity ? `+${bestPercentage}%` : '0%'
        };
    }
    
    async exportToGoogleSheets() {
        if (!this.googleSheetsReady) {
            this.showNotification('Google Sheets API non ancora pronto', 'error');
            return;
        }
        
        try {
            // Verifica autenticazione
            const authInstance = gapi.auth2.getAuthInstance();
            if (!authInstance.isSignedIn.get()) {
                await authInstance.signIn();
            }
            
            const spreadsheetId = await this.createOrUpdateSpreadsheet();
            const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
            
            // Crea link cliccabile nella notifica
            const notification = document.createElement('div');
            notification.className = 'notification-area success';
            notification.innerHTML = `Dati esportati in Google Sheets! <a href="${url}" target="_blank" style="color: white; text-decoration: underline;">Apri qui</a>`;
            
            const container = document.querySelector('.container');
            container.insertBefore(notification, container.firstChild);
            
            setTimeout(() => {
                notification.remove();
            }, 10000);
            
            // Copia URL negli appunti
            if (navigator.clipboard) {
                navigator.clipboard.writeText(url);
                console.log('URL copiato negli appunti');
            }
            
        } catch (error) {
            console.error('Errore esportazione Google Sheets:', error);
            this.showNotification('Errore durante l\'esportazione in Google Sheets: ' + error.message, 'error');
        }
    }
    
    async createOrUpdateSpreadsheet() {
        const spreadsheetTitle = `Trading Data - ${new Date().toLocaleDateString()}`;
        
        // Crea un nuovo foglio di calcolo
        const createResponse = await gapi.client.sheets.spreadsheets.create({
            properties: {
                title: spreadsheetTitle
            }
        });
        
        const spreadsheetId = createResponse.result.spreadsheetId;
        
        // Prepara i dati per tutti i timeframe
        const allSheetsData = [];
        
        this.timeframes.forEach(tf => {
            const trades = this.data[tf.code].trades;
            const sortedTrades = trades.slice().sort((a, b) => {
                const dateA = new Date(`${a.date} ${a.time}`);
                const dateB = new Date(`${b.date} ${b.time}`);
                return dateA - dateB;
            });
            
            // Crea header
            const headers = ['Data', 'Orario', 'Prezzo Entrata'];
            this.stopLossLevels.forEach(sl => {
                this.riskRewardRatios.forEach(rr => {
                    headers.push(`SL${sl}-RR${rr}`);
                });
            });
            headers.push('Risultato Migliore', 'Percentuale Migliore', 'Note');
            
            // Crea righe dati
            const rows = [headers];
            sortedTrades.forEach(trade => {
                const row = [
                    trade.date || '',
                    trade.time || '',
                    trade.entryPrice || ''
                ];
                
                this.stopLossLevels.forEach(sl => {
                    this.riskRewardRatios.forEach(rr => {
                        const result = trade.results[sl][rr];
                        row.push(result === 'tp' ? 'TP' : result === 'sl' ? 'SL' : '');
                    });
                });
                
                const bestResult = this.calculateBestResult(trade);
                row.push(bestResult.combination, bestResult.percentage, '');
                
                rows.push(row);
            });
            
            allSheetsData.push({
                sheetName: `${tf.code} - ${tf.name}`,
                data: rows
            });
        });
        
        // Crea fogli per ogni timeframe
        const requests = [];
        
        allSheetsData.forEach((sheetData, index) => {
            if (index > 0) { // Il primo foglio esiste già
                requests.push({
                    addSheet: {
                        properties: {
                            title: sheetData.sheetName
                        }
                    }
                });
            }
        });
        
        // Esegui le richieste per creare i fogli
        if (requests.length > 0) {
            await gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId: spreadsheetId,
                requests: requests
            });
        }
        
        // Rinomina il primo foglio
        await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetId,
            requests: [{
                updateSheetProperties: {
                    properties: {
                        sheetId: 0,
                        title: allSheetsData[0].sheetName
                    },
                    fields: 'title'
                }
            }]
        });
        
        // Popola i dati in ogni foglio
        for (let i = 0; i < allSheetsData.length; i++) {
            const sheetData = allSheetsData[i];
            
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: spreadsheetId,
                range: `${sheetData.sheetName}!A1`,
                valueInputOption: 'USER_ENTERED',
                values: sheetData.data
            });
            
            // Applica formattazione
            await this.formatGoogleSheet(spreadsheetId, i, sheetData.data.length);
        }
        
        // Rendi il foglio condivisibile
        await this.makeSheetShareable(spreadsheetId);
        
        return spreadsheetId;
    }
    
    async formatGoogleSheet(spreadsheetId, sheetId, rowCount) {
        const requests = [
            // Formatta header
            {
                repeatCell: {
                    range: {
                        sheetId: sheetId,
                        startRowIndex: 0,
                        endRowIndex: 1
                    },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: {
                                red: 0.2,
                                green: 0.5,
                                blue: 0.55
                            },
                            textFormat: {
                                foregroundColor: {
                                    red: 1,
                                    green: 1,
                                    blue: 1
                                },
                                bold: true
                            }
                        }
                    },
                    fields: 'userEnteredFormat(backgroundColor,textFormat)'
                }
            },
            // Congela la prima riga
            {
                updateSheetProperties: {
                    properties: {
                        sheetId: sheetId,
                        gridProperties: {
                            frozenRowCount: 1
                        }
                    },
                    fields: 'gridProperties.frozenRowCount'
                }
            },
            // Formatta le colonne data/orario
            {
                repeatCell: {
                    range: {
                        sheetId: sheetId,
                        startColumnIndex: 0,
                        endColumnIndex: 2,
                        startRowIndex: 1,
                        endRowIndex: rowCount
                    },
                    cell: {
                        userEnteredFormat: {
                            horizontalAlignment: 'CENTER',
                            textFormat: {
                                bold: true
                            }
                        }
                    },
                    fields: 'userEnteredFormat(horizontalAlignment,textFormat)'
                }
            }
        ];
        
        await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetId,
            requests: requests
        });
    }
    
    async makeSheetShareable(spreadsheetId) {
        try {
            await gapi.client.request({
                path: `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`,
                method: 'POST',
                body: {
                    role: 'reader',
                    type: 'anyone'
                }
            });
        } catch (error) {
            console.log('Impossibile rendere il foglio pubblico:', error);
        }
    }
    
    downloadCSV(timeframe = null) {
        const tfToExport = timeframe || this.currentTimeframe;
        const csvContent = this.exportToCSV(tfToExport);
        const tfInfo = this.timeframes.find(t => t.code === tfToExport);
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `trading_data_${tfToExport}_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        
        URL.revokeObjectURL(url);
        this.showNotification(`File CSV ${tfInfo.name} scaricato!`, 'success');
    }
    
    downloadAllCSV() {
        this.timeframes.forEach((tf, index) => {
            setTimeout(() => {
                this.downloadCSV(tf.code);
            }, 100 * index);
        });
    }
    
    /* ----------------- Timeframe Handling ----------------- */
    switchTimeframe(tfCode) {
        this.currentTimeframe = tfCode;
        
        document.querySelectorAll('.timeframe-tab').forEach(btn => {
            if (btn.dataset.timeframe === tfCode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        const tfInfo = this.timeframes.find(t => t.code === tfCode);
        document.getElementById('currentTimeframeDisplay').textContent = `${tfInfo.code} - ${tfInfo.name}`;
        document.getElementById('statsTimeframeLabel').textContent = `${tfInfo.code} - ${tfInfo.name}`;
        
        this.renderTable();
        this.updateStatistics();
        this.updatePercentages();
    }
    
    /* ----------------- Table Operations ----------------- */
    addRow() {
        const tradeId = Date.now();
        const newTrade = {
            id: tradeId,
            date: '',
            time: '',
            entryPrice: '',
            results: {}
        };
        
        this.stopLossLevels.forEach(sl => {
            newTrade.results[sl] = {};
            this.riskRewardRatios.forEach(rr => {
                newTrade.results[sl][rr] = 'empty';
            });
        });
        
        this.data[this.currentTimeframe].trades.push(newTrade);
        this.data[this.currentTimeframe].lastModified = new Date().toISOString();
        
        this.saveTimeframeData(this.currentTimeframe);
        this.renderTable();
        this.updateStatistics();
        this.updatePercentages();
    }
    
    removeRow(tradeId) {
        const tfData = this.data[this.currentTimeframe];
        tfData.trades = tfData.trades.filter(t => t.id !== tradeId);
        tfData.lastModified = new Date().toISOString();
        
        this.saveTimeframeData(this.currentTimeframe);
        this.renderTable();
        this.updateStatistics();
        this.updatePercentages();
    }
    
    updateTradeData(tradeId, field, value) {
        const trade = this.data[this.currentTimeframe].trades.find(t => t.id === tradeId);
        if (trade) {
            trade[field] = value;
            this.data[this.currentTimeframe].lastModified = new Date().toISOString();
            this.saveTimeframeData(this.currentTimeframe);
            this.updateStatistics();
        }
    }
    
    toggleTradeResult(tradeId, stopLoss, riskReward) {
        const trade = this.data[this.currentTimeframe].trades.find(t => t.id === tradeId);
        if (!trade) return;
        
        const current = trade.results[stopLoss][riskReward];
        let next = 'empty';
        if (current === 'empty') next = 'tp';
        else if (current === 'tp') next = 'sl';
        
        trade.results[stopLoss][riskReward] = next;
        this.data[this.currentTimeframe].lastModified = new Date().toISOString();
        
        this.saveTimeframeData(this.currentTimeframe);
        this.renderTable();
        this.updateStatistics();
        this.updatePercentages();
    }
    
    renderTable() {
        const tbody = document.getElementById('tableBody');
        const trades = this.data[this.currentTimeframe].trades;
        
        if (trades.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="${3 + this.stopLossLevels.length * this.riskRewardRatios.length}" class="empty-state">
                        <div class="empty-state-icon">📊</div>
                        Nessun trade inserito. Clicca "Aggiungi Riga" per iniziare.
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = trades.map(trade => {
            const resultCells = this.stopLossLevels.map(sl => {
                const slResults = this.riskRewardRatios.map(rr => {
                    const status = trade.results[sl][rr];
                    return `<td><span class="trade-result ${status}" onclick="app.toggleTradeResult(${trade.id}, ${sl}, '${rr}')"></span></td>`;
                }).join('');
                return slResults;
            }).join('');
            
            return `
                <tr>
                    <td>
                        <div class="datetime-inputs">
                            <input type="date" class="date-input" value="${trade.date}" onchange="app.updateTradeData(${trade.id}, 'date', this.value)">
                            <input type="time" class="time-input" value="${trade.time}" onchange="app.updateTradeData(${trade.id}, 'time', this.value)">
                        </div>
                    </td>
                    <td>
                        <input type="text" class="price-input" value="${trade.entryPrice}" placeholder="Prezzo" onchange="app.updateTradeData(${trade.id}, 'entryPrice', this.value)">
                    </td>
                    ${resultCells}
                    <td>
                        <button class="btn btn--outline btn--sm btn--danger" onclick="app.removeRow(${trade.id})">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');
    }
    
    /* ----------------- Statistics ----------------- */
    updateStatistics() {
        const trades = this.data[this.currentTimeframe].trades;
        const stats = {};
        
        this.stopLossLevels.forEach(sl => {
            stats[sl] = {};
            this.riskRewardRatios.forEach(rr => {
                const results = trades.map(t => t.results[sl][rr]).filter(r => r !== 'empty');
                const tpCount = results.filter(r => r === 'tp').length;
                const slCount = results.filter(r => r === 'sl').length;
                const total = results.length;
                
                stats[sl][rr] = {
                    tp: tpCount,
                    sl: slCount,
                    total: total,
                    winRate: total > 0 ? (tpCount / total * 100).toFixed(1) : '0.0'
                };
            });
        });
        
        this.data[this.currentTimeframe].statistics = stats;
        this.renderStatistics();
    }
    
    updatePercentages() {
        const trades = this.data[this.currentTimeframe].trades;
        const percentages = {};
        
        this.stopLossLevels.forEach(sl => {
            percentages[sl] = {};
            this.riskRewardRatios.forEach(rr => {
                const results = trades.map(t => t.results[sl][rr]).filter(r => r !== 'empty');
                const tpCount = results.filter(r => r === 'tp').length;
                const slCount = results.filter(r => r === 'sl').length;
                
                const rrValue = this.rrValues[rr];
                const tpGain = tpCount * rrValue;
                const slLoss = slCount * 1;
                const totalPercentage = tpGain - slLoss;
                
                percentages[sl][rr] = {
                    value: totalPercentage,
                    formatted: totalPercentage > 0 ? `+${totalPercentage}%` : `${totalPercentage}%`
                };
            });
        });
        
        this.data[this.currentTimeframe].percentages = percentages;
        this.renderPercentages();
    }
    
    renderStatistics() {
        const container = document.getElementById('statisticsContainer');
        const stats = this.data[this.currentTimeframe].statistics;
        
        const statsHtml = this.stopLossLevels.map(sl => {
            const slStats = this.riskRewardRatios.map(rr => {
                const stat = stats[sl][rr];
                const winRateClass = parseFloat(stat.winRate) >= 60 ? 'positive-stat' : 
                                   parseFloat(stat.winRate) >= 40 ? '' : 'negative-stat';
                
                return `
                    <div class="stat-row">
                        <span>RR ${rr}:</span>
                        <span class="${winRateClass}">${stat.tp}/${stat.total} (${stat.winRate}%)</span>
                    </div>
                `;
            }).join('');
            
            return `
                <div class="stat-card">
                    <h4>Stop Loss ${sl} Pips</h4>
                    ${slStats}
                </div>
            `;
        }).join('');
        
        container.innerHTML = statsHtml;
    }
    
    renderPercentages() {
        const percentages = this.data[this.currentTimeframe].percentages;
        
        this.stopLossLevels.forEach(sl => {
            this.riskRewardRatios.forEach(rr => {
                const cellId = `percentage-${sl}-${rr.replace(':', '')}`;
                const cell = document.getElementById(cellId);
                if (cell) {
                    const percentage = percentages[sl][rr];
                    cell.textContent = percentage.formatted;
                    cell.className = 'percentage-header';
                    
                    if (percentage.value > 0) {
                        cell.classList.add('percentage-positive');
                    } else if (percentage.value < 0) {
                        cell.classList.add('percentage-negative');
                    }
                }
            });
        });
    }
    
    /* ----------------- Data Management ----------------- */
    clearCurrent() {
        if (confirm('Sei sicuro di voler cancellare tutti i trade del timeframe corrente?')) {
            this.data[this.currentTimeframe].trades = [];
            this.data[this.currentTimeframe].lastModified = new Date().toISOString();
            this.saveTimeframeData(this.currentTimeframe);
            this.renderTable();
            this.updateStatistics();
            this.updatePercentages();
            this.showNotification('Timeframe corrente pulito con successo!', 'success');
        }
    }
    
    resetAll() {
        if (confirm('Sei sicuro di voler resettare TUTTI i dati di TUTTI i timeframe? Questa azione non può essere annullata!')) {
            this.timeframes.forEach(tf => {
                this.data[tf.code] = JSON.parse(JSON.stringify(this.defaultTimeframeData));
                this.saveTimeframeData(tf.code);
            });
            this.renderTable();
            this.updateStatistics();
            this.updatePercentages();
            this.showNotification('Tutti i dati sono stati resettati!', 'warning');
        }
    }
    
    exportAll() {
        const exportData = {
            version: '2.0',
            timestamp: new Date().toISOString(),
            timeframes: this.data
        };
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `trading_data_all_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        this.showNotification('Dati esportati con successo!', 'success');
    }
    
    handleImport(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importData = JSON.parse(e.target.result);
                
                if (importData.timeframes) {
                    Object.keys(importData.timeframes).forEach(tfCode => {
                        if (this.data[tfCode]) {
                            this.data[tfCode] = importData.timeframes[tfCode];
                            this.saveTimeframeData(tfCode);
                        }
                    });
                    this.showNotification('Tutti i dati importati con successo!', 'success');
                } else if (importData.timeframe && importData.data) {
                    if (this.data[importData.timeframe]) {
                        this.data[importData.timeframe] = importData.data;
                        this.saveTimeframeData(importData.timeframe);
                        this.showNotification(`Dati ${importData.timeframe} importati con successo!`, 'success');
                    }
                }
                
                this.renderTable();
                this.updateStatistics();
                this.updatePercentages();
                
            } catch (error) {
                console.error('Errore durante l\'importazione:', error);
                this.showNotification('Errore durante l\'importazione del file!', 'error');
            }
        };
        
        reader.readAsText(file);
        event.target.value = '';
    }
    
    autoBackup() {
        const backupData = {
            version: '2.0',
            timestamp: new Date().toISOString(),
            timeframes: this.data,
            type: 'auto-backup'
        };
        
        try {
            localStorage.setItem('tradingTesterBackup', JSON.stringify(backupData));
            console.log('Backup automatico completato');
        } catch (error) {
            console.error('Errore durante il backup automatico:', error);
        }
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification-area ${type}`;
        notification.innerHTML = message;
        
        const container = document.querySelector('.container');
        container.insertBefore(notification, container.firstChild);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
}

// Initialize the app
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new MultiTimeframeTradingTester();
});
