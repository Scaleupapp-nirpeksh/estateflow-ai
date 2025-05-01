const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const projectService = require('../../../src/services/project.service');
const Project = require('../../../src/models/project.model');
const Tower = require('../../../src/models/tower.model');
const Unit = require('../../../src/models/unit.model');

// Mock data
const mockTenantId = new mongoose.Types.ObjectId();
const mockProjectData = {
    tenantId: mockTenantId,
    name: 'Test Project',
    address: '123 Test Street',
    city: 'Mumbai',
    description: 'A test project',
    gstRate: 5,
    stampDutyRate: 5,
    registrationRate: 1,
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
    await Project.deleteMany({});
    await Tower.deleteMany({});
    await Unit.deleteMany({});
});

describe('Project Service', () => {
    describe('createProject', () => {
        it('should create a new project successfully', async () => {
            const project = await projectService.createProject(mockProjectData);

            expect(project).toBeDefined();
            expect(project.name).toBe(mockProjectData.name);
            expect(project.address).toBe(mockProjectData.address);
            expect(project.city).toBe(mockProjectData.city);
            expect(project.tenantId.toString()).toBe(mockTenantId.toString());
        });
    });

    describe('getProjects', () => {
        beforeEach(async () => {
            // Create test projects
            await Project.create({
                ...mockProjectData,
                name: 'Project 1',
            });

            await Project.create({
                ...mockProjectData,
                name: 'Project 2',
                city: 'Delhi',
            });
        });

        it('should return all projects for a tenant', async () => {
            const result = await projectService.getProjects(mockTenantId);

            expect(result.data).toBeDefined();
            expect(result.data.length).toBe(2);
            expect(result.pagination.total).toBe(2);
        });

        it('should filter projects by city', async () => {
            const result = await projectService.getProjects(mockTenantId, { city: 'Delhi' });

            expect(result.data).toBeDefined();
            expect(result.data.length).toBe(1);
            expect(result.data[0].name).toBe('Project 2');
        });
    });

    describe('getProjectById', () => {
        let projectId;

        beforeEach(async () => {
            // Create a test project
            const project = await Project.create(mockProjectData);
            projectId = project._id;
        });

        it('should return a project by ID', async () => {
            const project = await projectService.getProjectById(projectId);

            expect(project).toBeDefined();
            expect(project.name).toBe(mockProjectData.name);
            expect(project.unitStats).toBeDefined();
        });

        it('should throw an error if project not found', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();

            await expect(projectService.getProjectById(nonExistentId))
                .rejects.toThrow('Project not found');
        });
    });

    describe('updateProject', () => {
        let projectId;

        beforeEach(async () => {
            // Create a test project
            const project = await Project.create(mockProjectData);
            projectId = project._id;
        });

        it('should update a project successfully', async () => {
            const updatedData = {
                name: 'Updated Project Name',
                description: 'Updated description',
            };

            const project = await projectService.updateProject(projectId, updatedData);

            expect(project).toBeDefined();
            expect(project.name).toBe(updatedData.name);
            expect(project.description).toBe(updatedData.description);
            // Original fields should remain unchanged
            expect(project.address).toBe(mockProjectData.address);
        });
    });

    describe('setProjectStatus', () => {
        let projectId;

        beforeEach(async () => {
            // Create a test project
            const project = await Project.create(mockProjectData);
            projectId = project._id;
        });

        it('should activate a project', async () => {
            const project = await projectService.setProjectStatus(projectId, true);

            expect(project).toBeDefined();
            expect(project.active).toBe(true);
        });

        it('should deactivate a project', async () => {
            const project = await projectService.setProjectStatus(projectId, false);

            expect(project).toBeDefined();
            expect(project.active).toBe(false);
        });
    });

    describe('deleteProject', () => {
        let projectId;

        beforeEach(async () => {
            // Create a test project
            const project = await Project.create(mockProjectData);
            projectId = project._id;
        });

        it('should delete a project successfully', async () => {
            const result = await projectService.deleteProject(projectId);

            expect(result).toBe(true);

            // Verify project is deleted
            const projectCount = await Project.countDocuments({ _id: projectId });
            expect(projectCount).toBe(0);
        });

        it('should throw an error if project has towers', async () => {
            // Create a tower for the project
            await Tower.create({
                tenantId: mockTenantId,
                projectId,
                name: 'Test Tower',
                totalFloors: 10,
            });

            await expect(projectService.deleteProject(projectId))
                .rejects.toThrow('Cannot delete project with existing towers');
        });
    });
});