const { Client } = require('discord.js-selfbot-v13');
const fs = require('fs');
const client = new Client({ checkUpdate: false });

// Config
const TARGET_SERVER = '712837926811074660';
const TARGET_VOICE_CHANNEL = '1383486330733854832';
const LOG_FILE = 'server_log.txt';

// Improved logging
function logToFile(message) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
}

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    logToFile(`Bot started as ${client.user.tag}`);
    
    // Join the target voice channel immediately on startup
    await joinVoiceChannel();
    
    // Set up periodic checks to ensure we stay in the voice channel
    setInterval(async () => {
        await joinVoiceChannel();
    }, 30000); // Check every 30 seconds
});

async function joinVoiceChannel() {
    try {
        const guild = client.guilds.cache.get(TARGET_SERVER);
        if (!guild) {
            console.log('Target server not found');
            return;
        }

        const voiceChannel = guild.channels.cache.get(TARGET_VOICE_CHANNEL);
        if (!voiceChannel) {
            console.log('Target voice channel not found');
            return;
        }

        // Check if already in the voice channel
        const voiceConnection = guild.voiceStates.cache.get(client.user.id);
        if (voiceConnection && voiceConnection.channelId === TARGET_VOICE_CHANNEL) {
            return; // Already in the correct channel
        }

        // Join the voice channel
        await voiceChannel.join();
        console.log(`Joined voice channel: ${voiceChannel.name}`);
        logToFile(`Joined voice channel: ${voiceChannel.name}`);
    } catch (error) {
        console.error('Error joining voice channel:', error);
        logToFile(`Error joining voice channel: ${error.message}`);
    }
}

// Voice state monitoring
client.on('voiceStateUpdate', (oldState, newState) => {
    if (newState.member.id === client.user.id && newState.channelId !== TARGET_VOICE_CHANNEL) {
        // We got moved/disconnected from our target channel
        setTimeout(() => joinVoiceChannel(), 5000); // Try to rejoin after 5 seconds
    }
});

// Error handling
process.on('unhandledRejection', error => {
    console.error('Unhandled rejection:', error);
    logToFile(`Unhandled rejection: ${error.message}`);
});

client.login('token');
