import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Asset, PortfolioSummary, Transaction, HistorySnapshot } from './types';
import { fetchCryptoPrice, fetchAssetHistory, delay } from './services/geminiService';
import { AssetCard } from './components/AssetCard';
import { AddAssetForm } from './components/AddAssetForm';
import { Summary } from './components/Summary';
import { LayoutDashboard, Wallet, Download, Upload, FileJson } from 'lucide-react';

const App: React.FC = () => {
  // --- State ---
  const [assets, setAssets] = useState<Asset[]>(() => {
    const saved = localStorage.getItem('portfolio_assets');
    return saved ? JSON.parse(saved) : [];
  });

  const [history, setHistory] = useState<HistorySnapshot[]>(() => {
    const saved = localStorage.getItem('portfolio_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Derived State (Summary) ---
  const summary: PortfolioSummary = assets.reduce((acc, asset) => {
    const assetValue = asset.quantity * asset.currentPrice;
    return {
      totalValue: acc.totalValue + assetValue,
      totalCostBasis: acc.totalCostBasis + asset.totalCostBasis,
      totalPnL: acc.totalPnL + (assetValue - asset.totalCostBasis),
      totalPnLPercent: 0, // calc after
      assetCount: acc.assetCount + 1,
      lastGlobalUpdate: asset.lastUpdated > (acc.lastGlobalUpdate || '') ? asset.lastUpdated : acc.lastGlobalUpdate
    };
  }, { 
    totalValue: 0, 
    totalCostBasis: 0, 
    totalPnL: 0, 
    totalPnLPercent: 0,
    assetCount: 0, 
    lastGlobalUpdate: null as string | null 
  });

  if (summary.totalCostBasis > 0) {
    summary.totalPnLPercent = (summary.totalPnL / summary.totalCostBasis) * 100;
  }

  // --- Effects ---
  useEffect(() => {
    localStorage.setItem('portfolio_assets', JSON.stringify(assets));
  }, [assets]);

  useEffect(() => {
    localStorage.setItem('portfolio_history', JSON.stringify(history));
  }, [history]);

  // Record a history snapshot if values change significantly or on updates
  const recordHistorySnapshot = useCallback((currentAssets: Asset[]) => {
    const totalValue = currentAssets.reduce((sum, a) => sum + (a.quantity * a.currentPrice), 0);
    if (totalValue === 0) return;

    const snapshot: HistorySnapshot = {
      timestamp: Date.now(),
      totalValue,
      assetValues: currentAssets.reduce((acc, a) => ({
        ...acc,
        [a.ticker]: a.quantity * a.currentPrice
      }), {})
    };

    setHistory(prev => {
      // Limit history to last 50 points to save space/performance
      const newHistory = [...prev, snapshot];
      if (newHistory.length > 50) return newHistory.slice(newHistory.length - 50);
      return newHistory;
    });
  }, []);

  // --- Handlers ---

  const handleAddAsset = async (ticker: string, quantity: number, pricePerCoin: number, date: string) => {
    const totalCost = quantity * pricePerCoin;
    
    // New transaction object
    const newTx: Transaction = {
      id: Date.now().toString() + Math.random().toString().slice(2, 6),
      type: 'BUY',
      quantity,
      pricePerCoin,
      date,
      totalCost
    };

    // Check if asset exists
    const existingAsset = assets.find(a => a.ticker === ticker);
    
    if (existingAsset) {
      // Update existing
      const updatedTransactions = [...existingAsset.transactions, newTx];
      // Recalculate totals
      const newTotalQty = existingAsset.quantity + quantity;
      const newTotalCostBasis = existingAsset.totalCostBasis + totalCost;
      const newAvgBuyPrice = newTotalCostBasis / newTotalQty;

      setAssets(prev => prev.map(a => 
        a.id === existingAsset.id ? { 
          ...a, 
          quantity: newTotalQty,
          transactions: updatedTransactions,
          totalCostBasis: newTotalCostBasis,
          avgBuyPrice: newAvgBuyPrice
        } : a
      ));
    } else {
      // Create new asset
      const newId = Date.now().toString();
      const tempAsset: Asset = {
        id: newId,
        ticker,
        name: ticker,
        quantity,
        currentPrice: 0,
        lastUpdated: new Date().toISOString(),
        sources: [],
        isUpdating: true,
        transactions: [newTx],
        avgBuyPrice: pricePerCoin,
        totalCostBasis: totalCost
      };

      setAssets(prev => [...prev, tempAsset]);

      // Fetch real price
      try {
        const result = await fetchCryptoPrice(ticker);
        
        setAssets(prev => {
           return prev.map(a => {
            if (a.id === newId) {
              return {
                ...a,
                currentPrice: result.price,
                sources: result.sources,
                lastUpdated: new Date().toISOString(),
                isUpdating: false
              };
            }
            return a;
          });
        });

        // Background fetch for history
        fetchAssetHistory(ticker).then(historyData => {
           if (historyData) {
              setAssets(prev => prev.map(a => 
                a.id === newId ? { ...a, priceHistory: historyData } : a
              ));
           }
        });

      } catch (error: any) {
         setAssets(prev => prev.map(a => 
          a.id === newId ? { ...a, isUpdating: false, error: error.message || 'Failed to fetch price' } : a
        ));
      }
    }
  };

  const handleRemoveAsset = (id: string) => {
    setAssets(prev => prev.filter(a => a.id !== id));
  };

  const handleRetryHistory = async (id: string) => {
    const asset = assets.find(a => a.id === id);
    if (!asset) return;
    
    // Clear error immediately to give feedback
    setAssets(prev => prev.map(a => a.id === id ? { ...a, isUpdating: true, error: undefined } : a));
    
    try {
       const historyData = await fetchAssetHistory(asset.ticker);
       if (historyData && historyData.length > 0) {
         setAssets(prev => prev.map(a => 
            a.id === id ? { ...a, priceHistory: historyData, isUpdating: false, error: undefined } : a
         ));
       } else {
         setAssets(prev => prev.map(a => a.id === id ? { ...a, isUpdating: false, error: 'History source unavailable' } : a));
       }
    } catch (e: any) {
       console.error(e);
       setAssets(prev => prev.map(a => a.id === id ? { ...a, isUpdating: false, error: 'History fetch failed' } : a));
    }
  };

  const handleRefreshAsset = useCallback(async (id: string) => {
    const asset = assets.find(a => a.id === id);
    if (!asset) return;

    setAssets(prev => prev.map(a => a.id === id ? { ...a, isUpdating: true, error: undefined } : a));

    try {
      const result = await fetchCryptoPrice(asset.ticker);
      
      // Also try to fetch history if we don't have it
      let historyData = asset.priceHistory;
      if (!historyData || historyData.length === 0) {
         historyData = await fetchAssetHistory(asset.ticker);
      }

      setAssets(prev => {
        const updated = prev.map(a => {
          if (a.id === id) {
            return {
              ...a,
              currentPrice: result.price,
              sources: result.sources,
              lastUpdated: new Date().toISOString(),
              priceHistory: historyData || a.priceHistory,
              isUpdating: false
            };
          }
          return a;
        });
        recordHistorySnapshot(updated);
        return updated;
      });
    } catch (error: any) {
      setAssets(prev => prev.map(a => a.id === id ? { ...a, isUpdating: false, error: error.message || 'Refresh failed' } : a));
    }
  }, [assets, recordHistorySnapshot]);

  const handleRefreshAll = async () => {
    if (isLoading || assets.length === 0) return;
    setIsLoading(true);

    // Mark all as updating
    setAssets(prev => prev.map(a => ({ ...a, isUpdating: true, error: undefined })));

    let updatedAssets = [...assets];

    // Process sequentially to be nice to API limits
    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      try {
        const result = await fetchCryptoPrice(asset.ticker);
        
        let historyData = asset.priceHistory;
        // If missing history, try fetch
        if (!historyData || historyData.length === 0) {
            try {
               historyData = await fetchAssetHistory(asset.ticker);
            } catch (err) { /* ignore history error */ }
        }

        updatedAssets[i] = {
          ...updatedAssets[i],
          currentPrice: result.price,
          sources: result.sources,
          lastUpdated: new Date().toISOString(),
          priceHistory: historyData || updatedAssets[i].priceHistory,
          isUpdating: false
        };
        // Update state progressively so user sees progress
        setAssets([...updatedAssets]);
        
        // Small delay between requests
        await delay(500); 
      } catch (e: any) {
        updatedAssets[i] = { ...updatedAssets[i], isUpdating: false, error: e.message || 'Failed' };
        setAssets([...updatedAssets]);
      }
    }
    
    recordHistorySnapshot(updatedAssets);
    setIsLoading(false);
  };

  // --- Import / Export Handlers ---

  const handleExportData = () => {
    const exportData = {
      assets,
      history
    };
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `portfolio-backup-${new Date().toISOString().slice(0, 10)}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileObj = event.target.files && event.target.files[0];
    if (!fileObj) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        const parsedData = JSON.parse(json);
        
        // Handle both old format (array of assets) and new format (object with assets + history)
        if (Array.isArray(parsedData)) {
           setAssets(parsedData);
        } else if (parsedData.assets && Array.isArray(parsedData.assets)) {
           setAssets(parsedData.assets);
           if (parsedData.history) setHistory(parsedData.history);
        } else {
          alert("Invalid file format.");
        }
        
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (err) {
        alert("Failed to read file.");
      }
    };
    reader.readAsText(fileObj);
  };

  // --- Render ---
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 selection:bg-indigo-500 selection:text-white pb-20">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-500/20">
              <Wallet className="text-white" size={24} />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent hidden sm:block">
              Portfolio Tracker
            </h1>
             <h1 className="text-xl font-bold text-white sm:hidden">
              Portfolio
            </h1>
          </div>
          
          <div className="flex items-center gap-2">
             <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />
             
             <button onClick={() => fileInputRef.current?.click()} className="p-2 text-slate-400 hover:text-white transition-colors" title="Import">
                <Upload size={20} />
             </button>
             <button onClick={handleExportData} className="p-2 text-slate-400 hover:text-white transition-colors" title="Export">
                <Download size={20} />
             </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        
        <Summary 
          summary={summary} 
          assets={assets} 
          onRefreshAll={handleRefreshAll}
          isGlobalLoading={isLoading}
        />

        <AddAssetForm onAdd={handleAddAsset} isGlobalLoading={isLoading} />

        {/* Asset List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
              <LayoutDashboard size={20} className="text-indigo-400" />
              Holdings
            </h2>
            <span className="text-sm text-slate-500">{assets.length} items</span>
          </div>

          {assets.length === 0 ? (
            <div className="text-center py-20 bg-slate-800/50 rounded-2xl border border-slate-800 border-dashed">
              <div className="bg-slate-800 inline-block p-4 rounded-full mb-4">
                <FileJson size={32} className="text-slate-600" />
              </div>
              <p className="text-slate-400 font-medium">Your portfolio is empty</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {assets.map(asset => (
                <AssetCard 
                  key={asset.id} 
                  asset={asset} 
                  onRemove={handleRemoveAsset}
                  onRefresh={handleRefreshAsset}
                  onRetryHistory={handleRetryHistory}
                />
              ))}
            </div>
          )}
        </div>
      </main>
      
      <footer className="max-w-5xl mx-auto px-4 py-8 text-center text-slate-600 text-xs border-t border-slate-800/50 mt-8">
        <p>Market data powered by Google Gemini Search Grounding. Data is stored locally on your device.</p>
      </footer>
    </div>
  );
};

export default App;