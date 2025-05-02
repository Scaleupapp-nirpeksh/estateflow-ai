# EstateFlow AI Pricing System

This document provides a comprehensive overview of the customizable pricing system in EstateFlow AI.

## Overview

The EstateFlow AI pricing system is designed to handle complex real estate pricing scenarios with flexibility at multiple levels:

1. **Tenant Level**: Organization-wide pricing rules
2. **Project Level**: Project-specific pricing models
3. **Unit Type Level**: Pricing rules for specific unit types (e.g., 2BHK, 3BHK)
4. **Unit Level**: Individual unit premiums and adjustments
5. **On-the-fly Customization**: Context-specific pricing options

The system supports a wide range of pricing components:

- Base price calculations based on different area types
- Floor rise premiums with customizable progression models
- View premiums with support for combination view premiums
- Special location premiums (corner units, etc.)
- Taxes and fees with tiered structures
- Promotional discounts
- Additional charges for amenities and services

## Pricing Rules Structure

### Tenant-Level Rules

Applied to all projects and units organization-wide.

```json
{
  "pricingRules": {
    "priceBasedOn": "carpetArea",
    "floorRiseProgression": {
      "type": "exponential",
      "factor": 1.1
    },
    "additionalTaxes": [
      {
        "name": "infrastructureCess",
        "type": "percentage",
        "value": 1,
        "description": "Infrastructure development cess"
      }
    ]
  }
}
```

### Project-Level Rules

Override tenant rules and apply to all units in a specific project.

```json
{
  "customPricingModel": {
    "priceBasedOn": "builtUpArea",
    "calculateGST": {
      "type": "tiered",
      "tiers": [
        { "threshold": 5000000, "rate": 1 },
        { "threshold": 10000000, "rate": 5 },
        { "threshold": null, "rate": 12 }
      ]
    },
    "combinationPremiums": [
      {
        "views": ["Sea", "Garden"],
        "type": "percentage",
        "value": 2,
        "description": "Premium for combined sea and garden view"
      }
    ]
  }
}
```

### Unit Type Rules

Apply to specific unit types (e.g., 4BHK) within a project.

```json
{
  "pricingRules": {
    "premiumCalculations": {
      "corner": {
        "formula": "percentage",
        "value": 7
      },
      "privateTerrace": {
        "formula": "fixed",
        "value": 500000
      }
    },
    "additionalCharges": [
      {
        "name": "clubMembership",
        "amount": 150000,
        "required": true
      }
    ]
  }
}
```

### Unit-Level Adjustments

Applied to individual units.

```json
{
  "premiumAdjustments": [
    {
      "type": "corner",
      "percentage": 5,
      "description": "Corner unit premium"
    },
    {
      "type": "special",
      "amount": 500000,
      "description": "Celebrity floor premium"
    },
    {
      "type": "discount",
      "percentage": 3,
      "description": "Early bird discount"
    }
  ],
  "additionalCharges": [
    {
      "name": "parking",
      "amount": 250000,
      "required": true,
      "description": "Covered parking space"
    }
  ]
}
```

## Price Calculation Process

The pricing engine follows this order of operations:

1. Calculate base price using the specified area type (carpet, built-up, super built-up)
2. Apply floor rise premium based on floor number and tower settings
3. Apply view premiums based on unit views and tower settings
4. Apply view combination premiums if applicable
5. Apply unit-specific premium adjustments
6. Add required additional charges
7. Calculate subtotal (base price + premiums + charges)
8. Apply taxes based on subtotal
9. Calculate final price

## Customization Options

### Base Price Calculation

- **priceBasedOn**: Choose which area to base price on
  - `carpetArea`: Inner usable area
  - `builtUpArea`: Carpet area + walls
  - `superBuiltUpArea`: Built-up area + common areas (default)

### Floor Rise Premium

- **Fixed Rate**: Fixed amount per sq.ft. that increases with each floor
- **Percentage Based**: Percentage of base price that increases with each floor
- **Progression Types**:
  - `linear`: Same increment for each floor (default)
  - `exponential`: Increasing increment per floor
  - `custom`: Define your own progression formula

### View Premiums

- Standard view premiums defined at tower level
- Combination premiums for units with multiple desirable views
- Custom premium calculations possible per view type

### Additional Premiums

- Corner unit premiums
- Special location premiums
- Terrace/balcony premiums
- Custom premiums as needed

### Taxes and Fees

- GST with support for tiered rates
- Stamp duty
- Registration fees
- Custom additional taxes
- Municipality fees

### Special Discounts

- Early bird discounts
- Seasonal/festival discounts
- Loyalty discounts
- Payment plan discounts

## API Endpoints

### Pricing Rules Management

- `PUT /api/v1/pricing-rules/tenant/:tenantId` - Set tenant-wide pricing rules
- `PUT /api/v1/pricing-rules/project/:projectId` - Set project custom pricing model
- `POST /api/v1/pricing-rules/unit-type` - Create/update unit type pricing rules
- `GET /api/v1/pricing-rules` - Get all applicable pricing rules for a context
- `GET /api/v1/pricing-rules/project/:projectId/unit-types` - Get all unit type rules for a project
- `GET /api/v1/pricing-rules/unit-type/:id` - Get unit type rule by ID
- `DELETE /api/v1/pricing-rules/unit-type/:id` - Delete unit type pricing rule

### Price Calculation

- `GET /api/v1/inventory/units/:id/price` - Calculate unit price with optional custom parameters
- `PUT /api/v1/inventory/units/:id` - Update unit with premium adjustments

## Examples

### Scenario 1: Luxury Tower with Premium Views

1. Set project-level pricing model with high-end tax brackets
2. Define premium view combinations for sea + garden views
3. Set 4BHK unit type rules with additional amenities
4. Apply corner premiums to specific units
5. Calculate prices with tiered GST based on final value

### Scenario 2: Festival Promotion

1. Keep standard tenant and project pricing rules
2. Apply temporary discount in price calculation requests:
   ```json
   {
     "specialDiscounts": [
       {
         "type": "festive",
         "percentage": 5,
         "description": "Diwali special discount"
       }
     ]
   }
   ```

## Best Practices

1. Define standard pricing rules at tenant level
2. Customize at project level for specific project characteristics
3. Use unit type rules for consistent pricing across similar units
4. Apply unit-specific adjustments sparingly for truly unique features
5. Use on-the-fly options for temporary promotions without changing stored rules

## Implementation Notes

The pricing engine is implemented in a modular fashion:

- `pricing-utils.js` - Core calculation functions
- `pricing-rule.service.js` - Pricing rule management
- `unit.service.js` - Unit price calculation with rule application
- `pricing-rule.routes.js` - API endpoints for rule management

## Security Considerations

- All pricing rule management requires authentication
- Tenant-level rules can only be modified by Principal role
- Project-level rules can be modified by Principal and BusinessHead roles
- Price calculations respect tenant isolation
- Premium adjustments are audited when applied to units