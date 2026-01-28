export class RandomFox {
  private constructor() {}
  public static async gib(): Promise<string> {
    const response = await fetch("https://randomfox.ca/floof/");
    const data = (await response.json()) as { image: string; link: string };
    return data.image;
  }
}
