import { DEFAULT_APPLICATION_ID } from '@/constants';
import { DiscordRPC, ActivityBuilder } from '@/index';
import { RandomFox } from './fox';

async function example() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error('DISCORD_TOKEN environment variable is not set');
    process.exit(1);
  }

  const rpc = new DiscordRPC(token, DEFAULT_APPLICATION_ID);

  rpc.on('ready', () => {
    console.log('connected to dihcord');
  });

  rpc.on('error', (error) => {
    console.error('rpc err:', error);
  });

  rpc.on('disconnected', ({ code, reason }) => {
    console.log(`Disconnected: ${code} - ${reason}`);
  });

  await rpc.connect();

  console.log('setting activity...');
  const builder = new ActivityBuilder()
    .setName('Test Activity')
    .setType(0)
    .setDetails('This is a test details')
    .setState('Test state')
    .setLargeImage(await RandomFox.gib(), 'Large image tooltip')
    .setSmallImage(await RandomFox.gib(), 'Small image tooltip')
    .setButtons(['Button 1', 'Button 2'], ['https://e621.net', 'https://xwx.gg'])
    .setTimestampMode('start-end')
    .setTimestamps();

  // await rpc.setActivity(builder);

  console.log('waiting 10 seconds before clearing activity...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  await rpc.clearActivity();
  console.log('activity cleared!');

  rpc.disconnect();
  console.log('disconnected');
}

example().catch(console.error);
