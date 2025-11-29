import React, { useState } from 'react';
import { Asset } from '../types';
import { Trash2, RefreshCw, ExternalLink, ChevronDown, ChevronUp, AlertCircle, History, TrendingUp, TrendingDown, Signal, SignalLow, CloudDownload } from 'lucide-react';

interface AssetCardProps {
  asset: Asset;
  onRemove: (id: string) => void;
  onRefresh: (id: string) => void;
  onRetryHistory: (id: string) => void;
}

export const AssetCard: React.FC<AssetCardProps> = ({ asset, onRemove, onRefresh, onRetryHistory }) => {
  const [showDetails, setShowDetails] = useState(false);

  // Calculations
  const currentTotalValue = asset.quantity * asset.currentPrice;
  const totalCost = asset.totalCostBasis;
  const profitLoss = currentTotalValue - totalCost;
  const profitLossPercent = totalCost > 0 ? (profitLoss / totalCost) * 100 : 0;
  
  const isProfit = profitLoss >= 0;
  const hasHistory = asset.priceHistory && asset.priceHistory.length > 0;

  // Formatters
  const currencyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const pctFmt = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 2, signDisplay: "always" });

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-lg hover:border-slate-600 transition-colors relative overflow-hidden">
      
      {/* Top Row: Ticker & Total Value */}
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="text-xl font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2">
            {asset.ticker}
            {asset.error && <AlertCircle size={16} className="text-red-500" />}
            
            {/* History Status Indicator */}
            {hasHistory ? (
              <span className="text-emerald-500/80" title="High Quality Historical Data">
                <Signal size={16} />
              </span>
            ) : (
              <span className="text-slate-600" title="Estimated Historical Data">
                <SignalLow size={16} />
              </span>
            )}
          </h3>
          <p className="text-slate-400 text-sm">{asset.quantity} units</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold text-slate-100">{currencyFmt.format(currentTotalValue)}</p>
          <div className={`flex items-center justify-end gap-1 text-sm font-medium ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isProfit ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            <span>{currencyFmt.format(profitLoss)} ({pctFmt.format(profitLossPercent / 100)})</span>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {asset.error && (
        <div className="mb-3 p-2 bg-red-900/30 border border-red-800 rounded text-red-200 text-xs">
          Error: {asset.error}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 mb-4 bg-slate-900/50 p-3 rounded-lg text-xs">
        <div>
           <p className="text-slate-500 mb-1">Current Price</p>
           <p className="text-slate-200 font-mono">{currencyFmt.format(asset.currentPrice)}</p>
        </div>
        <div className="text-right">
           <p className="text-slate-500 mb-1">Avg Buy Price</p>
           <p className="text-slate-200 font-mono">{currencyFmt.format(asset.avgBuyPrice)}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-700">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
        >
          {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {showDetails ? 'Hide Details' : 'Details & History'}
        </button>

        <div className="flex gap-2">
           {!hasHistory && (
             <button
              onClick={() => onRetryHistory(asset.id)}
              className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-all flex items-center gap-1"
              title="Download Price History"
            >
              <CloudDownload size={16} />
              <span className="text-[10px] font-medium hidden sm:inline">Get History</span>
            </button>
           )}
           <button
            onClick={() => onRefresh(asset.id)}
            disabled={asset.isUpdating}
            className={`p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-all ${asset.isUpdating ? 'animate-spin opacity-50 cursor-not-allowed' : ''}`}
            title="Refresh Price"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => onRemove(asset.id)}
            className="p-2 rounded-lg bg-slate-700 hover:bg-red-900/50 hover:text-red-400 text-slate-300 transition-colors"
            title="Remove Asset"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Expanded Details */}
      {showDetails && (
        <div className="mt-4 space-y-4 animate-fadeIn">
          
          {/* Sources */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">Price Source</p>
            {asset.sources.length > 0 ? (
              <ul className="space-y-1">
                {asset.sources.slice(0, 2).map((source, idx) => (
                  <li key={idx}>
                    <a 
                      href={source.url} 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-xs text-indigo-400 hover:underline truncate block flex items-center gap-1"
                    >
                      <ExternalLink size={10} />
                      {source.title || new URL(source.url).hostname}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
               <p className="text-xs text-slate-600 italic">Google Search Grounding</p>
            )}
             <p className="text-[10px] text-slate-600 mt-1">
              Updated: {new Date(asset.lastUpdated).toLocaleTimeString()}
            </p>
          </div>

          {/* Transaction History */}
          <div>
             <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2 flex items-center gap-1">
               <History size={10} /> Transactions
             </p>
             <div className="max-h-48 overflow-y-auto custom-scrollbar bg-slate-900/30 rounded border border-slate-700/50">
               <table className="w-full text-left text-xs">
                 <thead className="bg-slate-800/50 text-slate-400 sticky top-0">
                   <tr>
                     <th className="p-2 font-medium">Date</th>
                     <th className="p-2 font-medium">Qty</th>
                     <th className="p-2 font-medium text-right">Cost</th>
                     <th className="p-2 font-medium text-right">Value</th>
                     <th className="p-2 font-medium text-right">P&L</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-700/50 text-slate-300">
                   {asset.transactions.map((tx) => {
                     const txCurrentVal = tx.quantity * asset.currentPrice;
                     const txPnL = txCurrentVal - tx.totalCost;
                     const txPnLPct = (txPnL / tx.totalCost) * 100;
                     const isTxProfit = txPnL >= 0;

                     return (
                       <tr key={tx.id}>
                         <td className="p-2 text-slate-400 whitespace-nowrap">{tx.date}</td>
                         <td className="p-2">{tx.quantity}</td>
                         <td className="p-2 text-right">{currencyFmt.format(tx.totalCost)}</td>
                         <td className="p-2 text-right">{currencyFmt.format(txCurrentVal)}</td>
                         <td className={`p-2 text-right ${isTxProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                            <div className="flex flex-col items-end leading-tight">
                              <span>{currencyFmt.format(txPnL)}</span>
                              <span className="text-[10px] opacity-75">{isTxProfit ? '+' : ''}{txPnLPct.toFixed(2)}%</span>
                            </div>
                         </td>
                       </tr>
                     );
                   })}
                   {asset.transactions.length === 0 && (
                     <tr>
                       <td colSpan={5} className="p-2 text-center text-slate-600 italic">No history</td>
                     </tr>
                   )}
                 </tbody>
               </table>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};