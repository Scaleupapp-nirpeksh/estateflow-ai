# EstateFlow AI Data Models

This document provides detailed information about the core data models in the EstateFlow AI system: Tenant, Project, Tower, and Unit.

## Multi-tenant Architecture

EstateFlow AI follows a multi-tenant architecture where each tenant organization has isolated access to their own data. All models include a `tenantId` reference to enforce data isolation.

## Tenant Model

The Tenant model represents a real estate development organization using the EstateFlow AI platform.

### Schema

```javascript
const TenantSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Tenant name is required'],
    trim: true,
  },
  domain: {
    type: String,
    required: [true, 'Domain is required'],
    trim: true,
    unique: true,
    lowercase: true,
  },
  contactEmail: {
    type: String,
    required: [true, 'Contact email is required'],
    trim: true,
    lowercase: true,
  },
  contactPhone: {
    type: String,
    trim: true,
  },
  address: {
    type: String,
    trim: true,
  },
  logo: {
    type: String,
    default: null,
  },
  gstIn: {
    type: String,
    trim: true,
  },
  active: {
    type: Boolean,
    default: true,
  },
  subscription: {
    plan: {
      type: String,
      enum: ['Starter', 'Growth', 'Premium', 'Signature'],
      default: 'Starter',
    },
    expiresAt: {
      type: Date,
      default: () => new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
    },
    limits: {
      storageGB: {
        type: Number,
        default: 100,
      },
      aiMessagesPerMonth: {
        type: Number,
        default: 25000,
      },
    },
  },
  settings: {
    businessRules: {
      maxDiscountPercentage: {
        type: Number,
        default: 10
      },
      floorRisePremium: {
        type: Number,
        default: 100
      },
      lockPeriodMinutes: {
        type: Number,
        default: 60
      }
    },
    pricingRules: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  }
}, {
  timestamps: true,
});
```

### Key Features

1. **Organization Identity**
   - Tenant name, domain, and contact information
   - Logo for branding
   - GST identification number

2. **Subscription Management**
   - Subscription plan type
   - Expiration date
   - Resource limits (storage, AI usage)

3. **Business Rules**
   - Maximum allowed discount percentage
   - Default floor rise premium
   - Unit lock period settings

4. **Pricing Rules**
   - Tenant-wide pricing configuration
   - Flexible schema using Mixed type
   - Applies to all projects within the tenant

## Project Model

The Project model represents a real estate development project such as a residential complex, commercial property, or mixed-use development.

### Schema

```javascript
const ProjectSchema = new Schema({
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'Tenant ID is required'],
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Project name is required'],
    trim: true,
  },
  address: {
    type: String,
    required: [true, 'Project address is required'],
    trim: true,
  },
  city: {
    type: String,
    required: [true, 'City is required'],
    trim: true,
    index: true,
  },
  description: {
    type: String,
    default: '',
  },
  amenities: [
    {
      type: String,
      trim: true,
    },
  ],
  gstRate: {
    type: Number,
    default: 5,
    min: 0,
    max: 100,
  },
  stampDutyRate: {
    type: Number,
    default: 5,
    min: 0,
    max: 100,
  },
  registrationRate: {
    type: Number,
    default: 1,
    min: 0,
    max: 100,
  },
  active: {
    type: Boolean,
    default: true,
    index: true,
  },
  logo: {
    type: String,
    default: null,
  },
  images: [
    {
      type: String,
    },
  ],
  customPricingModel: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0],
    },
  },
}, {
  timestamps: true,
});
```

### Methods

```javascript
// Calculate total number of units in the project
ProjectSchema.methods.calculateTotalUnits = async function() {
  const Unit = mongoose.model('Unit');
  return Unit.countDocuments({ projectId: this._id });
};

// Calculate available units in the project
ProjectSchema.methods.calculateAvailableUnits = async function() {
  const Unit = mongoose.model('Unit');
  return Unit.countDocuments({ 
    projectId: this._id,
    status: 'available'
  });
};
```

### Key Features

1. **Project Details**
   - Basic information (name, address, city)
   - Description and amenities
   - Project images and logo

2. **Tax Settings**
   - GST rate
   - Stamp duty rate
   - Registration rate

3. **Pricing Model**
   - Custom pricing model for this project
   - Overrides tenant-level pricing rules

