"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var PriceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceService = void 0;
const common_1 = require("@nestjs/common");
const technicalindicators_1 = require("technicalindicators");
const ss = __importStar(require("simple-statistics"));
let PriceService = PriceService_1 = class PriceService {
    logger = new common_1.Logger(PriceService_1.name);
    async getMarketPrices(itemName) {
        return [];
    }
    async getPriceHistory(itemName) {
        return [];
    }
    async calculateForecast(priceHistory) {
        return { predictedPrices: [], trend: 'STABLE', signal: 'HOLD', confidence: 0 };
    }
    async calculateAdvancedForecast(history, histogram) {
        const parsedHistory = history.map(entry => entry[1]);
        const timestamps = history.map(entry => new Date(entry[0]).getTime());
        if (parsedHistory.length < 14) {
            return this.generateMockPrediction(parsedHistory.length > 0 ? parsedHistory[parsedHistory.length - 1] : 10);
        }
        const rsi = technicalindicators_1.RSI.calculate({ values: parsedHistory, period: 14 });
        const lastRsi = rsi[rsi.length - 1];
        const sma7 = technicalindicators_1.SMA.calculate({ values: parsedHistory, period: 7 });
        const sma30 = technicalindicators_1.SMA.calculate({ values: parsedHistory, period: 30 });
        const lastSma7 = sma7[sma7.length - 1];
        const lastSma30 = sma30[sma30.length - 1];
        let demandPressure = 0;
        let supplyPressure = 0;
        if (histogram.buy_order_graph && histogram.sell_order_graph) {
            const topBuys = histogram.buy_order_graph.slice(0, 5);
            const topSells = histogram.sell_order_graph.slice(0, 5);
            const buyVol = topBuys.reduce((acc, curr) => acc + curr[1], 0);
            const sellVol = topSells.reduce((acc, curr) => acc + curr[1], 0);
            if (buyVol > sellVol * 1.5)
                demandPressure = 1;
            if (sellVol > buyVol * 1.5)
                supplyPressure = 1;
        }
        let score = 0;
        if (lastRsi < 35)
            score += 2;
        if (lastRsi > 65)
            score -= 2;
        if (lastSma7 > lastSma30)
            score += 1;
        if (demandPressure)
            score += 2;
        if (supplyPressure)
            score -= 2;
        let signal = 'HOLD';
        if (score >= 2)
            signal = 'BUY';
        else if (score <= -2)
            signal = 'SELL';
        const recentPrices = parsedHistory.slice(-30);
        const dataPoints = recentPrices.map((p, i) => [i, p]);
        const { m, b } = ss.linearRegression(dataPoints);
        const predictedPrices = [];
        const lastTime = timestamps[timestamps.length - 1];
        for (let i = 1; i <= 7; i++) {
            let predictedPrice = (m * (29 + i)) + b;
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
            confidence: Math.min(Math.abs(score) * 20, 95)
        };
    }
    generateMockPrediction(currentPrice) {
        return {
            predictedPrices: [],
            trend: 'STABLE',
            signal: 'HOLD',
            confidence: 0
        };
    }
};
exports.PriceService = PriceService;
exports.PriceService = PriceService = PriceService_1 = __decorate([
    (0, common_1.Injectable)()
], PriceService);
