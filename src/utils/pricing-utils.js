/**
 * Calculate base price for a unit
 * @param {Object} unit - Unit object
 * @param {Object} options - Calculation options
 * @returns {Number} - Base price
 */
const calculateBasePrice = (unit, options = {}) => {
    // Default to superBuiltUpArea if not specified
    const areaType = options.priceBasedOn || 'superBuiltUpArea';
    const area = unit[areaType] || unit.superBuiltUpArea;

    return unit.basePrice * area;
};

/**
 * Calculate floor rise premium
 * @param {Object} unit - Unit object
 * @param {Object} tower - Tower object
 * @param {Object} options - Calculation options
 * @returns {Object} - Premium details
 */
const calculateFloorRisePremium = (unit, tower, options = {}) => {
    const { floorRise } = tower.premiums;

    // Custom calculation method if provided
    if (options.floorRiseMethod && typeof options.floorRiseMethod === 'function') {
        return options.floorRiseMethod(unit, tower, floorRise);
    }

    // Check if floor is below the starting floor for premium
    if (unit.floor < floorRise.floorStart) {
        return {
            type: 'floor',
            amount: 0,
            percentage: null,
            description: 'No floor rise premium applicable',
        };
    }

    // Allow custom floor difference calculation
    let floorDifference;
    if (options.calculateFloorDifference) {
        floorDifference = options.calculateFloorDifference(unit.floor, floorRise.floorStart);
    } else {
        floorDifference = unit.floor - floorRise.floorStart + 1;
    }

    // Allow custom premium rate progression (linear, exponential, etc.)
    let premiumRate;
    if (options.floorRiseProgression) {
        if (typeof options.floorRiseProgression === 'function') {
            // If it's a function, call it directly
            premiumRate = options.floorRiseProgression(floorRise.value, floorDifference);
        } else if (options.floorRiseProgression.type === 'exponential' && options.floorRiseProgression.factor) {
            // Handle exponential progression
            premiumRate = floorRise.value * Math.pow(options.floorRiseProgression.factor, floorDifference - 1);
        } else if (options.floorRiseProgression.type === 'custom' && typeof options.floorRiseProgression.calculator === 'function') {
            // Handle custom calculator function
            premiumRate = options.floorRiseProgression.calculator(floorRise.value, floorDifference);
        } else {
            // Default to linear if type not recognized
            premiumRate = floorRise.value * floorDifference;
        }
    } else {
        premiumRate = floorRise.value * floorDifference; // Default linear progression
    }

    let premiumAmount = 0;

    if (floorRise.type === 'fixed') {
        // Use specified area type or default to superBuiltUpArea
        const areaType = options.priceBasedOn || 'superBuiltUpArea';
        const area = unit[areaType] || unit.superBuiltUpArea;

        premiumAmount = premiumRate * area;

        return {
            type: 'floor',
            amount: premiumAmount,
            percentage: null,
            description: `Floor rise premium for floor ${unit.floor}`,
        };
    } else {
        // Percentage of base price
        const basePrice = calculateBasePrice(unit, options);
        premiumAmount = (basePrice * premiumRate) / 100;

        return {
            type: 'floor',
            amount: premiumAmount,
            percentage: premiumRate,
            description: `Floor rise premium for floor ${unit.floor}`,
        };
    }
};

/**
 * Calculate view premiums
 * @param {Object} unit - Unit object
 * @param {Object} tower - Tower object
 * @param {Object} options - Calculation options
 * @returns {Array} - Array of premium objects
 */
const calculateViewPremiums = (unit, tower, options = {}) => {
    const basePrice = calculateBasePrice(unit, options);
    const premiums = [];

    if (!unit.views || unit.views.length === 0 || !tower.premiums.viewPremium) {
        return premiums;
    }

    // Custom calculation method if provided
    if (options.viewPremiumMethod) {
        if (typeof options.viewPremiumMethod === 'function') {
            return options.viewPremiumMethod(unit, tower, basePrice);
        } else if (options.viewPremiumMethod.type && typeof options.viewPremiumMethod.calculator === 'function') {
            return options.viewPremiumMethod.calculator(unit, tower, basePrice);
        }
    }

    // Calculate premium for each view
    for (const view of unit.views) {
        const viewPremiumDef = tower.premiums.viewPremium.find(p => p.view === view);

        if (viewPremiumDef && viewPremiumDef.percentage > 0) {
            let premiumAmount;

            // Allow custom view premium calculation
            if (options.calculateViewPremium) {
                premiumAmount = options.calculateViewPremium(basePrice, viewPremiumDef.percentage, view);
            } else {
                premiumAmount = (basePrice * viewPremiumDef.percentage) / 100;
            }

            premiums.push({
                type: 'view',
                amount: premiumAmount,
                percentage: viewPremiumDef.percentage,
                description: `Premium for ${view} view`,
            });
        }
    }

    // Support for view combination premiums (e.g. sea + garden has extra premium)
    if (options.combinationPremiums && unit.views.length > 1) {
        for (const combo of options.combinationPremiums) {
            // Check if all views in the combo are present
            const hasAllViews = combo.views.every(view => unit.views.includes(view));

            if (hasAllViews) {
                const comboAmount = combo.type === 'percentage'
                    ? (basePrice * combo.value) / 100
                    : combo.value;

                premiums.push({
                    type: 'view-combo',
                    amount: comboAmount,
                    percentage: combo.type === 'percentage' ? combo.value : null,
                    description: combo.description || `Premium for combined views: ${combo.views.join(', ')}`,
                });
            }
        }
    }

    return premiums;
};