4. **Location**
   - GeoJSON point for mapping
   - Used for location-based searches

## Tower Model

The Tower model represents a building within a project, typically containing multiple units.

### Schema

```javascript
const TowerSchema = new Schema({
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'Tenant ID is required'],
    index: true,
  },
  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: [true, 'Project ID is required'],
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Tower name is required'],
    trim: true,
  },
  totalFloors: {
    type: Number,
    required: [true, 'Total floors is required'],
    min: 1,
  },
  unitsPerFloor: {
    type: Number,
    default: 4,
    min: 1,
  },
  construction: {
    status: {
      type: String,
      enum: ['Planning', 'Foundation', 'Superstructure', 'Finishing', 'Completed'],
      default: 'Planning',
    },
    completionPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    estimatedCompletionDate: {
      type: Date,
      default: null,
    },
  },
  premiums: {
    floorRise: {
      type: {
        type: String,
        enum: ['fixed', 'percentage'],
        default: 'fixed',
      },
      value: {
        type: Number,
        default: 0,
      },
      floorStart: {
        type: Number,
        default: 1,
      },
    },
    viewPremium: [
      {
        view: {
          type: String,
          required: true,
        },
        percentage: {
          type: Number,
          required: true,
          min: 0,
          max: 100,
        },
      },
    ],
  },
  active: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});
```

### Methods

```javascript
// Calculate total number of units in the tower
TowerSchema.methods.calculateTotalUnits = async function() {
  const Unit = mongoose.model('Unit');
  return Unit.countDocuments({ towerId: this._id });
};

// Calculate units available for sale
TowerSchema.methods.calculateAvailableUnits = async function() {
  const Unit = mongoose.model('Unit');
  return Unit.countDocuments({ 
    towerId: this._id,
    status: 'available'
  });
};

// Check if construction is complete
TowerSchema.methods.isConstructionComplete = function() {
  return this.construction.status === 'Completed' || 
         this.construction.completionPercentage === 100;
};
```

### Key Features

1. **Tower Details**
   - Basic information (name, total floors)
   - Units per floor configuration
   - Active/inactive status

2. **Construction Tracking**
   - Current construction status
   - Completion percentage
   - Estimated completion date

3. **Premium Rules**
   - Floor rise premium configuration
   - View premium settings for different view types

## Unit Model

The Unit model represents an individual property unit within a tower, such as an apartment or office space.

### Schema

```javascript
const UnitSchema = new Schema({
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'Tenant ID is required'],
    index: true,
  },
  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: [true, 'Project ID is required'],
    index: true,
  },
  towerId: {
    type: Schema.Types.ObjectId,
    ref: 'Tower',
    required: [true, 'Tower ID is required'],
    index: true,
  },
  number: {
    type: String,
    required: [true, 'Unit number is required'],
    trim: true,
    index: true,
  },
  floor: {
    type: Number,
    required: [true, 'Floor number is required'],
    min: 0,
    index: true,
  },
  type: {
    type: String,
    required: [true, 'Unit type is required'],
    trim: true,
    index: true,
  },
  carpetArea: {
    type: Number,
    required: [true, 'Carpet area is required'],
    min: 0,
  },
  builtUpArea: {
    type: Number,
    required: [true, 'Built-up area is required'],
    min: 0,
  },
  superBuiltUpArea: {
    type: Number,
    required: [true, 'Super built-up area is required'],
    min: 0,
  },
  basePrice: {
    type: Number,
    required: [true, 'Base price is required'],
    min: 0,
  },
  status: {
    type: String,
    enum: ['available', 'locked', 'booked', 'sold'],
    default: 'available',
    index: true,
  },
  lockedUntil: {
    type: Date,
    default: null,
  },
  lockedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  views: [
    {
      type: String,
      trim: true,
    },
  ],
  attributes: {
    bedrooms: {
      type: Number,
      default: 1,
    },
    bathrooms: {
      type: Number,
      default: 1,
    },
    balconies: {
      type: Number,
      default: 0,
    },
    parking: {
      type: Number,
      default: 0,
    },
    furnished: {
      type: Boolean,
      default: false,
    },
    storeRoom: {
      type: Boolean,
      default: false,
    },
    servantsQuarters: {
      type: Boolean,
      default: false,
    },
  },
  premiumAdjustments: [
    {
      type: {
        type: String,
        required: true,
      },
      percentage: {
        type: Number,
        default: 0,
      },
      amount: {
        type: Number,
        default: 0,
      },
      description: {
        type: String,
        default: '',
      },
    },
  ],
  additionalCharges: [
    {
      name: {
        type: String,
        required: true,
      },
      amount: {
        type: Number,
        required: true,
      },
      required: {
        type: Boolean,
        default: true,
      },
      description: {
        type: String,
        default: '',
      },
    },
  ],
}, {
  timestamps: true,
});
```

