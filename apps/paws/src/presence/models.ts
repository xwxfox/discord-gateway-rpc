import { z } from 'zod';

export const TimestampsSchema = z.object({
  start: z.number().nullable().optional(),
  end: z.number().nullable().optional()
});

export type Timestamps = z.infer<typeof TimestampsSchema>;

const imageUrlSchema = z.string().max(256).refine(
  (val) => {
    if (!val) return true;
    try {
      new URL(val);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Must be a valid URL or empty string' }
);

export const AssetsSchema = z.object({
  large_image: imageUrlSchema.nullable().optional(),
  small_image: imageUrlSchema.nullable().optional(),
  large_text: z.string().max(128).nullable().optional(),
  small_text: z.string().max(128).nullable().optional(),
  large_image_url: imageUrlSchema.nullable().optional(),
  small_image_url: imageUrlSchema.nullable().optional()
});

export type Assets = z.infer<typeof AssetsSchema>;

export const PartySchema = z.object({
  id: z.string().max(128),
  size: z.tuple([z.number().min(0), z.number().min(0)])
});

export type Party = z.infer<typeof PartySchema>;

export const ButtonSchema = z.object({
  label: z.string().max(32),
  url: z.string().url().nullable().optional()
});

export type Button = z.infer<typeof ButtonSchema>;

export const MetadataSchema = z.object({
  button_urls: z.array(z.string().url()).max(2).nullable().optional()
});
export type Metadata = z.infer<typeof MetadataSchema>;

export const ActivityTypeSchema = z.enum(['0', '1', '2', '3', '4', '5']).transform(Number);

export type ActivityType = 0 | 1 | 2 | 3 | 4 | 5;

export const ActivitySchema = z.object({
  name: z.string().max(128),
  state: z.string().max(128).nullable().optional(),
  details: z.string().max(128).nullable().optional(),
  type: z.number().int().min(0).max(5).optional().default(0),
  platform: z.string().max(128).nullable().optional(),
  timestamps: TimestampsSchema.nullable().optional(),
  assets: AssetsSchema.nullable().optional(),
  buttons: z.array(z.string().max(32)).max(2).nullable().optional(),
  metadata: MetadataSchema.nullable().optional(),
  application_id: z.string().nullable().optional(),
  url: z.string().url().nullable().optional(),
  party: PartySchema.nullable().optional()
});

export type Activity = z.infer<typeof ActivitySchema>;

export const StatusSchema = z.enum(['online', 'idle', 'dnd', 'invisible', 'offline']);

export type Status = z.infer<typeof StatusSchema>;

export const PresenceSchema = z.object({
  activities: z.array(ActivitySchema.nullable()).nullable().optional(),
  afk: z.boolean().optional().default(true),
  since: z.number().nullable().optional(),
  status: StatusSchema.optional().default('online')
});

export type Presence = z.infer<typeof PresenceSchema>;
