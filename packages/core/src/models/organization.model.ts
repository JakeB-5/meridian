import type { Result } from '@meridian/shared';
import {
  ok,
  err,
  generateId,
  slugify,
  ValidationError,
  ConflictError,
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
} from '@meridian/shared';

/** Organization plan tiers */
export type OrganizationPlan = 'free' | 'starter' | 'professional' | 'enterprise';

/** Organization settings */
export interface OrganizationSettings {
  defaultLocale: string;
  defaultTimezone: string;
  allowPublicDashboards: boolean;
  maxDataSources: number;
  maxUsers: number;
  features: string[];
}

/** Default organization settings */
const DEFAULT_SETTINGS: OrganizationSettings = {
  defaultLocale: 'en',
  defaultTimezone: 'UTC',
  allowPublicDashboards: false,
  maxDataSources: 5,
  maxUsers: 10,
  features: [],
};

/** Plan-specific limits */
const PLAN_LIMITS: Record<OrganizationPlan, Pick<OrganizationSettings, 'maxDataSources' | 'maxUsers'>> = {
  free: { maxDataSources: 3, maxUsers: 5 },
  starter: { maxDataSources: 10, maxUsers: 25 },
  professional: { maxDataSources: 50, maxUsers: 100 },
  enterprise: { maxDataSources: 999, maxUsers: 9999 },
};

/** Member reference within the organization domain */
export interface OrganizationMember {
  userId: string;
  joinedAt: Date;
}

/**
 * Organization domain entity.
 *
 * Organizations are the top-level grouping for all resources in Meridian.
 * Users, data sources, questions, dashboards all belong to an organization.
 */
export class Organization {
  public readonly id: string;
  public readonly name: string;
  public readonly slug: string;
  public readonly description: string | undefined;
  public readonly plan: OrganizationPlan;
  public readonly settings: OrganizationSettings;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private _members: OrganizationMember[];

