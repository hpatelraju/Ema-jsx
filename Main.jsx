import React, { useState, useEffect, useCallback } from 'react';

// Utility function for delaying execution
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Utility function for retrying API calls with exponential backoff
const fetchWithRetry = async (url, retries = 3, backoff = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (response.status === 429) {
        // Rate limit exceeded
        const retryAfter = response.headers.get('Retry-After') || backoff * Math.pow(2, i);
        await delay(retryAfter * 1000);
        continue;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (err) {
      if (i === retries - 1) throw err;
      await delay(backoff * Math.pow(2, i));
    }
  }
};

const CryptoEMACalculator = () => {
  const [cryptocurrency, setCryptocurrency] = useState('dogecoin');
  const [cryptoId, setCryptoId] = useState('dogecoin');
  const [cryptoSymbol, setCryptoSymbol] = useState('DOGE');
  const [timeframe, setTimeframe] = useState('4h');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [marketData, setMarketData] = useState([]);
  const [emaResults, setEmaResults] = useState({});
  const [availableCoins, setAvailableCoins] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCoinList, setShowCoinList] = useState(false);
  const [fetchingCoins, setFetchingCoins] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Periods for EMA calculation
  const emaPeriods = [7, 9, 20, 25, 50, 100, 200];

  // Time frames for CoinGecko API
  const timeframes = [
    { label: '1 hour', value: '1h', days: 3, interval: 'minutely' },
    { label: '4 hours', value: '4h', days: 7, interval: 'hourly' },
    { label: '12 hours', value: '12h', days: 14, interval: 'hourly' },
    { label: '1 day', value: '1d', days: 30, interval: 'hourly' },
    { label: '7 days', value: '7d', days: 90, interval: 'daily' },
    { label: '30 days', value: '30d', days: 180, interval: 'daily' },
    { label: 'Max', value: 'max', days: 'max', interval: 'daily' },
  ];

  // Fetch list of available coins from CoinGecko API
  useEffect(() => {
    const fetchCoins = async () => {
      setFetchingCoins(true);
      try {
        const data = await fetchWithRetry(
          'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1'
        );
        if (!data || !Array.isArray(data)) {
          throw new Error('Invalid coin data');
        }
        const formattedCoins = data.map((coin) => ({
          id: coin.id,
          symbol: coin.symbol.toUpperCase(),
          name: coin.name,
          image: coin.image,
        }));
        setAvailableCoins(formattedCoins);
      } catch (err) {
        console.error('Error fetching coins:', err);
        setError('Failed to load cryptocurrency list. Using popular coins instead.');
        setAvailableCoins([
          { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
          { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
          { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin' },
          { id: 'shiba-inu', symbol: 'SHIB', name: 'Shiba Inu' },
          { id: 'pepe', symbol: 'PEPE', name: 'Pepe' },
          { id: 'floki', symbol: 'FLOKI', name: 'Floki' },
          { id: 'dogwifhat', symbol: 'WIF', name: 'Dogwifhat' },
          { id: 'bonk', symbol: 'BONK', name: 'Bonk' },
          { id: 'memecoin', symbol: 'MEME', name: 'Meme' },
          { id: 'solana', symbol: 'SOL', name: 'Solana' },
          { id: 'ripple', symbol: 'XRP', name: 'Ripple' },
          { id: 'cardano', symbol: 'ADA', name: 'Cardano' },
        ]);
      } finally {
        setFetchingCoins(false);
      }
    };
    fetchCoins();
  }, []);

  // Function to calculate EMA
  const calculateEMA = (prices, period) => {
    if (prices.length < period) return null;
    const k = 2 / (period + 1);
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += prices[i];
    }
    let ema = sum / period;
    for (let i = period; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
    }
    return ema;
  };

  // Fetch market data from CoinGecko API
  const fetchMarketData = useCallback(async () => {
    if (!cryptoId) {
      setError('Please select a cryptocurrency');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const selectedTimeframe = timeframes.find((tf) => tf.value === timeframe);
      if (!selectedTimeframe) {
        throw new Error('Invalid timeframe selected');
      }
      const { days, interval } = selectedTimeframe;
      const apiUrl = `https://api.coingecko.com/api/v3/coins/${cryptoId}/market_chart?vs_currency=usd&days=${days}&interval=${interval}`;
      const data = await fetchWithRetry(apiUrl);
      if (!data.prices || data.prices.length === 0) {
        throw new Error('No price data returned');
      }
      const priceData = data.prices.map((item) => ({
        timestamp: item[0],
        price: item[1],
      }));
      setMarketData(priceData);
      const prices = priceData.map((item) => item.price);
      const emaValues = {};
      for (const period of emaPeriods) {
        emaValues[period] = prices.length >= period ? calculateEMA(prices, period) : null;
      }
      const currentPrice = prices[prices.length - 1];
      setEmaResults({
        symbol: cryptoSymbol,
        name: cryptocurrency,
        timeframe,
        currentPrice,
        emas: emaValues,
        lastUpdated: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      console.error('Failed to fetch market data:', err);
      let errorMessage = 'Failed to fetch data from CoinGecko. Please try again later or select a different coin/timeframe.';
      if (err.message.includes('429')) {
        errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
      } else if (err.message.includes('404')) {
        errorMessage = `Cryptocurrency "${cryptoId}" not found. Please select a different coin.`;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [cryptoId, cryptoSymbol, cryptocurrency, timeframe]);

  // Auto-refresh data with increased interval
  useEffect(() => {
    if (cryptoId && timeframe && autoRefresh) {
      fetchMarketData();
      const interval = setInterval(fetchMarketData, 120000); // Refresh every 2 minutes
      return () => clearInterval(interval);
    }
  }, [cryptoId, timeframe, autoRefresh, fetchMarketData]);

  // Determine if price is above or below EMA
  const getPricePosition = (price, ema) => {
    if (!ema) return 'unknown';
    if (price > ema) return 'above';
    if (price < ema) return 'below';
    return 'equal';
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
  };

  const filteredCoins = availableCoins.filter(
    (coin) =>
      coin.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      coin.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectCoin = (coin) => {
    setCryptocurrency(coin.name);
    setCryptoId(coin.id);
    setCryptoSymbol(coin.symbol);
    setShowCoinList(false);
    fetchMarketData();
  };

  // Format price based on its magnitude
  const formatPrice = (price) => {
    if (price === null || price === undefined) return 'N/A';
    if (price < 0.00001) return price.toExponential(4);
    if (price < 0.0001) return price.toFixed(8);
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    if (price < 100) return price.toFixed(2);
    return price.toFixed(2);
  };

  return (
    <div className="p-4 max-w-md mx-auto bg-gray-50 min-h-screen">
      <h1 className="text-xl font-bold mb-4 text-center">Crypto EMA Calculator</h1>
      <p className="text-xs text-gray-500 text-center mb-4">Powered by CoinGecko API</p>

      {/* Selector area */}
      <div className="mb-6 bg-white p-4 rounded-lg shadow-sm">
        <div className="mb-4">
          <label className="block mb-1 text-sm font-medium">Cryptocurrency</label>
          <div className="relative">
            <button
              className="w-full p-2 border rounded flex justify-between items-center bg-white"
              onClick={() => setShowCoinList(!showCoinList)}
              disabled={fetchingCoins}
            >
              <span>
                {cryptoSymbol ? (
                  <>
                    {cryptoSymbol} - {cryptocurrency}
                  </>
                ) : fetchingCoins ? (
                  'Loading coins...'
                ) : (
                  'Select cryptocurrency'
                )}
              </span>
              <span>▼</span>
            </button>
            {showCoinList && (
              <div className="absolute z-10 mt-1 w-full bg-white border rounded-md shadow-lg max-h-64 overflow-y-auto">
                <div className="sticky top-0 bg-white p-2 border-b">
                  <input
                    type="text"
                    placeholder="Search coins..."
                    value={searchTerm}
                    onChange={handleSearch}
                    className="w-full p-2 border rounded text-sm"
                    autoFocus
                  />
                </div>
                <div>
                  {filteredCoins.length > 0 ? (
                    filteredCoins.map((coin) => (
                      <div
                        key={coin.id}
                        className="p-2 hover:bg-gray-100 cursor-pointer text-sm flex items-center"
                        onClick={() => selectCoin(coin)}
                      >
                        {coin.image && (
                          <img src={coin.image} alt={coin.symbol} className="w-6 h-6 mr-2" />
                        )}
                        <span className="font-medium">{coin.symbol}</span> - {coin.name}
                      </div>
                    ))
                  ) : (
                    <div className="p-2 text-gray-500 text-center">No coins found</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mb-4">
          <label className="block mb-1 text-sm font-medium">Timeframe</label>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="w-full p-2 border rounded bg-white"
          >
            {timeframes.map((tf) => (
              <option key={tf.value} value={tf.value}>
                {tf.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex mb-4 items-center">
          <label className="flex items-center text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="mr-2"
            />
            Auto-refresh (every 2 minutes)
          </label>
        </div>

        <button
          onClick={fetchMarketData}
          disabled={loading || !cryptoId}
          className="w-full py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-blue-300 text-sm font-medium"
        >
          {loading ? 'Loading...' : 'Calculate EMAs'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 p-3 rounded-md mb-4 text-red-800 text-sm">
          {error}
        </div>
      )}

      {/* Results area */}
      {emaResults.symbol && (
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-bold">
              {emaResults.symbol} ({emaResults.timeframe})
            </h2>
            <span className="text-xs text-gray-500">Updated: {emaResults.lastUpdated}</span>
          </div>

          <div className="mb-4">
            <div className="bg-gray-50 p-3 rounded-md mb-2">
              <div className="text-sm text-gray-600">Current Price</div>
              <div className="text-xl font-semibold">${formatPrice(emaResults.currentPrice)}</div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {emaPeriods.map((period) => {
                const emaValue = emaResults.emas[period];
                const position = getPricePosition(emaResults.currentPrice, emaValue);
                return (
                  <div
                    key={period}
                    className={`p-3 rounded-md ${
                      position === 'above'
                        ? 'bg-green-50 border border-green-100'
                        : position === 'below'
                        ? 'bg-red-50 border border-red-100'
                        : 'bg-gray-50'
                    }`}
                  >
                    <div className="text-sm text-gray-600">EMA {period}</div>
                    <div
                      className={`font-medium ${
                        position === 'above' ? 'text-green-700' : position === 'below' ? 'text-red-700' : ''
                      }`}
                    >
                      ${emaValue ? formatPrice(emaValue) : 'N/A'}
                    </div>
                    {position !== 'unknown' && (
                      <div className="text-xs mt-1">
                        Price is {position} EMA {period}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Trading signals summary */}
          <div className="bg-gray-50 p-3 rounded-md">
            <h3 className="font-medium mb-2 text-sm">Signal Summary</h3>
            {(() => {
              let bullishCount = 0;
              let bearishCount = 0;
              for (const period of emaPeriods) {
                const emaValue = emaResults.emas[period];
                if (!emaValue) continue;
                if (emaResults.currentPrice > emaValue) {
                  bullishCount++;
                } else if (emaResults.currentPrice < emaValue) {
                  bearishCount++;
                }
              }
              const totalSignals = bullishCount + bearishCount;
              const bullishPercentage = totalSignals > 0 ? (bullishCount / totalSignals) * 100 : 0;
              let overallSignal = 'Neutral';
              let signalColor = 'text-gray-600';
              if (bullishPercentage > 60) {
                overallSignal = 'Bullish';
                signalColor = 'text-green-600';
              } else if (bullishPercentage < 40) {
                overallSignal = 'Bearish';
                signalColor = 'text-red-600';
              }
              return (
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">Bullish Signals:</span>
                    <span className="text-green-600 font-medium">
                      {bullishCount}/{totalSignals}
                    </span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm">Bearish Signals:</span>
                    <span className="text-red-600 font-medium">
                      {bearishCount}/{totalSignals}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full mb-2">
                    <div
                      className="h-full bg-gradient-to-r from-red-500 to-green-500 rounded-full"
                      style={{ width: `${bullishPercentage}%` }}
                    ></div>
                  </div>
                  <div className="text-center">
                    <span className={`font-bold ${signalColor}`}>{overallSignal}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Strategy guide and disclaimer */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
        <h3 className="font-medium mb-2 text-sm">EMA Trading Strategy Guide</h3>
        <div className="text-xs text-gray-600 space-y-2">
          <p>
            <strong>Bullish signals:</strong> When price is above longer-term EMAs, especially when
            shorter-term EMAs cross above longer-term EMAs.
          </p>
          <p>
            <strong>Bearish signals:</strong> When price is below longer-term EMAs, especially when
            shorter-term EMAs cross below longer-term EMAs.
          </p>
          <p>
            <strong>Support/Resistance:</strong> EMAs often act as support (in uptrends) or resistance
            (in downtrends).
          </p>
          <p>
            <strong>Trend identification:</strong> Price consistently above/below EMAs indicates trend
            direction.
          </p>
        </div>
      </div>

      <div className="text-xs text-gray-500 text-center mt-4">
        <p>
          Data provided by CoinGecko API. This tool is for informational purposes only, not financial
          advice.
        </p>
      </div>
    </div>
  );
};

export default CryptoEMACalculator;
