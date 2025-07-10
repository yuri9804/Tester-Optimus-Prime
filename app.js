// Multi-Timeframe Trading Indicator Tester with Time and Percentage Features
class MultiTimeframeTradingTester {
    constructor() {
        /* Config */
        this.stopLossLevels = [30, 50, 75, 100];
        this.riskRewardRatios = ['1:1', '1:2', '1:3', '1:4', '1:5']; // AGGIUNTO 1:5
        this.rrValues = { 
            '1:1': 1, 
            '1:2': 2, 
            '1:3': 3, 
            '1:4': 4,
            '1:5': 5  // AGGIUNTO 1:5
        };
        
        this.timeframes = [
            { code: 'M1', name: '1 Minuto', color: '#FF6B6B' },
            { code: 'M3', name: '3 Minuti', color: '#4ECDC4' },
            { code: 'M5', name: '5 Minuti', color: '#45B7D1' },
            { code: 'M15', name: '15 Minuti', color: '#96CEB4' },
            { code: 'M30', name: '30 Minuti', color: '#FF8C00' }, // AGGIUNTO M30
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
        document.getElementById('exportCurrentBtn').addEventListener('click', () => this.exportCurrent());
        document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFileInput').click());
        document.getElementById('importFileInput').addEventListener('change', (e) => this.handleImport(e));
        
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
    
    exportCurrent() {
        const exportData = {
            version: '2.0',
            timestamp: new Date().toISOString(),
            timeframe: this.currentTimeframe,
            data: this.data[this.currentTimeframe]
        };
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `trading_data_${this.currentTimeframe}_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        this.showNotification(`Dati ${this.currentTimeframe} esportati con successo!`, 'success');
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
        notification.textContent = message;
        
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
