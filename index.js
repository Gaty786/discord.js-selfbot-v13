const { Client } = require('discord.js-selfbot-v13');
const fs = require('fs');
require('dotenv').config(); // Load environment variables from .env file

const client = new Client({ checkUpdate: false });

// Config from environment variables
const TARGET_SERVER = process.env.TARGET_SERVER;
const TARGET_CATEGORY = process.env.TARGET_CATEGORY;
const SPECIAL_ROLE = process.env.SPECIAL_ROLE;
const LOG_FILE = process.env.LOG_FILE || 'server_log.txt';

// Validate required environment variables
const requiredVars = ['TARGET_SERVER', 'TARGET_CATEGORY', 'SPECIAL_ROLE', 'DISCORD_TOKEN'];
for (const varName of requiredVars) {
    if (!process.env[varName]) {
        console.error(`Missing required environment variable: ${varName}`);
        process.exit(1);
    }
}

// Improved logging
function logToFile(message) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    logToFile(`Bot started as ${client.user.tag}`);
});

// Message logging
client.on('messageCreate', (message) => {
    if (message.guild?.id === TARGET_SERVER) {
        logToFile(`Message in #${message.channel.name} from ${message.author.tag}: ${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}`);
    }
});

// Voice activity logging
client.on('voiceStateUpdate', (oldState, newState) => {
    if (oldState.guild.id !== TARGET_SERVER) return;

    const member = newState.member || oldState.member;
    if (!member) return;

    if (!oldState.channelId && newState.channelId) {
        logToFile(`${member.user.tag} joined voice channel ${newState.channel.name}`);
    } else if (oldState.channelId && !newState.channelId) {
        logToFile(`${member.user.tag} left voice channel ${oldState.channel.name}`);
    } else if (oldState.channelId !== newState.channelId) {
        logToFile(`${member.user.tag} switched from ${oldState.channel.name} to ${newState.channel.name}`);
    }
});

// Template sending (original functionality)
client.on('channelCreate', async (channel) => {
    try {
        if (channel.guild.id === TARGET_SERVER && channel.parentId === TARGET_CATEGORY) {
            logToFile(`New channel created: #${channel.name}`);

            const guild = channel.guild;
            await guild.members.fetch();

            const targetMembers = guild.members.cache.filter(member => 
                member.roles.cache.size === 1 && 
                member.roles.cache.has(SPECIAL_ROLE)
            );

            const mention = targetMembers.size > 0 ? targetMembers.first().toString() : '';
            const message = `Hello there, please follow the template${mention ? ` (${mention})` : ''}.
<@&1312606279998640241>
**TEMPLATE:**
Your In-Game Name:
Your Steam ID:
Robber In-Game Name:
Robber Steam64ID:
Items Robbed:
Evidence:`;

            await channel.send(message);
        }
    } catch (error) {
        console.error('Error:', error);
        logToFile(`Error: ${error.message}`);
    }
});

// Error handling
process.on('unhandledRejection', error => {
    console.error('Unhandled rejection:', error);
    logToFile(`Unhandled rejection: ${error.message}`);
});

client.login(process.env.DISCORD_TOKEN);
