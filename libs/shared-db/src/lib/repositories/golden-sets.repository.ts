import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { goldenSets, goldenSetExamples, calibrationRuns } from '../schema';
import { eq, desc } from 'drizzle-orm';

type RequiredGoldenSetCreateCols = 'name' | 'organizationId' | 'createdBy';

type CreateGoldenSetInput = Pick<
  typeof goldenSets.$inferSelect,
  RequiredGoldenSetCreateCols
> &
  Partial<
    Omit<
      typeof goldenSets.$inferSelect,
      RequiredGoldenSetCreateCols | 'id' | 'createdAt' | 'updatedAt'
    >
  >;

type RequiredExampleCreateCols =
  | 'goldenSetId' | 'output' | 'humanLabel' | 'createdBy' | 'organizationId';

type AddExampleInput = Pick<
  typeof goldenSetExamples.$inferSelect,
  RequiredExampleCreateCols
> &
  Partial<
    Omit<
      typeof goldenSetExamples.$inferSelect,
      RequiredExampleCreateCols | 'id' | 'createdAt'
    >
  >;

type RequiredCalibrationRunCreateCols =
  | 'goldenSetId'
  | 'judgeEvaluator'
  | 'agreementRate'
  | 'isCalibrated'
  | 'sampleCount'
  | 'organizationId'
  | 'triggeredBy';

type CreateCalibrationRunInput = Pick<
  typeof calibrationRuns.$inferSelect,
  RequiredCalibrationRunCreateCols
> &
  Partial<
    Omit<
      typeof calibrationRuns.$inferSelect,
      RequiredCalibrationRunCreateCols | 'id' | 'createdAt'
    >
  >;

@Injectable()
export class GoldenSetsRepository {
  async createGoldenSet(
    data: CreateGoldenSetInput,
  ): Promise<typeof goldenSets.$inferSelect> {
    const [row] = await db.insert(goldenSets).values(data).returning();
    return row;
  }

  async findGoldenSetById(
    id: string,
  ): Promise<typeof goldenSets.$inferSelect | undefined> {
    const [row] = await db
      .select()
      .from(goldenSets)
      .where(eq(goldenSets.id, id));
    return row;
  }

  async listGoldenSets(
    organizationId: string,
  ): Promise<(typeof goldenSets.$inferSelect)[]> {
    return db
      .select()
      .from(goldenSets)
      .where(eq(goldenSets.organizationId, organizationId));
  }

  async addExample(
    data: AddExampleInput,
  ): Promise<typeof goldenSetExamples.$inferSelect> {
    const [row] = await db.insert(goldenSetExamples).values(data).returning();
    return row;
  }

  async listExamples(
    goldenSetId: string,
  ): Promise<(typeof goldenSetExamples.$inferSelect)[]> {
    return db
      .select()
      .from(goldenSetExamples)
      .where(eq(goldenSetExamples.goldenSetId, goldenSetId));
  }

  async createCalibrationRun(
    data: CreateCalibrationRunInput,
  ): Promise<typeof calibrationRuns.$inferSelect> {
    const [row] = await db.insert(calibrationRuns).values(data).returning();
    return row;
  }

  async listCalibrationRuns(
    goldenSetId: string,
  ): Promise<(typeof calibrationRuns.$inferSelect)[]> {
    return db
      .select()
      .from(calibrationRuns)
      .where(eq(calibrationRuns.goldenSetId, goldenSetId));
  }

  async findLatestCalibrationRun(
    goldenSetId: string,
  ): Promise<typeof calibrationRuns.$inferSelect | undefined> {
    const [row] = await db
      .select()
      .from(calibrationRuns)
      .where(eq(calibrationRuns.goldenSetId, goldenSetId))
      .orderBy(desc(calibrationRuns.createdAt))
      .limit(1);
    return row;
  }
}
