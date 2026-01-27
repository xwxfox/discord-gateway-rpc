import type { Activity, ActivityType, Timestamps, Assets, Party, Metadata } from './models';
import { ActivitySchema } from './models';

export type TimestampMode = 'none' | 'start' | 'end' | 'start-end';

export class ActivityBuilder {
  private name: string = '';
  private type: ActivityType = 0;
  private state: string | null = null;
  private details: string | null = null;
  private platform: string | null = null;
  private largeImage: string | null = null;
  private smallImage: string | null = null;
  private largeText: string | null = null;
  private smallText: string | null = null;
  private url: string | null = null;
  private applicationId: string | null = null;
  private buttons: string[] = [];
  private buttonUrls: string[] = [];
  private party: Party | null = null;
  private timestampMode: TimestampMode = 'none';
  private timestampStart: number | null = null;
  private timestampEnd: number | null = null;

  setName(name: string): this {
    this.name = name;
    return this;
  }

  setType(type: ActivityType): this {
    this.type = type;
    return this;
  }

  setState(state: string | null): this {
    this.state = state;
    return this;
  }

  setDetails(details: string | null): this {
    this.details = details;
    return this;
  }

  setPlatform(platform: string | null): this {
    this.platform = platform;
    return this;
  }

  setLargeImage(image: string | null, text: string | null = null): this {
    this.largeImage = image;
    this.largeText = text;
    return this;
  }

  setSmallImage(image: string | null, text: string | null = null): this {
    this.smallImage = image;
    this.smallText = text;
    return this;
  }

  setStreamUrl(url: string | null): this {
    this.url = url;
    return this;
  }

  setPartySize(current: number | null, max: number | null): this {
    if (current !== null && max !== null) {
      this.party = {
        id: 'discord-rpc',
        size: [current, max]
      };
    }
    return this;
  }

  setApplicationId(applicationId: string | null): this {
    this.applicationId = applicationId;
    return this;
  }

  setButtons(buttons: string[], urls?: string[]): this {
    this.buttons = buttons;
    if (urls) {
      this.buttonUrls = urls;
    } else {
      this.buttonUrls = [];
    }
    return this;
  }

  addButton(button: string, url?: string): this {
    this.buttons.push(button);
    if (url) {
      this.buttonUrls.push(url);
    }
    return this;
  }

  setTimestampMode(mode: TimestampMode): this {
    this.timestampMode = mode;
    return this;
  }

  setTimestampStart(start: number | null): this {
    this.timestampStart = start;
    return this;
  }

  setTimestampEnd(end: number | null): this {
    this.timestampEnd = end;
    return this;
  }

  setTimestamps(start: number | null = Date.now(), end: number | null = null): this {
    this.timestampMode = 'start-end';
    this.timestampStart = start;
    this.timestampEnd = end;
    return this;
  }

  private sanitizeString(value: string | null): string | null {
    if (!value) return null;
    return value.length > 128 ? value.substring(0, 128) : value;
  }

  build(): Activity {
    const timestamps: Timestamps | null = this.buildTimestamps();

    const assets: Assets | null =
      this.largeImage !== null || this.smallImage !== null
        ? {
          large_image: this.largeImage,
          small_image: this.smallImage,
          large_text: this.sanitizeString(this.largeText),
          small_text: this.sanitizeString(this.smallText)
        }
        : null;

    const metadata: Metadata | null =
      this.buttonUrls.length > 0
        ? {
          button_urls: this.buttonUrls
        }
        : null;

    const activityData: Record<string, unknown> = {
      name: this.name,
      type: this.type
    };

    if (this.state !== null) activityData.state = this.sanitizeString(this.state);
    if (this.details !== null) activityData.details = this.sanitizeString(this.details);
    if (this.platform !== null) activityData.platform = this.sanitizeString(this.platform);
    if (timestamps !== null) activityData.timestamps = timestamps;
    if (assets !== null) activityData.assets = assets;
    if (this.buttons.length > 0) activityData.buttons = this.buttons;
    if (metadata !== null) activityData.metadata = metadata;
    if (this.applicationId !== null) activityData.application_id = this.applicationId;
    if (this.url !== null) activityData.url = this.url;
    if (this.party !== null) activityData.party = this.party;

    return ActivitySchema.parse(activityData);
  }

  private buildTimestamps(): Timestamps | null {
    if (this.timestampMode === 'none') {
      return null;
    }

    let start: number | null = null;
    let end: number | null = null;

    if (this.timestampMode === 'start' || this.timestampMode === 'start-end') {
      start = this.timestampStart ?? Date.now();
    }

    if (this.timestampMode === 'end' || this.timestampMode === 'start-end') {
      end = this.timestampEnd;
    }

    if (start === null && end === null) {
      return null;
    }

    return {
      start,
      end
    };
  }
}