/**
 * Calculate additional premiums and discounts
 * @param {Object} unit - Unit object
 * @param {Number} basePrice - Base price
 * @param {Object} options - Calculation options
 * @returns {Array} - Array of premium objects
 */
const calculateAdditionalPremiums = (unit, basePrice, options = {}) => {
    const premiums = [];

    if (!unit.premiumAdjustments || unit.premiumAdjustments.length === 0) {
        return premiums;
    }

    // Custom calculation method if provided
    if (options.additionalPremiumMethod && typeof options.additionalPremiumMethod === 'function') {
        return options.additionalPremiumMethod(unit, basePrice);
    }

    // Process each premium adjustment
    for (const adjustment of unit.premiumAdjustments) {
        let amount = adjustment.amount || 0;

        // If percentage-based, calculate amount from base price
        if (adjustment.percentage > 0) {
            // Allow custom calculation per premium type
            if (options.premiumCalculations && options.premiumCalculations[adjustment.type]) {
                amount = options.premiumCalculations[adjustment.type](basePrice, adjustment.percentage);
            } else {
                amount = (basePrice * adjustment.percentage) / 100;
            }
        }

        premiums.push({
            type: adjustment.type,
            amount: amount,
            percentage: adjustment.percentage > 0 ? adjustment.percentage : null,
            description: adjustment.description || `${adjustment.type} adjustment`,
        });
    }

    return premiums;
};

/**
 * Calculate taxes based on price
 * @param {Number} price - Price to calculate taxes on
 * @param {Object} project - Project with tax rates
 * @param {Object} options - Calculation options
 * @returns {Object} - Tax breakdown
 */
const calculateTaxes = (price, project, options = {}) => {
    // Custom calculation method if provided
    if (options.taxCalculationMethod) {
        if (typeof options.taxCalculationMethod === 'function') {
            return options.taxCalculationMethod(price, project);
        } else if (options.taxCalculationMethod.type && typeof options.taxCalculationMethod.calculator === 'function') {
            return options.taxCalculationMethod.calculator(price, project);
        }
    }

    // Get tax rates, with defaults if not present
    const gstRate = project.gstRate || 5;
    const stampDutyRate = project.stampDutyRate || 5;
    const registrationRate = project.registrationRate || 1;

    // Allow for custom tax calculations from options
    let calculateGST = (price, rate) => (price * rate) / 100;
    let calculateStampDuty = (price, rate) => (price * rate) / 100;
    let calculateRegistration = (price, rate) => (price * rate) / 100;

    // Handle custom tax calculation functions
    if (options.calculateGST) {
        if (typeof options.calculateGST === 'function') {
            calculateGST = options.calculateGST;
        } else if (options.calculateGST.type === 'tiered') {
            // Handle tiered GST calculation
            calculateGST = (price, rate) => {
                const tiers = options.calculateGST.tiers || [];
                if (tiers.length === 0) return (price * rate) / 100;

                // Sort tiers by threshold
                tiers.sort((a, b) => {
                    if (a.threshold === null) return 1;
                    if (b.threshold === null) return -1;
                    return a.threshold - b.threshold;
                });

                // Find applicable tier
                const tier = tiers.find(t => t.threshold === null || price <= t.threshold);
                return tier ? (price * tier.rate) / 100 : (price * rate) / 100;
            };
        } else if (options.calculateGST.type === 'fixed') {
            // Handle fixed rate GST
            calculateGST = (price, rate) => (price * options.calculateGST.rate) / 100;
        }
    }

    if (typeof options.calculateStampDuty === 'function') {
        calculateStampDuty = options.calculateStampDuty;
    }

    if (typeof options.calculateRegistration === 'function') {
        calculateRegistration = options.calculateRegistration;
    }

    const gst = calculateGST(price, gstRate);
    const stampDuty = calculateStampDuty(price, stampDutyRate);
    const registration = calculateRegistration(price, registrationRate);

    // Support for additional taxes if specified
    const additionalTaxes = {};
    let additionalTaxTotal = 0;

    if (options.additionalTaxes) {
        for (const tax of options.additionalTaxes) {
            const taxAmount = tax.type === 'percentage'
                ? (price * tax.value) / 100
                : tax.value;

            additionalTaxes[tax.name] = {
                rate: tax.type === 'percentage' ? tax.value : null,
                amount: taxAmount,
                description: tax.description
            };

            additionalTaxTotal += taxAmount;
        }
    }

    const totalStandardTaxes = gst + stampDuty + registration;
    const totalTaxes = totalStandardTaxes + additionalTaxTotal;

    return {
        gst: {
            rate: gstRate,
            amount: gst,
        },
        stampDuty: {
            rate: stampDutyRate,
            amount: stampDuty,
        },
        registration: {
            rate: registrationRate,
            amount: registration,
        },
        additionalTaxes: Object.keys(additionalTaxes).length > 0 ? additionalTaxes : undefined,
        total: totalTaxes,
    };
};

