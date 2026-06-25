import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConfig } from './src/config/database.config';

async function testModule(name: string, module: any) {
  console.log(`Testing module: ${name}...`);
  try {
    const app = await NestFactory.create(module, { logger: false });
    console.log(`Module ${name} initialized!`);
    await app.close();
  } catch (err) {
    console.error(`Module ${name} failed:`, err.message);
  }
}

async function run() {
  console.log('Starting module isolation test...');
  
  @Module({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      TypeOrmModule.forRootAsync({
        useClass: DatabaseConfig,
        inject: [DatabaseConfig],
      }),
    ],
    providers: [DatabaseConfig]
  })
  class DbModule {}
  
  await testModule('DatabaseOnly', DbModule);
  
  console.log('Isolation test finished.');
}

run();
