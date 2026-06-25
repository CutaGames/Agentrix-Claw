import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * P-9 wave 13 — add Mood_Diary_Push tracking columns to pet_diary.
 *
 *   - last_viewed_at TIMESTAMPTZ nullable — set when client posts a diary
 *     view OR when the wave-11 mood-diary intent handler fires.
 *   - last_pushed_at TIMESTAMPTZ nullable — bumped by MoodDiaryPushService
 *     when an Expo push is successfully accepted.
 *   - consecutive_push_misses SMALLINT default 0 — ≥7 → weekly backoff.
 */
export class AddPetDiaryPushTracking1796000000000 implements MigrationInterface {
  name = 'AddPetDiaryPushTracking1796000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('pet_diary', [
      new TableColumn({
        name: 'last_viewed_at',
        type: 'timestamptz',
        isNullable: true,
      }),
      new TableColumn({
        name: 'last_pushed_at',
        type: 'timestamptz',
        isNullable: true,
      }),
      new TableColumn({
        name: 'consecutive_push_misses',
        type: 'smallint',
        default: 0,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('pet_diary', [
      'last_viewed_at',
      'last_pushed_at',
      'consecutive_push_misses',
    ]);
  }
}
