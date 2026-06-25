import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SlashCommand, SlashCommandSource } from '../../entities/slash-command.entity';

@Injectable()
export class SlashCommandService {
  private readonly logger = new Logger(SlashCommandService.name);

  constructor(
    @InjectRepository(SlashCommand)
    private readonly commandRepo: Repository<SlashCommand>,
  ) {}

  /**
   * List all commands available to a user (builtin + user-defined + plugin).
   */
  async listCommands(userId: string): Promise<SlashCommand[]> {
    return this.commandRepo
      .createQueryBuilder('cmd')
      .where('(cmd.userId = :userId OR cmd.userId IS NULL)', { userId })
      .andWhere('cmd.isEnabled = true')
      .orderBy('cmd.source', 'ASC')
      .addOrderBy('cmd.name', 'ASC')
      .getMany();
  }

  /**
   * Get a specific command by name for a user.
   */
  async getCommand(userId: string, name: string): Promise<SlashCommand | null> {
    return this.commandRepo.findOne({
      where: [
        { userId, name, isEnabled: true },
        { userId: undefined, name, isEnabled: true },
      ],
      order: { source: 'ASC' }, // user-defined wins over builtin
    });
  }

  /**
   * Execute a custom slash command — resolve the prompt template with arguments.
   */
  resolveCommandPrompt(command: SlashCommand, args: string): string {
    let prompt = command.promptTemplate;

    // Replace {{args}} placeholder with the raw argument string
    prompt = prompt.replace(/\{\{args\}\}/g, args);

    // Replace named parameters {{param_name}} if the command has parameter definitions
    if (command.parameters?.length) {
      const argParts = args.split(/\s+/);
      command.parameters.forEach((param, i) => {
        const value = argParts[i] || '';
        prompt = prompt.replace(new RegExp(`\\{\\{${param.name}\\}\\}`, 'g'), value);
      });
    }

    return prompt;
  }

  /**
   * Create a user-defined command.
   */
  async createCommand(userId: string, data: {
    name: string;
    description?: string;
    promptTemplate: string;
    parameters?: SlashCommand['parameters'];
  }): Promise<SlashCommand> {
    // Normalize name: strip leading / if present
    const name = data.name.replace(/^\//, '').toLowerCase();

    const existing = await this.commandRepo.findOne({ where: { userId, name } });
    if (existing) {
      // Update existing
      Object.assign(existing, { ...data, name });
      return this.commandRepo.save(existing);
    }

    const cmd = this.commandRepo.create({
      ...data,
      name,
      userId,
      source: SlashCommandSource.USER,
      isEnabled: true,
    });
    return this.commandRepo.save(cmd);
  }

  /**
   * Delete a user-defined command.
   */
  async deleteCommand(userId: string, commandId: string): Promise<boolean> {
    const result = await this.commandRepo.delete({ id: commandId, userId });
    return (result.affected || 0) > 0;
  }

  /**
   * Register a plugin-provided command.
   */
  async registerPluginCommand(pluginId: string, data: {
    name: string;
    description?: string;
    promptTemplate: string;
    parameters?: SlashCommand['parameters'];
  }): Promise<SlashCommand> {
    const name = data.name.replace(/^\//, '').toLowerCase();
    const existing = await this.commandRepo.findOne({ where: { pluginId, name } });
    if (existing) {
      Object.assign(existing, data);
      return this.commandRepo.save(existing);
    }

    const cmd = this.commandRepo.create({
      ...data,
      name,
      source: SlashCommandSource.PLUGIN,
      pluginId,
      isEnabled: true,
    });
    return this.commandRepo.save(cmd);
  }
}