  private constructor(params: {
    id: string;
    name: string;
    slug: string;
    description?: string;
    plan: OrganizationPlan;
    settings: OrganizationSettings;
    members: OrganizationMember[];
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = params.id;
    this.name = params.name;
    this.slug = params.slug;
    this.description = params.description;
    this.plan = params.plan;
    this.settings = { ...params.settings };
    this._members = [...params.members];
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }

  /** Get all members (read-only) */
  get members(): ReadonlyArray<OrganizationMember> {
    return [...this._members];
  }

  /** Get member count */
  get memberCount(): number {
    return this._members.length;
  }

  /** Check if the organization is at its user limit */
  get isAtUserLimit(): boolean {
    return this._members.length >= this.settings.maxUsers;
  }

  /**
   * Factory: create a new organization.
   */
  static create(params: {
    name: string;
    slug?: string;
    description?: string;
    plan?: OrganizationPlan;
  }): Result<Organization> {
    if (!params.name || params.name.trim().length === 0) {
      return err(new ValidationError('Organization name is required'));
    }
    if (params.name.length > MAX_NAME_LENGTH) {
      return err(new ValidationError(`Organization name must be ${MAX_NAME_LENGTH} characters or less`));
    }
    if (params.description && params.description.length > MAX_DESCRIPTION_LENGTH) {
      return err(new ValidationError(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`));
    }

    const slug = params.slug ?? slugify(params.name);
    if (slug.length === 0) {
      return err(new ValidationError('Organization slug cannot be empty'));
    }
    if (slug.length > 100) {
      return err(new ValidationError('Organization slug must be 100 characters or less'));
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return err(new ValidationError('Organization slug must contain only lowercase letters, numbers, and hyphens'));
    }

    const plan = params.plan ?? 'free';
    const planLimits = PLAN_LIMITS[plan];

    const now = new Date();
    return ok(new Organization({
      id: generateId(),
      name: params.name.trim(),
      slug,
      description: params.description?.trim(),
      plan,
      settings: {
        ...DEFAULT_SETTINGS,
        ...planLimits,
      },
      members: [],
      createdAt: now,
      updatedAt: now,
    }));
  }

  /**
   * Reconstitute from persistence.
   */
  static fromPersistence(params: {
    id: string;
    name: string;
    slug: string;
    description?: string;
    plan: OrganizationPlan;
    settings: OrganizationSettings;
    members: OrganizationMember[];
    createdAt: Date;
    updatedAt: Date;
  }): Organization {
    return new Organization(params);
  }

  /**
   * Add a member to the organization.
   */
  addMember(userId: string): Result<Organization> {
    if (!userId || userId.trim().length === 0) {
      return err(new ValidationError('User ID is required'));
    }

    // Check for duplicate
    if (this._members.some(m => m.userId === userId)) {
      return err(new ConflictError(`User '${userId}' is already a member of this organization`));
    }

    // Check user limit
    if (this.isAtUserLimit) {
      return err(new ValidationError(
        `Organization has reached its member limit (${this.settings.maxUsers}). Upgrade your plan to add more members.`,
      ));
    }

    const newMembers = [...this._members, { userId, joinedAt: new Date() }];

    return ok(new Organization({
      id: this.id,
      name: this.name,
      slug: this.slug,
      description: this.description,
      plan: this.plan,
      settings: this.settings,
      members: newMembers,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    }));
  }

  /**
   * Remove a member from the organization.
   */
  removeMember(userId: string): Result<Organization> {
    if (!userId || userId.trim().length === 0) {
      return err(new ValidationError('User ID is required'));
    }

    const memberIndex = this._members.findIndex(m => m.userId === userId);
    if (memberIndex === -1) {
      return err(new ValidationError(`User '${userId}' is not a member of this organization`));
    }

    // Cannot remove last member
    if (this._members.length === 1) {
      return err(new ValidationError('Cannot remove the last member of an organization'));
    }

    const newMembers = this._members.filter(m => m.userId !== userId);

    return ok(new Organization({
      id: this.id,
      name: this.name,
      slug: this.slug,
      description: this.description,
      plan: this.plan,
      settings: this.settings,
      members: newMembers,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    }));
  }

  /**
   * Check if a user is a member.
   */
  isMember(userId: string): boolean {
    return this._members.some(m => m.userId === userId);
  }

  /**
   * Update organization metadata.
   */
  updateMetadata(params: {
    name?: string;
    description?: string;
  }): Result<Organization> {
    const newName = params.name ?? this.name;
    if (newName.trim().length === 0) {
      return err(new ValidationError('Organization name cannot be empty'));
    }
    if (newName.length > MAX_NAME_LENGTH) {
      return err(new ValidationError(`Organization name must be ${MAX_NAME_LENGTH} characters or less`));
    }
    if (params.description !== undefined && params.description.length > MAX_DESCRIPTION_LENGTH) {
      return err(new ValidationError(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`));
    }

    return ok(new Organization({
      id: this.id,
      name: newName.trim(),
      slug: this.slug,
      description: params.description !== undefined ? params.description.trim() : this.description,
      plan: this.plan,
      settings: this.settings,
      members: this._members,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    }));
  }

  /**
   * Upgrade or change the organization plan.
   */
  changePlan(plan: OrganizationPlan): Result<Organization> {
    const planLimits = PLAN_LIMITS[plan];

    // Downgrade check: make sure current usage fits within new limits
    if (this._members.length > planLimits.maxUsers) {
      return err(new ValidationError(
        `Cannot downgrade to '${plan}' plan: current member count (${this._members.length}) exceeds the limit (${planLimits.maxUsers})`,
      ));
    }

    return ok(new Organization({
      id: this.id,
      name: this.name,
      slug: this.slug,
      description: this.description,
      plan,
      settings: {
        ...this.settings,
        ...planLimits,
      },
      members: this._members,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    }));
  }

  /**
   * Update organization settings.
   */
  updateSettings(settings: Partial<OrganizationSettings>): Result<Organization> {
    return ok(new Organization({
      id: this.id,
      name: this.name,
      slug: this.slug,
      description: this.description,
      plan: this.plan,
      settings: {
        ...this.settings,
        ...settings,
      },
      members: this._members,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    }));
  }
}