/**
 * Calculate additional charges for a unit
 * @param {Object} unit - Unit object
 * @param {Object} options - Calculation options
 * @returns {Object} - Additional charges breakdown
 */
const calculateAdditionalCharges = (unit, options = {}) => {
    if (!unit.additionalCharges || unit.additionalCharges.length === 0) {
        return {
            charges: [],
            total: 0
        };
    }

    // Custom calculation method if provided
    if (options.additionalChargesMethod && typeof options.additionalChargesMethod === 'function') {
        return options.additionalChargesMethod(unit);
    }

    let total = 0;
    const charges = unit.additionalCharges.map(charge => {
        let amount = charge.amount;

        // Apply custom calculations if specified
        if (options.chargeCalculations && options.chargeCalculations[charge.name]) {
            amount = options.chargeCalculations[charge.name](charge.amount, unit);
        }

        total += amount;

        return {
            name: charge.name,
            amount: amount,
            required: charge.required,
            description: charge.description
        };
    });

    return {
        charges,
        total
    };
};

/**
 * Generate a complete price breakdown
 * @param {Object} unit - Unit object
 * @param {Object} tower - Tower object
 * @param {Object} project - Project object
 * @param {Object} options - Custom calculation options
 * @returns {Object} - Complete price breakdown
 */
const generatePriceBreakdown = (unit, tower, project, options = {}) => {
    // Calculate base price
    const basePrice = calculateBasePrice(unit, options);

    // Calculate premiums
    const premiums = [];
    let premiumTotal = 0;

    // Floor rise premium
    const floorPremium = calculateFloorRisePremium(unit, tower, options);
    if (floorPremium.amount > 0) {
        premiums.push(floorPremium);
        premiumTotal += floorPremium.amount;
    }

    // View premiums
    const viewPremiums = calculateViewPremiums(unit, tower, options);
    viewPremiums.forEach(premium => {
        premiums.push(premium);
        premiumTotal += premium.amount;
    });

    // Additional premium adjustments
    const additionalPremiums = calculateAdditionalPremiums(unit, basePrice, options);
    additionalPremiums.forEach(premium => {
        premiums.push(premium);

        if (premium.type === 'discount') {
            premiumTotal -= premium.amount;
        } else {
            premiumTotal += premium.amount;
        }
    });

    // Additional charges
    const additionalChargesResult = calculateAdditionalCharges(unit, options);
    const additionalChargesTotal = additionalChargesResult.total;

    // Calculate subtotal
    const subtotal = basePrice + premiumTotal + additionalChargesTotal;

    // Calculate taxes
    const taxes = calculateTaxes(subtotal, project, options);

    // Calculate total price
    const totalPrice = subtotal + taxes.total;

    // Prepare and return the breakdown
    return {
        basePrice,
        premiums,
        premiumTotal,
        additionalCharges: additionalChargesResult.charges,
        additionalChargesTotal,
        subtotal,
        taxes,
        totalPrice,
        calculationOptions: options.includeOptions ? options : undefined,
    };
};

module.exports = {
    calculateBasePrice,
    calculateFloorRisePremium,
    calculateViewPremiums,
    calculateAdditionalPremiums,
    calculateTaxes,
    calculateAdditionalCharges,
    generatePriceBreakdown,
};