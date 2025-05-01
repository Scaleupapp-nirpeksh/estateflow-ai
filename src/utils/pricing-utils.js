/**
 * Calculate base price for a unit
 * @param {Object} unit - Unit object
 * @returns {Number} - Base price
 */
const calculateBasePrice = (unit) => {
    return unit.basePrice * unit.superBuiltUpArea;
};

/**
 * Calculate floor rise premium
 * @param {Object} unit - Unit object
 * @param {Object} tower - Tower object
 * @returns {Object} - Premium details
 */
const calculateFloorRisePremium = (unit, tower) => {
    const { floorRise } = tower.premiums;

    // Check if floor is below the starting floor for premium
    if (unit.floor < floorRise.floorStart) {
        return {
            type: 'floor',
            amount: 0,
            percentage: null,
            description: 'No floor rise premium applicable',
        };
    }

    const floorDifference = unit.floor - floorRise.floorStart + 1;
    let premiumAmount = 0;

    if (floorRise.type === 'fixed') {
        // Fixed amount per sqft * floor difference
        premiumAmount = floorRise.value * unit.superBuiltUpArea * floorDifference;

        return {
            type: 'floor',
            amount: premiumAmount,
            percentage: null,
            description: `Floor rise premium for floor ${unit.floor}`,
        };
    } else {
        // Percentage of base price
        const basePrice = calculateBasePrice(unit);
        premiumAmount = (basePrice * floorRise.value * floorDifference) / 100;

        return {
            type: 'floor',
            amount: premiumAmount,
            percentage: floorRise.value * floorDifference,
            description: `Floor rise premium for floor ${unit.floor}`,
        };
    }
};

/**
 * Calculate view premiums
 * @param {Object} unit - Unit object
 * @param {Object} tower - Tower object
 * @returns {Array} - Array of premium objects
 */
const calculateViewPremiums = (unit, tower) => {
    const basePrice = calculateBasePrice(unit);
    const premiums = [];

    if (!unit.views || unit.views.length === 0 || !tower.premiums.viewPremium) {
        return premiums;
    }

    // Calculate premium for each view
    for (const view of unit.views) {
        const viewPremiumDef = tower.premiums.viewPremium.find(p => p.view === view);

        if (viewPremiumDef && viewPremiumDef.percentage > 0) {
            const premiumAmount = (basePrice * viewPremiumDef.percentage) / 100;

            premiums.push({
                type: 'view',
                amount: premiumAmount,
                percentage: viewPremiumDef.percentage,
                description: `Premium for ${view} view`,
            });
        }
    }

    return premiums;
};

/**
 * Calculate additional premiums and discounts
 * @param {Object} unit - Unit object
 * @param {Number} basePrice - Base price
 * @returns {Array} - Array of premium objects
 */
const calculateAdditionalPremiums = (unit, basePrice) => {
    const premiums = [];

    if (!unit.premiumAdjustments || unit.premiumAdjustments.length === 0) {
        return premiums;
    }

    // Process each premium adjustment
    for (const adjustment of unit.premiumAdjustments) {
        let amount = adjustment.amount || 0;

        // If percentage-based, calculate amount from base price
        if (adjustment.percentage > 0) {
            amount = (basePrice * adjustment.percentage) / 100;
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
 * @returns {Object} - Tax breakdown
 */
const calculateTaxes = (price, project) => {
    const gstRate = project.gstRate || 5;
    const stampDutyRate = project.stampDutyRate || 5;
    const registrationRate = project.registrationRate || 1;

    const gst = (price * gstRate) / 100;
    const stampDuty = (price * stampDutyRate) / 100;
    const registration = (price * registrationRate) / 100;

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
        total: gst + stampDuty + registration,
    };
};

/**
 * Generate a complete price breakdown
 * @param {Object} unit - Unit object
 * @param {Object} tower - Tower object
 * @param {Object} project - Project object
 * @returns {Object} - Complete price breakdown
 */
const generatePriceBreakdown = (unit, tower, project) => {
    // Calculate base price
    const basePrice = calculateBasePrice(unit);

    // Calculate premiums
    const premiums = [];
    let premiumTotal = 0;

    // Floor rise premium
    const floorPremium = calculateFloorRisePremium(unit, tower);
    if (floorPremium.amount > 0) {
        premiums.push(floorPremium);
        premiumTotal += floorPremium.amount;
    }

    // View premiums
    const viewPremiums = calculateViewPremiums(unit, tower);
    viewPremiums.forEach(premium => {
        premiums.push(premium);
        premiumTotal += premium.amount;
    });

    // Additional premium adjustments
    const additionalPremiums = calculateAdditionalPremiums(unit, basePrice);
    additionalPremiums.forEach(premium => {
        premiums.push(premium);

        if (premium.type === 'discount') {
            premiumTotal -= premium.amount;
        } else {
            premiumTotal += premium.amount;
        }
    });

    // Additional charges
    let additionalChargesTotal = 0;
    if (unit.additionalCharges && unit.additionalCharges.length > 0) {
        unit.additionalCharges.forEach(charge => {
            additionalChargesTotal += charge.amount;
        });
    }

    // Calculate subtotal
    const subtotal = basePrice + premiumTotal + additionalChargesTotal;

    // Calculate taxes
    const taxes = calculateTaxes(subtotal, project);

    // Calculate total price
    const totalPrice = subtotal + taxes.total;

    return {
        basePrice,
        premiums,
        premiumTotal,
        additionalCharges: unit.additionalCharges || [],
        additionalChargesTotal,
        subtotal,
        taxes,
        totalPrice,
    };
};

module.exports = {
    calculateBasePrice,
    calculateFloorRisePremium,
    calculateViewPremiums,
    calculateAdditionalPremiums,
    calculateTaxes,
    generatePriceBreakdown,
};