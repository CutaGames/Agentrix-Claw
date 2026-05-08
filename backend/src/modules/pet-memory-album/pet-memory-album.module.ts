import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PetMemoryAlbum } from '../../entities/pet-memory-album.entity';
import { PetMemoryAlbumService } from './pet-memory-album.service';
import { PetMemoryAlbumController } from './pet-memory-album.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PetMemoryAlbum])],
  controllers: [PetMemoryAlbumController],
  providers: [PetMemoryAlbumService],
  exports: [PetMemoryAlbumService],
})
export class PetMemoryAlbumModule {}
