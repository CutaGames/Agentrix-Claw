/**
 * Script to fix existing skills that are missing pricePerCall and imageUrl
 * These skills were created by an older version of convert-products-to-skills.ts
 * 
 * Run: npx ts-node src/scripts/fix-skill-pricing-images.ts
 */

import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(__dirname, '../../.env') });

async function fixSkillPricingAndImages() {
  console.log('🔧 Starting skill pricing and image fix...\n');

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'paymind',
  });

  try {
    await dataSource.initialize();
    console.log('✅ Database connected\n');

    // Get all skills that have a productId (converted from products)
    const skillsResult = await dataSource.query(`
      SELECT id, name, pricing, "imageUrl", "thumbnailUrl", "productId"
      FROM skills
      WHERE "productId" IS NOT NULL
    `);

    console.log(`📊 Found ${skillsResult.length} skills converted from products\n`);

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const skill of skillsResult) {
      try {
        // Check if skill needs fixing
        const pricing = skill.pricing || {};
        const needsPriceFix = !pricing.pricePerCall && pricing.pricePerCall !== 0;
        const needsImageFix = !skill.imageUrl;

        if (!needsPriceFix && !needsImageFix) {
          skippedCount++;
          continue;
        }

        // Find the linked product
        const productResult = await dataSource.query(`
          SELECT id, name, price, metadata
          FROM products
          WHERE id = $1
        `, [skill.productId]);

        if (productResult.length === 0) {
          console.log(`⚠️  Product not found for skill: ${skill.name} (productId: ${skill.productId})`);
          skippedCount++;
          continue;
        }

        const product = productResult[0];
        const updates: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        // Fix pricing
        if (needsPriceFix) {
          const newPricing = {
            ...pricing,
            pricePerCall: Number(product.price) || 0,
          };
          updates.push(`pricing = $${paramIndex}`);
          params.push(JSON.stringify(newPricing));
          paramIndex++;
        }

        // Fix image
        if (needsImageFix) {
          let imageUrl: string | null = null;
          
          // Extract image from metadata
          if (product.metadata) {
            const metadata = typeof product.metadata === 'string' 
              ? JSON.parse(product.metadata) 
              : product.metadata;
            
            imageUrl = metadata.image 
              || metadata.imageUrl 
              || metadata.core?.media?.images?.[0]?.url
              || metadata.images?.[0]
              || null;
          }

          if (imageUrl) {
            updates.push(`"imageUrl" = $${paramIndex}`);
            params.push(imageUrl);
            paramIndex++;
            
            updates.push(`"thumbnailUrl" = $${paramIndex}`);
            params.push(imageUrl);
            paramIndex++;
          }
        }

        if (updates.length > 0) {
          params.push(skill.id);
          const updateQuery = `
            UPDATE skills 
            SET ${updates.join(', ')}, "updatedAt" = NOW()
            WHERE id = $${paramIndex}
          `;
          
          await dataSource.query(updateQuery, params);
          
          const changes: string[] = [];
          if (needsPriceFix) changes.push(`price=${product.price}`);
          if (needsImageFix && params.length > 2) changes.push('image');
          
          console.log(`✅ Updated: ${skill.name} (${changes.join(', ')})`);
          updatedCount++;
        }

      } catch (error) {
        console.error(`❌ Error updating skill ${skill.name}:`, error);
        errorCount++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   ✅ Updated: ${updatedCount}`);
    console.log(`   ⏭️  Skipped: ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log('\n🎉 Done!');

  } catch (error) {
    console.error('❌ Database error:', error);
    throw error;
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

// Run the script
fixSkillPricingAndImages()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
