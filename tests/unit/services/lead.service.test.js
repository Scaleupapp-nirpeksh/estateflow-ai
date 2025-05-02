// tests/unit/services/lead.service.test.js

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const leadService = require('../../../src/services/lead.service');
const Lead = require('../../../src/models/lead.model');
const User = require('../../../src/models/user.model');
const Tenant = require('../../../src/models/tenant.model');

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

describe('Lead Service', () => {
    let tenant, user, lead;

    beforeEach(async () => {
        // Clear collections
        await Promise.all([
            Lead.deleteMany({}),
            User.deleteMany({}),
            Tenant.deleteMany({})
        ]);

        // Create test tenant
        tenant = new Tenant({
            name: 'Test Tenant',
            domain: 'test-tenant.com',
            contactEmail: 'contact@test-tenant.com'
        });
        await tenant.save();

        // Create test user
        user = new User({
            tenantId: tenant._id,
            name: 'Test User',
            email: 'test@example.com',
            passwordHash: 'hashed_password',
            role: 'SalesDirector'
        });
        await user.save();

        // Create test lead
        lead = new Lead({
            tenantId: tenant._id,
            fullName: 'John Doe',
            phone: '1234567890',
            email: 'john@example.com',
            status: 'new',
            source: 'website',
            assignedTo: user._id
        });
        await lead.save();
    });

    test('should create a new lead', async () => {
        const newLead = {
            tenantId: tenant._id,
            fullName: 'Jane Smith',
            phone: '9876543210',
            email: 'jane@example.com',
            status: 'new',
            source: 'referral'
        };

        const created = await leadService.createLead(newLead);
        expect(created).toBeDefined();
        expect(created.fullName).toBe(newLead.fullName);
        expect(created.phone).toBe(newLead.phone);
        expect(created.email).toBe(newLead.email);
    });

    test('should get leads for a tenant', async () => {
        const result = await leadService.getLeads(tenant._id);
        expect(result).toBeDefined();
        expect(result.data).toBeInstanceOf(Array);
        expect(result.pagination).toBeDefined();
        expect(result.data.length).toBe(1);
    });

    test('should get lead by ID', async () => {
        const result = await leadService.getLeadById(lead._id);
        expect(result).toBeDefined();
        expect(result.fullName).toBe('John Doe');
        expect(result.phone).toBe('1234567890');
    });

    test('should update lead', async () => {
        const updates = {
            fullName: 'John Smith',
            status: 'contacted'
        };

        const updated = await leadService.updateLead(lead._id, updates);
        expect(updated).toBeDefined();
        expect(updated.fullName).toBe(updates.fullName);
        expect(updated.status).toBe(updates.status);
    });

    test('should add interaction to lead', async () => {
        const interaction = {
            type: 'call',
            date: new Date(),
            details: 'Discussed property requirements',
            outcome: 'positive',
            createdBy: user._id
        };

        const updated = await leadService.addInteraction(lead._id, interaction);
        expect(updated).toBeDefined();
        expect(updated.interactions).toBeInstanceOf(Array);
        expect(updated.interactions.length).toBe(1);
        expect(updated.interactions[0].type).toBe(interaction.type);
    });

    test('should add note to lead', async () => {
        const note = {
            content: 'This lead is very promising',
            createdBy: user._id
        };

        const updated = await leadService.addNote(lead._id, note);
        expect(updated).toBeDefined();
        expect(updated.notes).toBeInstanceOf(Array);
        expect(updated.notes.length).toBe(1);
        expect(updated.notes[0].content).toBe(note.content);
    });

    test('should add interested unit to lead', async () => {
        const interest = {
            unitId: new mongoose.Types.ObjectId(),
            interestLevel: 'high',
            notes: 'Very interested in this unit'
        };

        const updated = await leadService.addInterestedUnit(lead._id, interest);
        expect(updated).toBeDefined();
        expect(updated.interestedUnits).toBeInstanceOf(Array);
        expect(updated.interestedUnits.length).toBe(1);
        expect(updated.interestedUnits[0].interestLevel).toBe(interest.interestLevel);
    });

    test('should change lead status', async () => {
        const updated = await leadService.changeLeadStatus(lead._id, 'qualified');
        expect(updated).toBeDefined();
        expect(updated.status).toBe('qualified');
    });

    test('should get lead statistics', async () => {
        const stats = await leadService.getLeadStatistics(tenant._id);
        expect(stats).toBeDefined();
        expect(stats.totalLeads).toBe(1);
        expect(stats.byStatus).toBeInstanceOf(Array);
        expect(stats.bySource).toBeInstanceOf(Array);
    });
});