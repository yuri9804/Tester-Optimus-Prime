// Multi-Timeframe Trading Indicator Tester with Time and Percentage Features – JavaScript

class MultiTimeframeTradingTester {
    constructor() {
        /* Config */
        this.stopLossLevels = [30, 50, 75, 100];
        this.riskRewardRatios = ['1:1', '1:2', '1:3', '1:4'];
        this.rrValues = { '1:1': 1, '1:2': 2, '1:3': 3, '1:4': 4 }; // For percentage calculations
        this.timeframes = [
            { code: 'M1', name: '1 Minuto', color: '#FF6B6B' },
            { code: 'M3', name: '3 Minuti', color: '#4ECDC4' },
            { code: 'M5', name: '5 Minuti', color: '#45B7D1' },
            { code: 'M15', name: '15 Minuti', color: '#96CEB4' },
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
        this.db = null; // IndexedDB instance
        this.data = {}; // { timeframeCode: {...defaultTimeframeData} }
        this.currentTimeframe = 'M1';

        /* Bootstrap */
        this.initDatabase();
    }

    /* ----------------- IndexedDB ----------------- */
    initDatabase() {
        const request = indexedDB.open('tradingTesterDB', 2); // Increment version for schema change

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
            // Fallback in-memory
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
                    // Ensure percentages object exists
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
        // Default timeframe
        this.switchTimeframe(this.currentTimeframe);
        // Automatic backup every 30 minutes
        setInterval(() => this.autoBackup(), 30 * 60 * 1000);
    }

    initializeEventListeners() {
        // Timeframe tab clicks
        document.querySelectorAll('.timeframe-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                const tf = btn.dataset.timeframe;
                this.switchTimeframe(tf);
            });
        });

        // Control buttons
        document.getElementById('addRowBtn').addEventListener('click', () => this.addRow());
        document.getElementById('clearCurrentBtn').addEventListener('click', () => this.clearCurrent());
        document.getElementById('resetAllBtn').addEventListener('click', () => this.resetAll());
        document.getElementById('exportAllBtn').addEventListener('click', () => this.exportAll());
        document.getElementById('exportCurrentBtn').addEventListener('click', () => this.exportCurrent());
        document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFileInput').click());
        document.getElementById('importFileInput').addEventListener('change', (e) => this.handleImport(e));

        // Shortcuts
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

    /* ----------------- Timeframe Handling ----------------- */
    switchTimeframe(tfCode) {
        this.currentTimeframe = tfCode;
        // Update active tab
        document.querySelectorAll('.timeframe-tab').forEach(btn => {
            if (btn.dataset.timeframe === tfCode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update labels
        const tfInfo = this.timeframes.find(t => t.code === tfCode);
        document.getElementById('currentTimeframeDisplay').textContent = `${tfInfo.code} - ${tfInfo.name}`;
        document.getElementById('statsTimeframeLabel').textContent = `${tfInfo.code} - ${tfInfo.name}`;

        // Render table & stats
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
            time: '', // NEW: Time field
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
            // No need to update percentages for data-only changes
        }
    }

    toggleTradeResult(tradeId, stopLoss, riskReward) {
        const trade = this.data[this.currentTimeframe].trades.find(t => t.id === tradeId);
        if (!trade) return;

        const current = trade.results[stopLoss][riskReward];
        let next = 'empty';
        if (current === 'empty') next = 'tp';
        else if (current === 'tp') next = 'sl';
        // else remains empty

        trade.results[stopLoss][riskReward] = next;
        this.data[this.currentTimeframe].lastModified = new Date().toISOString();
        this.saveTimeframeData(this.currentTimeframe);
        this.renderTable();
        this.updateStatistics();
        this.updatePercentages(); // UPDATE: Recalculate percentages when results change
    }

    renderTable() {
        const tbody = document.getElementById('tableBody');
        const trades = this.data[this.currentTimeframe].trades;

        if (trades.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="19" class="empty-state">
                        <div class="empty-state-icon">📊</div>
                        <p>Nessun trade inserito. Clicca "Aggiungi Riga" per iniziare.</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = trades.map(trade => this.renderRow(trade)).join('');
    }

    renderRow(trade) {
        return `
            <tr>
                <td>
                    <div class="datetime-inputs">
                        <input type="date" class="date-input" value="${trade.date}" onchange="app.updateTradeData(${trade.id}, 'date', this.value)">
                        <input type="time" class="time-input" value="${trade.time}" onchange="app.updateTradeData(${trade.id}, 'time', this.value)">
                    </div>
                </td>
                <td>
                    <input type="number" class="price-input" step="0.0001" placeholder="0.0000" value="${trade.entryPrice}" onchange="app.updateTradeData(${trade.id}, 'entryPrice', this.value)">
                </td>
                ${this.renderTradeResultCells(trade)}
                <td>
                    <button class="btn btn--sm btn--outline" title="Rimuovi riga" onclick="app.removeRow(${trade.id})">✕</button>
                </td>
            </tr>
        `;
    }

    renderTradeResultCells(trade) {
        let cells = '';
        this.stopLossLevels.forEach(sl => {
            this.riskRewardRatios.forEach(rr => {
                const res = trade.results[sl][rr];
                const cls = res === 'empty' ? '' : res;
                cells += `
                    <td>
                        <div class="trade-result ${cls}" onclick="app.toggleTradeResult(${trade.id}, ${sl}, '${rr}')" title="Clicca per cambiare: Vuoto → TP (Verde) → SL (Rosso) → Vuoto"></div>
                    </td>
                `;
            });
        });
        return cells;
    }

    /* ----------------- NEW: Percentage Calculations ----------------- */
    calculateColumnPercentages() {
        const trades = this.data[this.currentTimeframe].trades;
        const percentages = {};

        this.stopLossLevels.forEach(sl => {
            percentages[sl] = {};
            this.riskRewardRatios.forEach(rr => {
                let tpCount = 0;
                let slCount = 0;
                
                trades.forEach(trade => {
                    const result = trade.results[sl][rr];
                    if (result === 'tp') tpCount++;
                    else if (result === 'sl') slCount++;
                });

                // Calculate gain: (TP × RR%) - (SL × 1%)
                const rrValue = this.rrValues[rr];
                const gain = (tpCount * rrValue) - (slCount * 1);
                percentages[sl][rr] = gain;
            });
        });

        return percentages;
    }

    updatePercentages() {
        const percentages = this.calculateColumnPercentages();
        
        this.stopLossLevels.forEach(sl => {
            this.riskRewardRatios.forEach((rr, index) => {
                const rrIndex = index + 1; // 1-based for element IDs
                const elementId = `perc-${sl}-${rrIndex}`;
                const element = document.getElementById(elementId);
                
                if (element) {
                    const gain = percentages[sl][rr];
                    let displayText;
                    
                    if (gain > 0) {
                        displayText = `+${gain.toFixed(1)}%`;
                        element.className = 'percentage-header percentage-positive';
                    } else if (gain < 0) {
                        displayText = `${gain.toFixed(1)}%`;
                        element.className = 'percentage-header percentage-negative';
                    } else {
                        displayText = '0%';
                        element.className = 'percentage-header';
                    }
                    
                    element.textContent = displayText;
                }
            });
        });

        // Save percentages to data store
        this.data[this.currentTimeframe].percentages = percentages;
        this.saveTimeframeData(this.currentTimeframe);
    }

    /* ----------------- Statistics ----------------- */
    calculateStatistics(trades) {
        const stats = {};
        this.stopLossLevels.forEach(sl => {
            stats[sl] = {
                totalTrades: 0,
                winRate: 0,
                bestRR: 'N/A',
                rrStats: {}
            };
            this.riskRewardRatios.forEach(rr => {
                stats[sl].rrStats[rr] = { total: 0, wins: 0, losses: 0, winRate: 0 };
            });
        });

        trades.forEach(trade => {
            this.stopLossLevels.forEach(sl => {
                this.riskRewardRatios.forEach(rr => {
                    const res = trade.results[sl][rr];
                    if (res !== 'empty') {
                        stats[sl].rrStats[rr].total++;
                        stats[sl].totalTrades++;
                        if (res === 'tp') stats[sl].rrStats[rr].wins++;
                        if (res === 'sl') stats[sl].rrStats[rr].losses++;
                    }
                });
            });
        });

        this.stopLossLevels.forEach(sl => {
            let totalWins = 0;
            const stat = stats[sl];
            this.riskRewardRatios.forEach(rr => {
                const rrStat = stat.rrStats[rr];
                if (rrStat.total > 0) {
                    rrStat.winRate = (rrStat.wins / rrStat.total) * 100;
                    totalWins += rrStat.wins;
                }
            });
            if (stat.totalTrades > 0) {
                stat.winRate = (totalWins / stat.totalTrades) * 100;
                // Best RR by highest winrate (min 3 trades)
                let best = { rr: 'N/A', rate: 0 };
                this.riskRewardRatios.forEach(rr => {
                    const rrStat = stat.rrStats[rr];
                    if (rrStat.total >= 3 && rrStat.winRate > best.rate) {
                        best = { rr, rate: rrStat.winRate };
                    }
                });
                stat.bestRR = best.rr;
            }
        });

        return stats;
    }

    updateStatistics() {
        const trades = this.data[this.currentTimeframe].trades;
        const stats = this.calculateStatistics(trades);
        this.stopLossLevels.forEach(sl => {
            const st = stats[sl];
            document.getElementById(`total-${sl}`).textContent = st.totalTrades;
            const wrElem = document.getElementById(`winrate-${sl}`);
            wrElem.textContent = st.totalTrades > 0 ? `${st.winRate.toFixed(1)}%` : '0%';
            wrElem.classList.remove('positive-stat', 'negative-stat');
            if (st.winRate >= 60) wrElem.classList.add('positive-stat');
            else if (st.totalTrades > 0 && st.winRate < 40) wrElem.classList.add('negative-stat');
            const bestRRElem = document.getElementById(`best-rr-${sl}`);
            bestRRElem.textContent = st.bestRR;
            bestRRElem.classList.remove('positive-stat');
            if (st.bestRR !== 'N/A') bestRRElem.classList.add('positive-stat');
        });
        // Save statistics to data store
        this.data[this.currentTimeframe].statistics = stats;
        this.saveTimeframeData(this.currentTimeframe);
    }

    /* ----------------- Clear / Reset ----------------- */
    clearCurrent() {
        const confirmClear = confirm('Cancellare tutte le righe del timeframe corrente?');
        if (!confirmClear) return;
        this.data[this.currentTimeframe].trades = [];
        this.data[this.currentTimeframe].lastModified = new Date().toISOString();
        this.saveTimeframeData(this.currentTimeframe);
        this.renderTable();
        this.updateStatistics();
        this.updatePercentages();
        this.notify('Timeframe svuotato con successo.', 'success');
    }

    resetAll() {
        const confirmReset = confirm('Reset completo di tutti i timeframe?');
        if (!confirmReset) return;
        this.timeframes.forEach(tf => {
            this.data[tf.code] = JSON.parse(JSON.stringify(this.defaultTimeframeData));
            this.saveTimeframeData(tf.code);
        });
        this.switchTimeframe(this.currentTimeframe);
        this.notify('Reset completo effettuato.', 'warning');
    }

    /* ----------------- Export / Import ----------------- */
    exportAll() {
        const exportData = {
            timeframes: this.data,
            exportedAt: new Date().toISOString(),
            version: '2.0' // NEW: Version with time and percentage features
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        this.downloadBlob(blob, `trading_data_all_${this.timestamp()}.json`);
        this.notify('Dati esportati con successo.', 'success');
    }

    exportCurrent() {
        const trades = this.data[this.currentTimeframe].trades;
        const csv = this.tradesToCsv(trades);
        const blob = new Blob([csv], { type: 'text/csv' });
        this.downloadBlob(blob, `trading_${this.currentTimeframe}_${this.timestamp()}.csv`);
        this.notify(`Timeframe ${this.currentTimeframe} esportato in CSV.`, 'success');
    }

    tradesToCsv(trades) {
        const headers = ['date', 'time', 'entryPrice']; // NEW: Include time in CSV
        this.stopLossLevels.forEach(sl => {
            this.riskRewardRatios.forEach(rr => {
                headers.push(`SL${sl}_${rr}`);
            });
        });
        const rows = trades.map(trade => {
            const row = [trade.date, trade.time, trade.entryPrice]; // NEW: Include time in row
            this.stopLossLevels.forEach(sl => {
                this.riskRewardRatios.forEach(rr => {
                    row.push(trade.results[sl][rr]);
                });
            });
            return row.join(',');
        });
        return [headers.join(','), ...rows].join('\n');
    }

    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    handleImport(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            try {
                const json = JSON.parse(content);
                if (json.timeframes) {
                    // Validate and migrate structure if needed
                    this.timeframes.forEach(tf => {
                        if (json.timeframes[tf.code]) {
                            const tfData = json.timeframes[tf.code];
                            
                            // Migrate old data structure to include time and percentages
                            if (tfData.trades) {
                                tfData.trades.forEach(trade => {
                                    if (!trade.time) {
                                        trade.time = ''; // Add missing time field
                                    }
                                });
                            }
                            if (!tfData.percentages) {
                                tfData.percentages = {}; // Add missing percentages object
                            }
                            
                            this.data[tf.code] = tfData;
                            this.saveTimeframeData(tf.code);
                        }
                    });
                    this.switchTimeframe(this.currentTimeframe);
                    this.notify('Dati importati con successo.', 'success');
                } else {
                    throw new Error('Formato JSON non valido');
                }
            } catch (err) {
                this.notify('Errore formato JSON: ' + err.message, 'error');
            }
        };
        reader.readAsText(file);
        // Reset input
        event.target.value = '';
    }

    /* ----------------- Notifications ----------------- */
    notify(message, type = 'info') {
        const area = document.getElementById('notificationArea');
        area.textContent = message;
        area.className = `notification-area ${type}`;
        area.classList.remove('hidden');
        setTimeout(() => area.classList.add('hidden'), 4000);
    }

    /* ----------------- Auto Backup ----------------- */
    autoBackup() {
        const data = {
            timeframes: this.data,
            backupAt: new Date().toISOString(),
            version: '2.0'
        };
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        this.downloadBlob(blob, `trading_backup_${this.timestamp()}.json`);
        this.notify('Backup automatico esportato.', 'info');
    }

    /* ----------------- Helpers ----------------- */
    timestamp() {
        return new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    }
}

// Initialize global app instance when DOM ready
let app = null;
window.addEventListener('DOMContentLoaded', () => {
    app = new MultiTimeframeTradingTester();
    window.app = app; // expose for inline handlers
});