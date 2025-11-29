import { GoogleGenAI } from "@google/genai";
import { SourceLink } from "../types";

// Helper to safely get the API Key without crashing the browser if process is undefined
const getGenAI = () => {
  let apiKey = '';
  
  // 1. Try process.env (Standard Node/Container)
  if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
    apiKey = process.env.API_KEY;
  } 
  // 2. Try Vite env (Standard Browser Bundle)
  else if ((import.meta as any).env && (import.meta as any).env.VITE_API_KEY) {
    apiKey = (import.meta as any).env.VITE_API_KEY;
  }

  // If no key found, throw specific error
  if (!apiKey) {
    console.warn("API Key not found in process.env.API_KEY or import.meta.env.VITE_API_KEY");
    // We return null here to let the caller handle the specific error message, 
    // or we can throw immediately if we want to stop execution.
    // For this app, throwing is safer to alert the user.
    throw new Error("API Key missing. Please check your .env file.");
  }

  return new GoogleGenAI({ apiKey });
};

interface PriceResult {
  price: number;
  sources: SourceLink[];
  rawText: string;
}

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Manual map for top coins to ensure reliable fetching without relying on Search API
const COIN_ID_MAP: Record<string, string> = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'SOL': 'solana',
  'USDT': 'tether',
  'XRP': 'ripple',
  'BNB': 'binancecoin',
  'DOGE': 'dogecoin',
  'ADA': 'cardano',
  'AVAX': 'avalanche-2',
  'TRX': 'tron',
  'DOT': 'polkadot',
  'LINK': 'chainlink',
  'MATIC': 'matic-network',
  'SHIB': 'shiba-inu',
  'LTC': 'litecoin',
  'UNI': 'uniswap',
  'ATOM': 'cosmos',
  'XLM': 'stellar',
  'XMR': 'monero',
  'ALGO': 'algorand',
  'BCH': 'bitcoin-cash',
  'NEAR': 'near',
  'QNT': 'quant-network',
  'FIL': 'filecoin',
  'HBAR': 'hedera-hashgraph',
  'APT': 'aptos',
  'ARB': 'arbitrum',
  'OP': 'optimism',
  'RNDR': 'render-token',
  'PEPE': 'pepe',
  'SUI': 'sui',
  'KAS': 'kaspa',
  'TIA': 'celestia',
  'INJ': 'injective-protocol',
  'IMX': 'immutable-x',
  'VET': 'vechain',
  'ETC': 'ethereum-classic',
  'FDUSD': 'first-digital-usd',
  'OKB': 'okb',
  'CRO': 'crypto-com-chain',
  'LDO': 'lido-dao',
  'ICP': 'internet-computer',
  'STX': 'blockstack',
  'MNT': 'mantle',
  'AAVE': 'aave',
  'FET': 'fetch-ai',
  'RUNE': 'thorchain'
};

/**
 * Fetches the current price of a cryptocurrency using Gemini with Google Search Grounding.
 */
