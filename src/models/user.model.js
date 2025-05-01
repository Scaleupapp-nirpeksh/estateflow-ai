const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Schema = mongoose.Schema;

/**
 * User Schema
 * Represents a user of the system with role-based permissions
 */
const UserSchema = new Schema(
    {
        tenantId: {
            type: Schema.Types.ObjectId,
            ref: 'Tenant',
            required: [true, 'Tenant ID is required'],
            index: true,
        },
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            trim: true,
            lowercase: true,
        },
        passwordHash: {
            type: String,
            required: [true, 'Password is required'],
        },
        role: {
            type: String,
            enum: [
                'Principal',
                'BusinessHead',
                'SalesDirector',
                'SeniorAgent',
                'JuniorAgent',
                'CollectionsManager',
                'FinanceManager',
                'DocumentController',
                'ExternalAuditor',
            ],
            required: [true, 'Role is required'],
            index: true,
        },
        permissions: {
            maxDiscountPercentage: {
                type: Number,
                default: function () {
                    // Set default based on role
                    switch (this.role) {
                        case 'Principal':
                            return 15;
                        case 'BusinessHead':
                            return 10;
                        case 'SalesDirector':
                            return 7;
                        case 'SeniorAgent':
                            return 5;
                        case 'JuniorAgent':
                            return 2;
                        default:
                            return 0;
                    }
                },
            },
            approvalThreshold: {
                type: Number,
                default: function () {
                    // Set default based on role (in lakhs)
                    switch (this.role) {
                        case 'Principal':
                            return Infinity;
                        case 'BusinessHead':
                            return 50;
                        case 'SalesDirector':
                            return 25;
                        case 'SeniorAgent':
                            return 10;
                        default:
                            return 0;
                    }
                },
            },
        },
        contactPhone: {
            type: String,
            default: null,
        },
        active: {
            type: Boolean,
            default: true,
        },
        lastLogin: {
            type: Date,
            default: null,
        },
        refreshToken: {
            token: {
                type: String,
                default: null,
            },
            expiresAt: {
                type: Date,
                default: null,
            },
        },
    },
    {
        timestamps: true,
    }
);

// Add compound index for tenant and email
UserSchema.index({ tenantId: 1, email: 1 });
UserSchema.index({ tenantId: 1, role: 1 });
UserSchema.index({ active: 1 });

/**
 * Compare password with stored hash
 * @param {string} password - Password to compare
 * @returns {Promise<boolean>} - True if password matches
 */
UserSchema.methods.isPasswordMatch = async function (password) {
    const user = this;
    return bcrypt.compare(password, user.passwordHash);
};

/**
 * Hash password before saving
 */
UserSchema.pre('save', async function (next) {
    const user = this;
    if (user.isModified('passwordHash')) {
        const salt = await bcrypt.genSalt(10);
        user.passwordHash = await bcrypt.hash(user.passwordHash, salt);
    }
    next();
});

/**
 * @typedef User
 */
const User = mongoose.model('User', UserSchema);

module.exports = User;