const { Client } = require('discord.js-selfbot-v13');
const fs = require('fs');
const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const client = new Client({ checkUpdate: false });

// Config from environment variables
const TARGET_SERVER = process.env.TARGET_SERVER;
const TARGET_CATEGORY = process.env.TARGET_CATEGORY;
const SPECIAL_ROLE = process.env.SPECIAL_ROLE;
const LOG_FILE = process.env.LOG_FILE || 'server_log.txt';
const WEB_PORT = process.env.WEB_PORT || 3000;

// Data storage for web interface
let botStatus = {
    loggedIn: false,
    username: null,
    avatar: null,
    guilds: [],
    messages: [],
    voiceActivities: []
};

// Create web server
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => {
    res.render('status', {
        status: botStatus,
        messages: botStatus.messages.slice().reverse(), // Show newest first
        voiceActivities: botStatus.voiceActivities.slice().reverse()
    });
});

app.get('/data', (req, res) => {
    res.json(botStatus);
});

app.listen(WEB_PORT, () => {
    console.log(`Web interface available at http://localhost:${WEB_PORT}`);
});

// Improved logging that also stores data for web interface
function logToFile(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    fs.appendFileSync(LOG_FILE, logEntry + '\n');
    
    // Store for web interface
    botStatus.messages.push({
        timestamp,
        content: message
    });
    
    // Keep only the last 100 messages
    if (botStatus.messages.length > 100) {
        botStatus.messages.shift();
    }
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    botStatus = {
        ...botStatus,
        loggedIn: true,
        username: client.user.tag,
        avatar: client.user.displayAvatarURL({ size: 256 }),
        guilds: client.guilds.cache.map(g => g.name)
    };
    logToFile(`Bot started as ${client.user.tag}`);
});

client.on('messageCreate', (message) => {
    if (message.guild?.id === TARGET_SERVER) {
        const shortContent = `${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}`;
        logToFile(`Message in #${message.channel.name} from ${message.author.tag}: ${shortContent}`);
    }
});

client.on('voiceStateUpdate', (oldState, newState) => {
    if (oldState.guild.id !== TARGET_SERVER) return;

    const member = newState.member || oldState.member;
    if (!member) return;

    let activity;
    if (!oldState.channelId && newState.channelId) {
        activity = `${member.user.tag} joined voice channel ${newState.channel.name}`;
    } else if (oldState.channelId && !newState.channelId) {
        activity = `${member.user.tag} left voice channel ${oldState.channel.name}`;
    } else if (oldState.channelId !== newState.channelId) {
        activity = `${member.user.tag} switched from ${oldState.channel.name} to ${newState.channel.name}`;
    }

    if (activity) {
        logToFile(activity);
        botStatus.voiceActivities.push({
            timestamp: new Date().toISOString(),
            content: activity
        });
        
        if (botStatus.voiceActivities.length > 50) {
            botStatus.voiceActivities.shift();
        }
    }
});

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

process.on('unhandledRejection', error => {
    console.error('Unhandled rejection:', error);
    logToFile(`Unhandled rejection: ${error.message}`);
});

client.login(process.env.DISCORD_TOKEN);