export const fetchCryptoPrice = async (ticker: string): Promise<PriceResult> => {
  try {
    const ai = getGenAI();
    
    // Enhanced prompt to target specific price aggregators for better accuracy on niche tokens
    const prompt = `Find the current market price of '${ticker}' cryptocurrency in USD. 
    
    Search specifically on data aggregators like Coinbase, CoinMarketCap, CoinGecko, or DEXScreener.
    
    You must return ONLY the numeric price value (e.g., 0.0045 or 65000.50). 
    Do not add currency symbols like '$' or text like 'USD'. 
    If you find a range or multiple markets, provide the average price.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "";
    
    // Parse the number from the response
    // Remove currency symbols and commas
    const cleanText = text.replace(/[$,]/g, '').trim();
    // Regex to find a number (integer or decimal)
    const priceMatch = cleanText.match(/[\d]*[.]{0,1}[\d]+/);
    
    let price = 0;
    if (priceMatch) {
      price = parseFloat(priceMatch[0]);
    } else {
      console.warn("Could not parse price from text:", text);
      const fallbackPrice = parseFloat(cleanText);
      if (!isNaN(fallbackPrice)) {
        price = fallbackPrice;
      } else {
         throw new Error(`Could not parse price for ${ticker}`);
      }
    }

    const sources: SourceLink[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    for (const chunk of chunks) {
      if (chunk.web && chunk.web.uri) {
        sources.push({
          title: chunk.web.title || 'Source',
          url: chunk.web.uri
        });
      }
    }

    return {
      price,
      sources,
      rawText: text
    };

  } catch (error: any) {
    console.error("Error fetching price via Gemini:", error);
    throw new Error(error.message || "Unknown error fetching price");
  }
};

/**
 * Attempts to fetch historical price data from multiple free public sources.
 * Strategies: CryptoCompare (Best) -> CoinGecko (Fallback) -> CoinCap (Last Resort)
 */
export const fetchAssetHistory = async (ticker: string): Promise<number[][] | undefined> => {
  const tickerUpper = ticker.toUpperCase();
  
  // --- Strategy 1: CryptoCompare ---
  // Excellent for standard tickers (BTC, ETH), supports CORS, no API key needed for basic history
  try {
     const url = `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${tickerUpper}&tsym=USD&limit=2000`;
     const res = await fetch(url);
     if (res.ok) {
        const json = await res.json();
        // CryptoCompare returns data in 'Data.Data'
        if (json.Response === 'Success' && json.Data && Array.isArray(json.Data.Data)) {
           // Convert unix seconds to milliseconds for JS Date
           const history = json.Data.Data.map((d: any) => [d.time * 1000, d.close]);
           // Filter out invalid zero entries if any
           const validHistory = history.filter((p: number[]) => p[1] > 0);
           
           if (validHistory.length > 10) {
              return validHistory;
           }
        }
     }
  } catch (e) {
     console.warn(`CryptoCompare strategy failed for ${ticker}`, e);
  }

  // --- Strategy 2: CoinGecko ---
  // Requires accurate ID (e.g., 'bitcoin'), strict rate limits
  let coinId = COIN_ID_MAP[tickerUpper];
  try {
    if (!coinId) {
        const searchUrl = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(ticker)}`;
        const searchRes = await fetch(searchUrl);
        if (searchRes.ok) {
           const searchData = await searchRes.json();
           const coins = searchData.coins || [];
           const exactMatch = coins.find((c: any) => c.symbol.toLowerCase() === ticker.toLowerCase());
           if (exactMatch) coinId = exactMatch.id;
           else if (coins.length > 0) coinId = coins[0].id;
        }
    }

    if (coinId) {
       await delay(500); // Throttling
       const chartUrl = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=max&interval=daily`;
       const chartRes = await fetch(chartUrl);
       if (chartRes.ok) {
          const chartData = await chartRes.json();
          if (Array.isArray(chartData.prices) && chartData.prices.length > 0) {
             return chartData.prices;
          }
       }
    }
  } catch (error) {
    console.warn(`CoinGecko history strategy failed for ${ticker}`, error);
  }

  // --- Strategy 3: CoinCap (Fallback) ---
  try {
    let coincapId = coinId || COIN_ID_MAP[tickerUpper] || ticker.toLowerCase();
    
    if (tickerUpper === 'BNB') coincapId = 'binance-coin';
    if (tickerUpper === 'XRP') coincapId = 'xrp';
    if (tickerUpper === 'MATIC') coincapId = 'polygon';
    if (tickerUpper === 'AVAX') coincapId = 'avalanche';

    const url = `https://api.coincap.io/v2/assets/${coincapId}/history?interval=d1`;
    const res = await fetch(url);
    
    if (res.ok) {
       const data = await res.json();
       if (data && data.data && Array.isArray(data.data)) {
          return data.data.map((d: any) => [d.time, parseFloat(d.priceUsd)]);
       }
    }
  } catch (e) {
     console.warn(`CoinCap strategy failed for ${ticker}`, e);
  }

  return undefined;
};