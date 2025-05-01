const User = require('../models/user.model');
const { ApiError } = require('../utils/error-handler');
const logger = require('../utils/logger');

/**
 * Create a new user
 * @param {Object} userData - User data
 * @returns {Promise<User>} - Created user
 */
const createUser = async (userData) => {
    try {
        // Check if user with this email already exists
        const existingUser = await User.findOne({ email: userData.email });
        if (existingUser) {
            throw new ApiError(400, 'User with this email already exists');
        }

        // Create user
        const user = new User(userData);
        const savedUser = await user.save();

        // Return user without sensitive data
        return {
            _id: savedUser._id,
            name: savedUser.name,
            email: savedUser.email,
            role: savedUser.role,
            tenantId: savedUser.tenantId,
            contactPhone: savedUser.contactPhone,
            permissions: savedUser.permissions,
            active: savedUser.active,
        };
    } catch (error) {
        logger.error('Error creating user', { error });
        throw error;
    }
};

/**
 * Bulk create users
 * @param {Array} usersData - Array of user data objects
 * @param {string} tenantId - Tenant ID for all users
 * @returns {Promise<Array>} - Array of created users
 */
const bulkCreateUsers = async (usersData, tenantId) => {
    try {
        // Validate that all users have required fields
        for (const userData of usersData) {
            if (!userData.name || !userData.email || !userData.password || !userData.role) {
                throw new ApiError(400, `Missing required fields for user: ${userData.email || 'unknown'}`);
            }

            // Convert password to passwordHash
            userData.passwordHash = userData.password;
            delete userData.password;

            // Set tenant ID for all users
            userData.tenantId = tenantId;
        }

        // Check for duplicate emails within the array
        const emails = usersData.map(user => user.email.toLowerCase());
        const uniqueEmails = new Set(emails);

        if (emails.length !== uniqueEmails.size) {
            throw new ApiError(400, 'Duplicate emails in the request');
        }

        // Check for existing users with these emails
        const existingUsers = await User.find({
            email: { $in: emails }
        });

        if (existingUsers.length > 0) {
            const existingEmails = existingUsers.map(user => user.email);
            throw new ApiError(400, `These emails already exist: ${existingEmails.join(', ')}`);
        }

        // Create all users
        const createdUsers = await User.insertMany(usersData);

        // Return users without sensitive data
        return createdUsers.map(user => ({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            tenantId: user.tenantId,
            contactPhone: user.contactPhone,
            permissions: user.permissions,
            active: user.active,
        }));
    } catch (error) {
        if (error.name === 'BulkWriteError' && error.code === 11000) {
            // Handle duplicate key error
            logger.error('Duplicate key error in bulk user creation', { error });
            throw new ApiError(400, 'One or more users already exist');
        }

        logger.error('Error creating bulk users', { error });
        throw error;
    }
};

/**
 * Get users for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} - List of users
 */
const getUsers = async (tenantId, filters = {}) => {
    try {
        // Build query
        const query = { tenantId };

        // Add role filter if provided
        if (filters.role) {
            query.role = filters.role;
        }

        // Add active filter if provided
        if (filters.active !== undefined) {
            query.active = filters.active;
        }

        // Execute query
        const users = await User.find(query).select('-passwordHash -refreshToken');
        return users;
    } catch (error) {
        logger.error('Error getting users', { error, tenantId });
        throw error;
    }
};

/**
 * Get user by ID
 * @param {string} id - User ID
 * @returns {Promise<User>} - User object
 */
const getUserById = async (id) => {
    try {
        const user = await User.findById(id).select('-passwordHash -refreshToken');
        if (!user) {
            throw new ApiError(404, 'User not found');
        }
        return user;
    } catch (error) {
        logger.error('Error getting user', { error, userId: id });
        throw error;
    }
};

/**
 * Update user
 * @param {string} id - User ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<User>} - Updated user
 */
const updateUser = async (id, updateData) => {
    try {
        // Find user
        const user = await getUserById(id);

        // Fields that cannot be updated directly
        const restrictedFields = ['passwordHash', 'tenantId', 'refreshToken', 'lastLogin'];

        // Remove restricted fields from update data
        restrictedFields.forEach((field) => {
            if (updateData[field]) {
                delete updateData[field];
            }
        });

        // Update user
        Object.keys(updateData).forEach((key) => {
            user[key] = updateData[key];
        });

        const updatedUser = await user.save();

        // Return user without sensitive data
        return {
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
            tenantId: updatedUser.tenantId,
            contactPhone: updatedUser.contactPhone,
            permissions: updatedUser.permissions,
            active: updatedUser.active,
        };
    } catch (error) {
        logger.error('Error updating user', { error, userId: id });
        throw error;
    }
};

/**
 * Update user permissions
 * @param {string} id - User ID
 * @param {Object} permissions - Permissions to update
 * @returns {Promise<Object>} - Updated permissions
 */
const updateUserPermissions = async (id, permissions) => {
    try {
        const user = await getUserById(id);

        // Update permissions
        user.permissions = {
            ...user.permissions,
            ...permissions,
        };

        await user.save();
        return user.permissions;
    } catch (error) {
        logger.error('Error updating user permissions', { error, userId: id });
        throw error;
    }
};

/**
 * Activate or deactivate a user
 * @param {string} id - User ID
 * @param {boolean} active - Active status
 * @returns {Promise<User>} - Updated user
 */
const setUserStatus = async (id, active) => {
    try {
        const user = await getUserById(id);
        user.active = active;
        await user.save();

        return {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            active: user.active,
        };
    } catch (error) {
        logger.error('Error setting user status', { error, userId: id });
        throw error;
    }
};

module.exports = {
    createUser,
    getUsers,
    getUserById,
    updateUser,
    updateUserPermissions,
    setUserStatus,
    bulkCreateUsers,
};