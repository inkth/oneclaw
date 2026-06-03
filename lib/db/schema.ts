import { pgTable, text, timestamp, integer, real, boolean, jsonb } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  phone: text('phone').unique(),
  wechatId: text('wechat_id').unique(),
  email: text('email').unique(),
  image: text('image'),
  experienceLevel: text('experience_level', { enum: ['beginner', 'intermediate', 'advanced'] }).default('beginner'),
  budgetTier: text('budget_tier', { enum: ['low', 'medium', 'high'] }),
  preferredRegions: jsonb('preferred_regions').$type<string[]>().default([]),
  preferredCategories: jsonb('preferred_categories').$type<string[]>().default([]),
  onboardingCompleted: boolean('onboarding_completed').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const productFavorites = pgTable('product_favorites', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull(),
  region: text('region').notNull(),
  productName: text('product_name'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const influencerOutreach = pgTable('influencer_outreach', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  influencerId: text('influencer_id').notNull(),
  influencerName: text('influencer_name'),
  productId: text('product_id'),
  region: text('region').notNull(),
  status: text('status', {
    enum: ['contacted', 'sample_sent', 'content_posted', 'sale_made', 'rejected'],
  }).default('contacted'),
  templateUsed: text('template_used'),
  contactedAt: timestamp('contacted_at').defaultNow(),
  respondedAt: timestamp('responded_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const supplierBookmarks = pgTable('supplier_bookmarks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  supplierUrl: text('supplier_url').notNull(),
  supplierName: text('supplier_name'),
  productId: text('product_id'),
  notes: text('notes'),
  rating: integer('rating'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userTasks = pgTable('user_tasks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  taskType: text('task_type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  completed: boolean('completed').default(false),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const profitCalculations = pgTable('profit_calculations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull(),
  region: text('region').notNull(),
  sourcingCost: real('sourcing_cost'),
  shippingCost: real('shipping_cost'),
  platformFee: real('platform_fee'),
  commissionRate: real('commission_rate'),
  sellingPrice: real('selling_price'),
  estimatedProfit: real('estimated_profit'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
