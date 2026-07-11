import { AllowNull, Column, DataType, Model, Table } from 'sequelize-typescript';
import { Platform, TranscriptSource, TranscriptStatus } from '../types';

@Table({ tableName: 'transcripts', timestamps: true, underscored: true })
export class Transcript extends Model {
  @AllowNull(false)
  @Column(DataType.TEXT)
  url!: string;

  @Column(DataType.STRING)
  platform!: Platform;

  @Column(DataType.TEXT)
  title!: string | null;

  @AllowNull(false)
  @Column(DataType.STRING)
  status!: TranscriptStatus;

  @Column(DataType.STRING)
  source!: TranscriptSource | null;

  @Column(DataType.TEXT)
  text!: string | null;

  @Column(DataType.TEXT)
  error!: string | null;

  @Column(DataType.INTEGER)
  durationSeconds!: number | null;

  declare createdAt: Date;
  declare updatedAt: Date;
}
