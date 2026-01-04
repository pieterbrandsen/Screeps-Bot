import Constants from "./constants.js";

export default class CreepBody {
    static normalizePartKey(key) {
        return Constants.normalizePartKey(key);
    }

    static partCost(partKey) {
        return Constants.getPartCost(partKey);
    }

    static partConst(partKey) {
        return Constants.getPartConstant(partKey);
    }

    static getBaseCountsForJobType(jobType) {
        return Constants.getBaseCreepPartsForJob(jobType);
    }

    static mergeRequiredCounts(missingCounts, baseCounts) {
        const out = Object.create(null);

        if (missingCounts) {
            for (const k in missingCounts) {
                const pt = this.normalizePartKey(k);
                const v = missingCounts[k] || 0;
                if (!pt || !v) continue;
                out[pt] = (out[pt] || 0) + v;
            }
        }

        if (baseCounts) {
            for (const k in baseCounts) {
                const pt = this.normalizePartKey(k);
                const v = baseCounts[k] || 0;
                if (!pt || !v) continue;
                out[pt] = Math.max(out[pt] || 0, v);
            }
        }

        return out;
    }

    static buildBodyFromCounts(counts, maxEnergy, options = Object.create(null)) {
        const order = options.order || ['WORK', 'CARRY', 'MOVE', 'TOUGH', 'ATTACK', 'RANGED_ATTACK', 'HEAL', 'CLAIM'];

        const body = [];
        const usedCounts = Object.create(null);
        let cost = 0;

        const addPart = (pt) => {
            const c = this.partConst(pt);
            const pc = this.partCost(pt);
            if (!c || pc <= 0) return false;
            if (cost + pc > maxEnergy) return false;
            if (body.length + 1 > 50) return false;

            body.push(c);
            cost += pc;
            const key = this.normalizePartKey(pt);
            usedCounts[key] = (usedCounts[key] || 0) + 1;
            return true;
        };

        if (counts) {
            for (const pt of order) {
                const need = counts[pt] || counts[String(pt).toUpperCase()] || 0;
                for (let i = 0; i < need; i++) {
                    if (!addPart(pt)) return { body, cost, usedCounts };
                }
            }

            for (const raw in counts) {
                const pt = this.normalizePartKey(raw);
                if (!pt || order.indexOf(pt) !== -1) continue;

                const need = counts[raw] || 0;
                for (let i = 0; i < need; i++) {
                    if (!addPart(pt)) return { body, cost, usedCounts };
                }
            }
        }

        return { body, cost, usedCounts };
    }

    static getPartCountsFromBody(body) {
        const counts = Object.create(null);
        if (!body) return counts;

        for (const part of body) {
            const key = this.normalizePartKey(part);
            if (!key) continue;
            counts[key] = (counts[key] || 0) + 1;
        }

        return counts;
    }

    /**
     * Calculate total energy cost from part counts.
     */
    static calculateCostFromCounts(counts) {
        if (!counts) return 0;

        const PART_COSTS = {
            WORK: 100,
            CARRY: 50,
            MOVE: 50,
            ATTACK: 80,
            RANGED_ATTACK: 150,
            HEAL: 250,
            CLAIM: 600,
            TOUGH: 10
        };

        let totalCost = 0;
        for (const partType in counts) {
            const count = counts[partType] || 0;
            const cost = PART_COSTS[partType] || PART_COSTS[String(partType).toUpperCase()] || 0;
            totalCost += count * cost;
        }

        return totalCost;
    }
}
