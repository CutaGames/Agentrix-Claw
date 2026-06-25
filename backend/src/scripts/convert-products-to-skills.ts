/**
 * Script to convert existing products to skills
 * 
 * Run: npx ts-node src/scripts/convert-products-to-skills.ts
 */

import { AppDataSource } from '../config/data-source';
import { Product, ProductType } from '../entities/product.entity';
import { Skill, SkillCategory, SkillLayer, SkillResourceType, SkillSource, SkillStatus, SkillPricingType } from '../entities/skill.entity';
import { User } from '../entities/user.entity';
import { Repository } from 'typeorm';

async function convertProductsToSkills() {
  console.log('Starting product to skill conversion...');
  
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const productRepo = AppDataSource.getRepository(Product);
    const skillRepo = AppDataSource.getRepository(Skill);
    const userRepo = AppDataSource.getRepository(User);

    const products = await productRepo.find({
      relations: ['merchant']
    });

    console.log(`Found ${products.length} products to evaluate.`);

    let convertedCount = 0;
    let skippedCount = 0;

    for (const product of products) {
      // Check if skill already exists for this product
      const existingSkill = await skillRepo.findOne({
        where: { productId: product.id }
      });

      if (existingSkill) {
        skippedCount++;
        continue;
      }

      // Determine resource type
      let resourceType: SkillResourceType = SkillResourceType.PHYSICAL;
      if (product.productType === ProductType.SERVICE) {
        resourceType = SkillResourceType.SERVICE;
      } else if (product.productType === ProductType.NFT || product.productType === ProductType.FT || product.productType === ProductType.GAME_ASSET) {
        resourceType = SkillResourceType.DIGITAL;
      }

      // Extract image from product metadata
      const metadata = product.metadata as any;
      const imageUrl = metadata?.image 
        || metadata?.imageUrl 
        || metadata?.core?.media?.images?.[0]?.url
        || metadata?.core?.media?.images?.[0]
        || null;

      // Create new Skill
      const skill = new Skill();
      skill.name = `buy_${product.name.toLowerCase().replace(/\s+/g, '_')}`;
      skill.displayName = product.name;
      skill.description = product.description || `Purchase ${product.name}`;
      skill.category = SkillCategory.COMMERCE;
      skill.layer = SkillLayer.RESOURCE;
      skill.resourceType = resourceType;
      skill.source = SkillSource.CONVERTED;
      skill.status = SkillStatus.PUBLISHED;
      skill.version = '1.0.0';
      skill.productId = product.id;
      skill.authorId = product.merchantId;
      skill.imageUrl = imageUrl;
      skill.thumbnailUrl = imageUrl;
      
      // Setup Executor
      skill.executor = {
        type: 'internal',
        internalHandler: 'create_order'
      };

      // Setup Input Schema (for checkout)
      skill.inputSchema = {
        type: 'object',
        properties: {
          productId: {
            type: 'string',
            description: 'The product ID to purchase',
            default: product.id
          },
          quantity: {
            type: 'number',
            description: 'Quantity to purchase',
            default: 1
          }
        },
        required: ['productId']
      };

      // Setup Pricing - include pricePerCall
      skill.pricing = {
        type: SkillPricingType.REVENUE_SHARE,
        pricePerCall: Number(product.price) || 0,
        commissionRate: Number(product.commissionRate) || 10,
        currency: 'USD',
      };

      // Copy category as tag
      skill.tags = [product.category, 'product', 'commerce'];

      // Store original product info in metadata
      skill.metadata = {
        ...(metadata || {}),
        image: imageUrl,
        originalProduct: {
          id: product.id,
          price: product.price,
          category: product.category,
        }
      };

      // Human accessible by default
      skill.humanAccessible = true;
      skill.compatibleAgents = ['all'];
      skill.permissions = ['read'];

      // UCP enabled by default
      skill.ucpEnabled = true;

      await skillRepo.save(skill);
      convertedCount++;
      console.log(`✅ Converted: ${product.name} -> ${skill.name}`);
    }

    console.log(`\n✅ Conversion completed!`);
    console.log(`   - Converted: ${convertedCount} products`);
    console.log(`   - Skipped: ${skippedCount} (already exist)`);

  } catch (error) {
    console.error('Failed to convert products:', error);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

// Run the script
convertProductsToSkills();
