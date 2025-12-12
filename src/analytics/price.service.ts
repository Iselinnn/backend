import { Injectable, Logger } from '@nestjs/common';
import { SMA, RSI } from 'technicalindicators';
import * as ss from 'simple-statistics';

export interface PriceData {
  timestamp: number;
  price: number;
}

export interface Prediction {
  predictedPrices: PriceData[];
  trend: 'UP' | 'DOWN' | 'STABLE';
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
}

@Injectable()
export class PriceService {
  private readonly logger = new Logger(PriceService.name);

  // Original simple mock
  async getMarketPrices(itemName: string) {
      return [];
  }
  async getPriceHistory(itemName: string) {
      return [];
  }
  async calculateForecast(priceHistory: number[]) {
      return { predictedPrices: [], trend: 'STABLE', signal: 'HOLD', confidence: 0 };
  }

  // New Complex Forecast Logic
  async calculateAdvancedForecast(history: any[], histogram: any): Promise<Prediction> {
    // 1. Parse History [ "May 01 2024 01: +0", 1.23, "123" ]
    const parsedHistory: number[] = history.map(entry => entry[1]);
    const timestamps: number[] = history.map(entry => new Date(entry[0]).getTime());

    if (parsedHistory.length < 14) {
        // Not enough data fallback
        return this.generateMockPrediction(parsedHistory.length > 0 ? parsedHistory[parsedHistory.length - 1] : 10);
    }

    // 2. Technical Indicators
    const rsi = RSI.calculate({ values: parsedHistory, period: 14 });
    const lastRsi = rsi[rsi.length - 1];
    
    const sma7 = SMA.calculate({ values: parsedHistory, period: 7 });
    const sma30 = SMA.calculate({ values: parsedHistory, period: 30 });
    const lastSma7 = sma7[sma7.length - 1];
    const lastSma30 = sma30[sma30.length - 1];

    // 3. Supply/Demand Analysis from Histogram
    // histogram.buy_order_graph = [[price, cumulative_volume, description], ...]
    // We want to see if there is a "Buy Wall" close to current price
    let demandPressure = 0;
    let supplyPressure = 0;
    
    if (histogram.buy_order_graph && histogram.sell_order_graph) {
        // Sum volume of top 5 orders
        const topBuys = histogram.buy_order_graph.slice(0, 5);
        const topSells = histogram.sell_order_graph.slice(0, 5);
        
        const buyVol = topBuys.reduce((acc: number, curr: any[]) => acc + curr[1], 0);
        const sellVol = topSells.reduce((acc: number, curr: any[]) => acc + curr[1], 0);
        
        if (buyVol > sellVol * 1.5) demandPressure = 1; // High demand
        if (sellVol > buyVol * 1.5) supplyPressure = 1; // High supply
    }

    // 4. Combine Signals
    let score = 0;
    if (lastRsi < 35) score += 2; // Oversold -> Buy
    if (lastRsi > 65) score -= 2; // Overbought -> Sell
    if (lastSma7 > lastSma30) score += 1; // Uptrend
    if (demandPressure) score += 2;
    if (supplyPressure) score -= 2;

    let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    if (score >= 2) signal = 'BUY';
    else if (score <= -2) signal = 'SELL';

    // 5. Linear Regression + Adjustment for Forecast
    const recentPrices = parsedHistory.slice(-30);
    const dataPoints = recentPrices.map((p, i) => [i, p]);
    const { m, b } = ss.linearRegression(dataPoints);

    const predictedPrices: PriceData[] = [];
    const lastTime = timestamps[timestamps.length - 1];
    
    for (let i = 1; i <= 7; i++) {
        let predictedPrice = (m * (29 + i)) + b;
        
        // Adjust based on score (demand/supply impact)
        predictedPrice *= (1 + (score * 0.01)); 

        predictedPrices.push({
            timestamp: lastTime + (i * 24 * 60 * 60 * 1000),
            price: parseFloat(predictedPrice.toFixed(2))
        });
    }

    return {
        predictedPrices,
        trend: score > 0 ? 'UP' : (score < 0 ? 'DOWN' : 'STABLE'),
        signal,
        confidence: Math.min(Math.abs(score) * 20, 95) // 0-100%
    };
  }

  private generateMockPrediction(currentPrice: number): Prediction {
      // Fallback if scraping fails
      return {
          predictedPrices: [],
          trend: 'STABLE',
          signal: 'HOLD',
          confidence: 0
      };
  }
}