### Methods

```javascript
// Check if unit is available
UnitSchema.methods.isAvailable = function() {
  return this.status === 'available';
};

// Check if unit is locked
UnitSchema.methods.isLocked = function() {
  return this.status === 'locked';
};

// Check if lock is expired
UnitSchema.methods.isLockExpired = function() {
  if (!this.lockedUntil) return true;
  return new Date() > this.lockedUntil;
};

// Get total area based on type
UnitSchema.methods.getArea = function(areaType = 'superBuiltUpArea') {
  return this[areaType] || this.superBuiltUpArea;
};
```

### Key Features

1. **Unit Details**
   - Basic information (number, floor, type)
   - Area measurements (carpet, built-up, super built-up)
   - Base price configuration
   - Views available from the unit

2. **Unit Status Management**
   - Current status (available, locked, booked, sold)
   - Locking mechanism with expiration
   - User reference for who locked the unit

3. **Attributes**
   - Physical features (bedrooms, bathrooms, balconies)
   - Amenities (parking, furnished status)
   - Additional features (store room, servants quarters)

4. **Pricing Adjustments**
   - Premium adjustments (percentage or fixed amount)
   - Additional charges with descriptions
   - Required vs. optional charges

## Relationships

These models form a hierarchical relationship:

```
Tenant
  └── Project
       └── Tower
            └── Unit
```

Each entity references its parent entities via ID fields, enabling:

1. **Tenant Isolation**: Each tenant's data is isolated from others
2. **Project Grouping**: Units and towers are organized within projects
3. **Tower Grouping**: Units are organized within towers
4. **Hierarchical Queries**: Find all units within a specific project or tower

## Data Access Patterns

Common queries in the system include:

1. **Get all projects for a tenant**:
   ```javascript
   Project.find({ tenantId: tenantId });
   ```

2. **Get all towers in a project**:
   ```javascript
   Tower.find({ projectId: projectId });
   ```

3. **Get all units in a tower**:
   ```javascript
   Unit.find({ towerId: towerId });
   ```

4. **Get all available units in a project**:
   ```javascript
   Unit.find({ projectId: projectId, status: 'available' });
   ```

5. **Get specific unit type in a project**:
   ```javascript
   Unit.find({ projectId: projectId, type: '3BHK' });
   ```

6. **Get units with a specific view**:
   ```javascript
   Unit.find({ views: 'Sea' });
   ```

## Indexing Strategy

The schemas include indexes for optimizing common queries:

1. **Tenant Isolation**: `tenantId` field indexed on all models
2. **Project Filtering**: `projectId` field indexed on Tower and Unit models
3. **Tower Filtering**: `towerId` field indexed on Unit model
4. **Status Queries**: `status` field indexed on Unit model
5. **Type Filtering**: `type` field indexed on Unit model
6. **Unit Lookup**: `number` field indexed on Unit model
7. **Floor Filtering**: `floor` field indexed on Unit model
8. **City Searching**: `city` field indexed on Project model
9. **Text Search**: Text index on Project name, description, and address

## Business Logic

The models incorporate business logic through methods and validators:

1. **Unit Status Flow**: Available → Locked → Booked → Sold
2. **Pricing Calculation**: Based on area, premiums, and taxes
3. **Lock Expiration**: Units automatically return to available status when lock expires
4. **Unit Counts**: Projects and towers can calculate total and available units

## Security Considerations

1. **Tenant Isolation**: All queries must include appropriate tenant ID
2. **Role-Based Access**: Different user roles have different access levels
3. **Status Transition Rules**: Only specific status transitions are allowed
4. **Lock Ownership**: Only the user who locked a unit or admin roles can unlock it