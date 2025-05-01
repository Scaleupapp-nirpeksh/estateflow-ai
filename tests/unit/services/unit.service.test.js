const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const unitService = require('../../../src/services/unit.service');
const Unit = require('../../../src/models/unit.model');
const Tower = require('../../../src/models/tower.model');
const Project = require('../../../src/models/project.model');

// Mock data
const mockTenantId = new mongoose.Types.ObjectId();
const mockProjectId = new mongoose.Types.ObjectId();
const mockTowerId = new mongoose.Types.ObjectId();
const mockUserId = new mongoose.Types.ObjectId();

const mockProject = {
    _id: mockProjectId,
    tenantId: mockTenantId,
    name: 'Test Project',
    address: '123 Test Street',
    city: 'Mumbai',
    gstRate: 5,
    stampDutyRate: 5,
    registrationRate: 1,
};

const mockTower = {
    _id: mockTowerId,
    tenantId: mockTenantId,
    projectId: mockProjectId,
    name: 'Test Tower',
    totalFloors: 20,
    premiums: {
        floorRise: {
            type: 'fixed',
            value: 100,
            floorStart: 5,
        },
        viewPremium: [
            { view: 'Sea', percentage: 5 },
            { view: 'Garden', percentage: 3 },
        ],
    },
};

const mockUnitData = {
    tenantId: mockTenantId,
    projectId: mockProjectId,
    towerId: mockTowerId,
    number: 'A-1201',
    floor: 12,
    type: '3BHK',
    carpetArea: 1200,
    builtUpArea: 1500,
    superBuiltUpArea: 1800,
    basePrice: 12000,
    views: ['Sea'],
    attributes: {
        bedrooms: 3,
        bathrooms: 2,
        balconies: 1,
    },
};

let mongoServer;

// Setup and teardown
beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await Unit.deleteMany({});
    await Tower.deleteMany({});
    await Project.deleteMany({});

    // Create mock project and tower
    await Project.create(mockProject);
    await Tower.create(mockTower);
});

