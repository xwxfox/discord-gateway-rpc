import { DiscordRPC } from '@/index';

async function buttonsTest() {
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
        console.error('DISCORD_TOKEN environment variable is not set');
        process.exit(1);
    }

    const rpc = new DiscordRPC(token, "1429085779367428219");

    rpc.on('ready', () => {
        console.log('connected to dihcord gateway');
    });

    rpc.on('error', (error) => {
        console.error('rpc err:', error.message);
    });

    console.log('connecting...');
    await rpc.connect();
    await rpc.clearActivity();
    console.log('activity cleared');
    rpc.disconnect();
    console.log('disconnected!');
}

buttonsTest().catch(console.error);