describe('Unit Service', () => {
    describe('createUnit', () => {
        it('should create a new unit successfully', async () => {
            const unit = await unitService.createUnit(mockUnitData);

            expect(unit).toBeDefined();
            expect(unit.number).toBe(mockUnitData.number);
            expect(unit.floor).toBe(mockUnitData.floor);
            expect(unit.type).toBe(mockUnitData.type);
            expect(unit.status).toBe('available'); // Default status
        });

        it('should throw an error if tower does not exist', async () => {
            const nonExistentTowerId = new mongoose.Types.ObjectId();
            const invalidData = {
                ...mockUnitData,
                towerId: nonExistentTowerId,
            };

            await expect(unitService.createUnit(invalidData))
                .rejects.toThrow('Tower not found');
        });
    });

    describe('createBulkUnits', () => {
        it('should create multiple units at once', async () => {
            const unitsData = [
                mockUnitData,
                {
                    ...mockUnitData,
                    number: 'A-1202',
                    views: ['Garden'],
                },
                {
                    ...mockUnitData,
                    number: 'A-1203',
                    floor: 12,
                    basePrice: 12500,
                },
            ];

            const units = await unitService.createBulkUnits(unitsData);

            expect(units).toBeDefined();
            expect(units.length).toBe(3);

            // Check units were created correctly
            const count = await Unit.countDocuments({ towerId: mockTowerId });
            expect(count).toBe(3);
        });

        it('should throw an error if there are duplicate unit numbers', async () => {
            const unitsData = [
                mockUnitData,
                {
                    ...mockUnitData,
                    number: 'A-1201', // Duplicate number
                },
            ];

            await expect(unitService.createBulkUnits(unitsData))
                .rejects.toThrow('Duplicate unit numbers detected');
        });
    });

    describe('getUnits', () => {
        beforeEach(async () => {
            // Create test units
            await Unit.create([
                mockUnitData,
                {
                    ...mockUnitData,
                    number: 'A-1202',
                    type: '2BHK',
                    carpetArea: 900,
                    builtUpArea: 1100,
                    superBuiltUpArea: 1300,
                    basePrice: 10000,
                },
                {
                    ...mockUnitData,
                    number: 'A-1203',
                    floor: 15,
                    views: ['Garden'],
                },
            ]);
        });

        it('should return all units for a tenant', async () => {
            const result = await unitService.getUnits({ tenantId: mockTenantId });

            expect(result.data).toBeDefined();
            expect(result.data.length).toBe(3);
            expect(result.pagination.total).toBe(3);
        });

        it('should filter units by type', async () => {
            const result = await unitService.getUnits({
                tenantId: mockTenantId,
                type: '2BHK',
            });

            expect(result.data).toBeDefined();
            expect(result.data.length).toBe(1);
            expect(result.data[0].number).toBe('A-1202');
        });

        it('should filter units by floor', async () => {
            const result = await unitService.getUnits({
                tenantId: mockTenantId,
                floor: 15,
            });

            expect(result.data).toBeDefined();
            expect(result.data.length).toBe(1);
            expect(result.data[0].number).toBe('A-1203');
        });

        it('should filter units by price range', async () => {
            const result = await unitService.getUnits({
                tenantId: mockTenantId,
                minPrice: 11000,
                maxPrice: 13000,
            });

            expect(result.data).toBeDefined();
            expect(result.data.length).toBe(2);
        });
    });

    describe('getUnitById', () => {
        let unitId;

        beforeEach(async () => {
            // Create a test unit
            const unit = await Unit.create(mockUnitData);
            unitId = unit._id;
        });

        it('should return a unit by ID with price details', async () => {
            const unit = await unitService.getUnitById(unitId);

            expect(unit).toBeDefined();
            expect(unit.number).toBe(mockUnitData.number);
            expect(unit.priceDetails).toBeDefined();
            expect(unit.priceDetails.basePrice).toBeDefined();
            expect(unit.priceDetails.totalPrice).toBeDefined();
        });

        it('should throw an error if unit not found', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();

            await expect(unitService.getUnitById(nonExistentId))
                .rejects.toThrow('Unit not found');
        });
    });

    describe('lockUnit', () => {
        let unitId;

        beforeEach(async () => {
            // Create a test unit
            const unit = await Unit.create(mockUnitData);
            unitId = unit._id;
        });

        it('should lock a unit successfully', async () => {
            const unit = await unitService.lockUnit(unitId, mockUserId, 60);

            expect(unit).toBeDefined();
            expect(unit.status).toBe('locked');
            expect(unit.lockedBy.toString()).toBe(mockUserId.toString());
            expect(unit.lockedUntil).toBeDefined();
        });

        it('should throw an error if unit is already locked', async () => {
            // Lock the unit first
            await unitService.lockUnit(unitId, mockUserId, 60);

            // Try to lock it again
            await expect(unitService.lockUnit(unitId, mockUserId, 60))
                .rejects.toThrow('Unit is not available');
        });
    });

    describe('releaseUnit', () => {
        let unitId;

        beforeEach(async () => {
            // Create a test unit
            const unit = await Unit.create(mockUnitData);
            unitId = unit._id;

            // Lock the unit
            await unitService.lockUnit(unitId, mockUserId, 60);
        });

        it('should release a locked unit', async () => {
            const unit = await unitService.releaseUnit(unitId);

            expect(unit).toBeDefined();
            expect(unit.status).toBe('available');
            expect(unit.lockedBy).toBeNull();
            expect(unit.lockedUntil).toBeNull();
        });

        it('should throw an error if unit is not locked', async () => {
            // Release the unit first
            await unitService.releaseUnit(unitId);

            // Try to release it again
            await expect(unitService.releaseUnit(unitId))
                .rejects.toThrow('Unit is not locked');
        });
    });

    describe('changeUnitStatus', () => {
        let unitId;

        beforeEach(async () => {
            // Create a test unit
            const unit = await Unit.create(mockUnitData);
            unitId = unit._id;
        });

        it('should change unit status from available to locked', async () => {
            const unit = await unitService.changeUnitStatus(unitId, 'locked', {
                userId: mockUserId,
                minutes: 60,
            });

            expect(unit).toBeDefined();
            expect(unit.status).toBe('locked');
            expect(unit.lockedBy.toString()).toBe(mockUserId.toString());
        });

        it('should change unit status from locked to booked', async () => {
            // Lock the unit first
            await unitService.lockUnit(unitId, mockUserId, 60);

            const bookingId = new mongoose.Types.ObjectId();
            const unit = await unitService.changeUnitStatus(unitId, 'booked', {
                bookingId,
            });

            expect(unit).toBeDefined();
            expect(unit.status).toBe('booked');
            expect(unit.lockedBy).toBeNull();
        });

        it('should throw an error for invalid status transitions', async () => {
            // Try to change from available to sold (invalid transition)
            await expect(unitService.changeUnitStatus(unitId, 'sold', {}))
                .rejects.toThrow('Cannot change status from available to sold');
        });
    });
});